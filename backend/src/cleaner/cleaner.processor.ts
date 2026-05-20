import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import axios from 'axios';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { CloudflareService } from '../providers/cloudflare/cloudflare.service';
import { SpaceshipService } from '../providers/spaceship/spaceship.service';
import { GodaddyService } from '../providers/godaddy/godaddy.service';
import { NamecheapService } from '../providers/namecheap/namecheap.service';
import { DnsProvider } from '../providers/dns-provider.interface';
import { SyncService } from '../sync/sync.service';
import { CleanJobData } from '../domains/domains.service';

export class JobCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobCancelledError';
  }
}

@Processor('clean-queue-v2', { concurrency: 1 })
export class CleanerProcessor extends WorkerHost {
  private readonly logger = new Logger(CleanerProcessor.name);
  private redisClient: Redis;

  constructor(
    private prisma: PrismaService,
    private cloudflare: CloudflareService,
    private spaceship: SpaceshipService,
    private godaddy: GodaddyService,
    private namecheap: NamecheapService,
    private syncService: SyncService,
  ) {
    super();
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    });
  }

  private async checkCancellation(batchId?: string): Promise<void> {
    if (!batchId) return; // If no batchId is provided, we can't check batch-specific cancellation
    const cancelled = await this.redisClient.get(
      `mass_clean_cancelled:${batchId}`,
    );
    if (cancelled === '1') {
      this.logger.warn(
        `Mass clean cancelled for batch ${batchId}. Stopping worker execution gracefully.`,
      );
      throw new JobCancelledError(`Mass clean cancelled for batch ${batchId}`);
    }
  }

  private getProvider(providerName: string): DnsProvider {
    switch (providerName.toLowerCase()) {
      case 'cloudflare':
        return this.cloudflare;
      case 'spaceship':
        return this.spaceship;
      case 'godaddy':
        return this.godaddy;
      case 'namecheap':
        return this.namecheap;
      default:
        throw new Error(`Provider ${providerName} not supported`);
    }
  }

  async process(job: Job<CleanJobData, any, string>): Promise<any> {
    try {
      const { domainId, types, batchId } = job.data;
      await this.checkCancellation(batchId);

      this.logger.log(
        `Starting clean job for domain ${domainId} with types: ${types?.join(', ') || 'ALL'} (Batch: ${batchId || 'N/A'})`,
      );

      let domain = await this.prisma.domain.findUnique({
        where: { id: domainId },
        include: { account: true, records: true },
      });

      if (!domain) {
        throw new Error(`Domain ${domainId} not found`);
      }

      // JIT: Just-In-Time Records Sync. If no records are present in the DB locally,
      // fetch them dynamically from the provider API first before proceeding!
      if (domain.records.length === 0 && domain.recordsCount > 0) {
        this.logger.log(
          `No local records found for domain ${domain.domainName} but recordsCount is ${domain.recordsCount}. Triggering JIT record sync...`,
        );
        try {
          await this.syncService.syncDomainRecords(domainId);
          // Re-fetch domain with loaded records
          const updatedDomain = await this.prisma.domain.findUnique({
            where: { id: domainId },
            include: { account: true, records: true },
          });
          if (updatedDomain) {
            domain = updatedDomain;
          }
        } catch (error: any) {
          this.logger.error(
            `JIT Record sync failed for ${domain.domainName}: ${error.message}`,
          );
        }
      }

      const provider = this.getProvider(domain.provider);

      // Filter records by type if provided
      const shouldDeleteAll =
        !types || types.length === 0 || types.includes('ALL');

      const recordsToDelete = shouldDeleteAll
        ? domain.records
        : domain.records.filter((r) => types.includes(r.type));

      let deletedCount = 0;
      const total = recordsToDelete.length;

      if (total > 0) {
        if (domain.provider.toLowerCase() === 'namecheap') {
          this.logger.log(
            `Namecheap detected. Performing bulk delete in a single API transaction...`,
          );
          let attempts = 0;
          const maxAttempts = 3;
          let success = false;

          while (attempts < maxAttempts && !success) {
            attempts++;
            try {
              await this.checkCancellation(batchId);
              const apiKey = domain.account.apiKey;
              const apiSecret =
                domain.account.apiSecret || domain.account.email;

              // 1. Fetch CURRENT hosts from API to be 100% up-to-date
              const currentRecords = await this.namecheap.getRecords(
                domain.domainName,
                apiKey,
                apiSecret || '',
              );

              // 2. Filter out the ones we want to delete
              const recordProviderIdsToDelete = recordsToDelete.map(
                (r) => r.providerRecordId,
              );
              const remainingRecords = currentRecords.filter(
                (r) => !recordProviderIdsToDelete.includes(r.id),
              );

              // 3. Call setHosts with remaining records in a single POST call!
              const firstDotIndex = domain.domainName.indexOf('.');
              const sld =
                firstDotIndex !== -1
                  ? domain.domainName.substring(0, firstDotIndex)
                  : domain.domainName;
              const tld =
                firstDotIndex !== -1
                  ? domain.domainName.substring(firstDotIndex + 1)
                  : '';

              const params: any = {
                ApiKey: apiKey.trim(),
                ApiUser: (apiSecret || '').trim(),
                UserName: (apiSecret || '').trim(),
                ClientIp: '1.1.1.1',
                Command: 'namecheap.domains.dns.setHosts',
                SLD: sld,
                TLD: tld,
              };

              remainingRecords.forEach((r, i) => {
                const idx = i + 1;
                params[`HostName${idx}`] = r.name;
                params[`RecordType${idx}`] = r.type;
                params[`Address${idx}`] = r.content;
                params[`MXPref${idx}`] = r.priority || 10;
                params[`TTL${idx}`] = r.ttl;
              });

              const formData = new URLSearchParams();
              Object.entries(params).forEach(([key, val]) => {
                formData.append(key, String(val));
              });

              // Execute bulk setHosts on Namecheap API using POST body to prevent 414 URI Too Long!
              const setResponse = await axios.post(
                'https://api.namecheap.com/xml.response',
                formData,
                {
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                },
              );
              const xml = setResponse.data;

              if (xml.includes('Status="ERROR"')) {
                const errorMatch = xml.match(/<Error.*?>(.*?)<\/Error>/);
                const errorMsg = errorMatch
                  ? errorMatch[1]
                  : 'Unknown Namecheap API Error';
                throw new Error(errorMsg);
              }

              // 4. Update local DB for all deleted records in bulk!
              const recordIdsToDelete = recordsToDelete.map((r) => r.id);
              await this.prisma.record.deleteMany({
                where: { id: { in: recordIdsToDelete } },
              });

              deletedCount = total;
              await job.updateProgress(100);
              success = true;
            } catch (error: any) {
              this.logger.warn(
                `Namecheap bulk delete attempt ${attempts} failed: ${error.message}`,
              );
              if (attempts >= maxAttempts) {
                throw error;
              }
              // Sleep with backoff (5s, 10s) before retry
              const sleepTime = attempts * 5000;
              this.logger.log(
                `Sleeping ${sleepTime}ms before retrying bulk delete...`,
              );
              await new Promise((resolve) => setTimeout(resolve, sleepTime));
            }
          }
        } else {
          // Run normal sequential loop for other providers (Cloudflare, Spaceship, GoDaddy)
          for (let i = 0; i < total; i++) {
            await this.checkCancellation(batchId);
            const record = recordsToDelete[i];
            try {
              const apiKey = domain.account.apiKey;
              const apiSecret =
                domain.account.apiSecret || domain.account.email;

              // Execute on Provider API
              let domainIdentifier =
                domain.provider.toLowerCase() === 'cloudflare'
                  ? domain.providerDomainId
                  : domain.domainName;

              // Self-healing check for Cloudflare zone ID
              if (
                domain.provider.toLowerCase() === 'cloudflare' &&
                (!domainIdentifier || !/^[a-f0-9]{32}$/i.test(domainIdentifier))
              ) {
                this.logger.warn(
                  `Invalid Cloudflare Zone ID for ${domain.domainName} (${domainIdentifier}). Attempting to resolve dynamically...`,
                );
                const realZoneId = await this.cloudflare.getZoneIdByName(
                  domain.domainName,
                  apiKey,
                  apiSecret || undefined,
                );
                if (realZoneId) {
                  this.logger.log(
                    `Resolved Zone ID for ${domain.domainName}: ${realZoneId}. Updating database...`,
                  );
                  await this.prisma.domain.update({
                    where: { id: domain.id },
                    data: { providerDomainId: realZoneId },
                  });
                  domainIdentifier = realZoneId;
                } else {
                  this.logger.error(
                    `Could not resolve Cloudflare Zone ID for ${domain.domainName}`,
                  );
                }
              }

              await provider.deleteRecord(
                domainIdentifier || domain.domainName,
                record.providerRecordId!,
                apiKey,
                apiSecret || undefined,
              );

              // Update Local DB (Mirror Pattern: Mirror the success)
              await this.prisma.record.delete({ where: { id: record.id } });

              deletedCount++;

              // Update job progress
              await job.updateProgress(Math.round(((i + 1) / total) * 100));

              // Respect Rate Limiting
              // 260ms = ~3.8 requests per second. Extremely close to Cloudflare's 4/sec limit (1200 req / 5min)
              // This is the theoretical maximum safe speed.
              const delayMs =
                domain.provider.toLowerCase() === 'cloudflare' ? 260 : 200;
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            } catch (error: any) {
              this.logger.error(
                `Failed to delete record ${record.name}: ${error.message}`,
              );

              // If we hit a rate limit or throttle, DO NOT skip the record! Back off and retry it.
              const errMsg = error.message.toLowerCase();
              const isRateLimit =
                errMsg.includes('rate limit') ||
                errMsg.includes('429') ||
                errMsg.includes('971') ||
                errMsg.includes('throttling') ||
                errMsg.includes('throttle') ||
                errMsg.includes('please wait');

              if (isRateLimit) {
                this.logger.warn(
                  `Global Rate Limit/Throttle Hit. Sleeping for 15 seconds to let provider recover before retrying...`,
                );
                await new Promise((resolve) => setTimeout(resolve, 15000));
                i--; // Retry the exact same record in the next iteration
              } else {
                // For other fatal errors (e.g., record doesn't exist anymore), skip it
              }
            }
          }
        }
      }

      // Update domain records count
      await this.prisma.domain.update({
        where: { id: domainId },
        data: {
          recordsCount: { decrement: deletedCount },
          lastCleanedAt: new Date(),
        },
      });

      this.logger.log(
        `Clean job completed for ${domain.domainName}. Deleted ${deletedCount}/${total} records.`,
      );

      // Pacing to prevent Namecheap API firewall 522 errors
      if (domain.provider.toLowerCase() === 'namecheap') {
        this.logger.log(`Sleeping 3500ms for Namecheap rate limits pacing...`);
        await new Promise((resolve) => setTimeout(resolve, 3500));
      }

      return {
        domainName: domain.domainName,
        deletedCount,
        total,
      };
    } catch (error: any) {
      if (error instanceof JobCancelledError) {
        // We throw this specific error so the Queue knows it was cancelled,
        // but we avoid spamming the console with massive stack traces.
        throw error;
      }
      throw error;
    }
  }
}
