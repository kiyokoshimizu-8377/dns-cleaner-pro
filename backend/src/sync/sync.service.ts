import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';
import { CloudflareService } from '../providers/cloudflare/cloudflare.service';
import { SpaceshipService } from '../providers/spaceship/spaceship.service';
import { GodaddyService } from '../providers/godaddy/godaddy.service';
import { NamecheapService } from '../providers/namecheap/namecheap.service';
import { DnsProvider } from '../providers/dns-provider.interface';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Status, BatchType } from '@prisma/client';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private prisma: PrismaService,
    private cloudflare: CloudflareService,
    private spaceship: SpaceshipService,
    private godaddy: GodaddyService,
    private namecheap: NamecheapService,
    @InjectQueue('sync-queue') private syncQueue: Queue,
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
        throw new Error(`Provider ${providerName} not supported yet`);
    }
  }

  async syncAccount(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) throw new Error('Account not found');

    const provider = this.getProvider(account.providerName);
    return this.syncGeneral(account, provider);
  }

  private async syncGeneral(account: any, provider: DnsProvider) {
    this.logger.log(
      `Syncing ${account.providerName} account: ${account.email || account.id}`,
    );

    const apiKey = account.apiKey;
    const apiSecret = account.apiSecret || account.email; // Use email as fallback for CF, secret for others

    const zones = await provider.getZones(apiKey, apiSecret);
    const activeZoneNames = zones.map((z) => z.name);

    this.logger.log(
      `Found ${zones.length} zones. Cleaning up removed domains...`,
    );

    // 2. Cleanup removed domains
    await this.prisma.domain.deleteMany({
      where: {
        accountId: account.id,
        domainName: { notIn: activeZoneNames },
      },
    });

    // 3. Fast Sync: Only update Domain names and IDs
    this.logger.log(`Starting Fast Sync for ${zones.length} domains...`);

    const chunkSize = 2000;
    for (let i = 0; i < zones.length; i += chunkSize) {
      const chunk = zones.slice(i, i + chunkSize);

      const values = chunk
        .map((zone) => {
          const id = randomUUID();
          return `('${id}', '${account.id}', '${zone.name}', '${account.providerName}', '${zone.id}', '${zone.status}', CURRENT_TIMESTAMP)`;
        })
        .join(',');

      const query = `
        INSERT INTO "Domain" ("id", "accountId", "domainName", "provider", "providerDomainId", "status", "lastSync")
        VALUES ${values}
        ON CONFLICT ("domainName") DO UPDATE SET 
          "status" = EXCLUDED."status", 
          "lastSync" = EXCLUDED."lastSync",
          "providerDomainId" = EXCLUDED."providerDomainId",
          "provider" = EXCLUDED."provider",
          "accountId" = EXCLUDED."accountId";
      `;

      await this.prisma.$executeRawUnsafe(query);

      this.logger.log(
        `Fast Sync Progress: ${Math.min(i + chunkSize, zones.length)}/${zones.length}`,
      );
    }

    return {
      message: 'Initial sync completed. Domains are now visible.',
      domainsSynced: zones.length,
    };
  }

  async deepSyncAccount(accountId: string, dryRun = false) {
    // 1. Create JobBatch (DEEP_SYNC)
    const batch = await this.prisma.jobBatch.create({
      data: {
        type: BatchType.DEEP_SYNC,
        status: Status.PENDING,
        totalJobs: 1, // Start with 1 (FETCH_ACCOUNTS). FETCH_ACCOUNTS step will increment this.
        completedJobs: 0,
        failedJobs: 0,
        startedAt: new Date(),
      },
    });

    // 2. Create FETCH_ACCOUNTS Task
    const accountTask = await this.prisma.jobTask.create({
      data: {
        bullJobId: `sync_acc_${batch.id}_${accountId}`,
        batchId: batch.id,
        targetId: accountId,
        status: Status.PENDING,
        currentStep: 'FETCH_ACCOUNTS',
      },
    });

    await this.prisma.jobStep.create({
      data: {
        taskId: accountTask.id,
        name: 'FETCH_ACCOUNTS',
        status: Status.PENDING,
      },
    });

    // Queue FETCH_ACCOUNTS task
    await this.syncQueue.add('sync-account', {
      taskId: accountTask.id,
      batchId: batch.id,
      targetId: accountId,
      taskType: 'sync-account',
      dryRun,
    });

    this.logger.log(
      `Registered and queued Deep Sync workflow batch ${batch.id} starting with FETCH_ACCOUNTS (dryRun: ${dryRun}).`,
    );

    return {
      message: `Deep sync batch started. Initializing account data...`,
      batchId: batch.id,
      dryRun,
    };
  }

  async syncDomainRecords(domainId: string) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      include: { account: true },
    });

    if (!domain) throw new Error('Domain not found');

    const provider = this.getProvider(domain.provider);
    const apiKey = domain.account.apiKey;
    const apiSecret =
      domain.account.apiSecret || domain.account.email || undefined;

    this.logger.log(`Fetching records JIT for domain: ${domain.domainName}`);

    // 1. Fetch records from provider API
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
        apiSecret,
      );
      if (realZoneId) {
        this.logger.log(
          `Resolved Zone ID for ${domain.domainName}: ${realZoneId}. Updating database...`,
        );
        await this.prisma.domain.update({
          where: { id: domainId },
          data: { providerDomainId: realZoneId },
        });
        domainIdentifier = realZoneId;
      } else {
        this.logger.error(
          `Could not resolve Cloudflare Zone ID for ${domain.domainName}`,
        );
      }
    }

    const records = await provider.getRecords(
      domainIdentifier || domain.domainName,
      apiKey,
      apiSecret,
    );

    // 2. Delete existing records for this domain in database
    await this.prisma.record.deleteMany({
      where: { domainId },
    });

    // 3. Save fetched records to database
    if (records.length > 0) {
      await this.prisma.record.createMany({
        data: records.map((r) => ({
          domainId,
          type: r.type,
          name: r.name,
          content: r.content,
          ttl: r.ttl,
          providerRecordId: r.id,
          extraData: r.priority ? { priority: r.priority } : undefined,
        })),
      });
    }

    // 4. Update domain records count
    await this.prisma.domain.update({
      where: { id: domainId },
      data: {
        recordsCount: records.length,
        lastSync: new Date(),
      },
    });

    this.logger.log(
      `Successfully synced ${records.length} records for ${domain.domainName}`,
    );

    return { syncedCount: records.length };
  }
}
