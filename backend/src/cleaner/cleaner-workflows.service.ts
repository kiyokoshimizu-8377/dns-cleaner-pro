import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudflareService } from '../providers/cloudflare/cloudflare.service';
import { SpaceshipService } from '../providers/spaceship/spaceship.service';
import { GodaddyService } from '../providers/godaddy/godaddy.service';
import { NamecheapService } from '../providers/namecheap/namecheap.service';
import { SyncService } from '../sync/sync.service';
import { StepDefinition, WorkflowContext } from '../workflows/types';
import { DnsProvider } from '../providers/dns-provider.interface';
import axios from 'axios';

@Injectable()
export class CleanerWorkflows {
  private readonly logger = new Logger(CleanerWorkflows.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudflare: CloudflareService,
    private readonly spaceship: SpaceshipService,
    private readonly godaddy: GodaddyService,
    private readonly namecheap: NamecheapService,
    private readonly syncService: SyncService
  ) {}

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

  getSteps(types?: string[]): StepDefinition[] {
    return [
      {
        name: 'FETCH_RECORDS',
        timeoutMs: 3 * 60 * 1000, // 3 minutes timeout for fetch
        retryPolicy: {
          maxRetries: 2,
          backoffMs: 2000,
        },
        run: async (context: WorkflowContext) => {
          const { domainId } = context;
          this.logger.log(`[FETCH_RECORDS] Starting JIT sync for domain ${domainId}`);

          const domain = await this.prisma.domain.findUnique({
            where: { id: domainId },
            include: { records: true },
          });

          if (!domain) {
            throw new Error(`Domain ${domainId} not found`);
          }

          // Trigger JIT Records Sync if local db is empty but provider reports records
          if (domain.records.length === 0 && domain.recordsCount > 0) {
            this.logger.log(`[FETCH_RECORDS] Local database has no records. Syncing from API...`);
            await this.syncService.syncDomainRecords(domainId);
          }
        },
      },
      {
        name: 'DELETE_RECORDS',
        timeoutMs: 15 * 60 * 1000, // 15 minutes timeout for bulk delete
        retryPolicy: {
          maxRetries: 1,
          backoffMs: 5000,
        },
        run: async (context: WorkflowContext) => {
          const { domainId } = context;
          this.logger.log(`[DELETE_RECORDS] Starting record deletions for domain ${domainId}`);

          const domain = await this.prisma.domain.findUnique({
            where: { id: domainId },
            include: { account: true, records: true },
          });

          if (!domain) {
            throw new Error(`Domain ${domainId} not found`);
          }

          const provider = this.getProvider(domain.provider);
          const shouldDeleteAll = !types || types.length === 0 || types.includes('ALL');
          const recordsToDelete = shouldDeleteAll
            ? domain.records
            : domain.records.filter((r) => types.includes(r.type));

          const total = recordsToDelete.length;
          let deletedCount = 0;

          if (total === 0) {
            this.logger.log(`[DELETE_RECORDS] No records to delete for domain ${domain.domainName}`);
            return;
          }

          if (domain.provider.toLowerCase() === 'namecheap') {
            this.logger.log(`[DELETE_RECORDS] Namecheap detected. Performing bulk delete...`);
            const apiKey = domain.account.apiKey;
            const apiSecret = domain.account.apiSecret || domain.account.email;

            // Fetch current hosts to be 100% up-to-date
            const currentRecords = await this.namecheap.getRecords(
              domain.domainName,
              apiKey,
              apiSecret || ''
            );

            const recordProviderIdsToDelete = recordsToDelete.map((r) => r.providerRecordId);
            const remainingRecords = currentRecords.filter(
              (r) => !recordProviderIdsToDelete.includes(r.id)
            );

            const firstDotIndex = domain.domainName.indexOf('.');
            const sld = firstDotIndex !== -1 ? domain.domainName.substring(0, firstDotIndex) : domain.domainName;
            const tld = firstDotIndex !== -1 ? domain.domainName.substring(firstDotIndex + 1) : '';

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

            const setResponse = await axios.post(
              'https://api.namecheap.com/xml.response',
              formData,
              {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              }
            );

            const xml = setResponse.data;
            if (xml.includes('Status="ERROR"')) {
              const errorMatch = xml.match(/<Error.*?>(.*?)<\/Error>/);
              const errorMsg = errorMatch ? errorMatch[1] : 'Unknown Namecheap API Error';
              throw new Error(errorMsg);
            }

            // Update local DB
            const recordIdsToDelete = recordsToDelete.map((r) => r.id);
            await this.prisma.record.deleteMany({
              where: { id: { in: recordIdsToDelete } },
            });

            deletedCount = total;
          } else {
            // Sequential loop for Cloudflare, Spaceship, GoDaddy
            for (let i = 0; i < total; i++) {
              const record = recordsToDelete[i];
              try {
                const apiKey = domain.account.apiKey;
                const apiSecret = domain.account.apiSecret || domain.account.email;

                let domainIdentifier = domain.provider.toLowerCase() === 'cloudflare'
                  ? domain.providerDomainId
                  : domain.domainName;

                // Self-healing check for Cloudflare zone ID
                if (
                  domain.provider.toLowerCase() === 'cloudflare' &&
                  (!domainIdentifier || !/^[a-f0-9]{32}$/i.test(domainIdentifier))
                ) {
                  const realZoneId = await this.cloudflare.getZoneIdByName(
                    domain.domainName,
                    apiKey,
                    apiSecret || undefined
                  );
                  if (realZoneId) {
                    await this.prisma.domain.update({
                      where: { id: domain.id },
                      data: { providerDomainId: realZoneId },
                    });
                    domainIdentifier = realZoneId;
                  }
                }

                await provider.deleteRecord(
                  domainIdentifier || domain.domainName,
                  record.providerRecordId!,
                  apiKey,
                  apiSecret || undefined
                );

                // Update local DB
                await this.prisma.record.delete({ where: { id: record.id } });
                deletedCount++;

                // Rate limiting delay
                const delayMs = domain.provider.toLowerCase() === 'cloudflare' ? 260 : 200;
                await new Promise((resolve) => setTimeout(resolve, delayMs));
              } catch (error: any) {
                this.logger.error(`Failed to delete record ${record.name}: ${error.message}`);
                const errMsg = error.message.toLowerCase();
                const isRateLimit =
                  errMsg.includes('rate limit') ||
                  errMsg.includes('429') ||
                  errMsg.includes('throttling') ||
                  errMsg.includes('throttle');

                if (isRateLimit) {
                  this.logger.warn(`Rate limit hit. Waiting 15s before retrying...`);
                  await new Promise((resolve) => setTimeout(resolve, 15000));
                  i--; // Retry the same index
                }
              }
            }
          }

          // Update domain counts
          await this.prisma.domain.update({
            where: { id: domainId },
            data: {
              recordsCount: { decrement: deletedCount },
              lastCleanedAt: new Date(),
            },
          });

          // Pacing delay for Namecheap
          if (domain.provider.toLowerCase() === 'namecheap') {
            await new Promise((resolve) => setTimeout(resolve, 3500));
          }

          this.logger.log(`[DELETE_RECORDS] Completed for ${domain.domainName}. Deleted ${deletedCount}/${total}`);
        },
      },
    ];
  }
}
