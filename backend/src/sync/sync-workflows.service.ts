import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudflareService } from '../providers/cloudflare/cloudflare.service';
import { SpaceshipService } from '../providers/spaceship/spaceship.service';
import { GodaddyService } from '../providers/godaddy/godaddy.service';
import { NamecheapService } from '../providers/namecheap/namecheap.service';
import { DnsProvider } from '../providers/dns-provider.interface';
import { StepDefinition, WorkflowContext } from '../workflows/types';
import { randomUUID } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ValidationError, ProviderNotFoundError } from '../workflows/errors';

@Injectable()
export class SyncWorkflows {
  private readonly logger = new Logger(SyncWorkflows.name);

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
        throw new ProviderNotFoundError(`Provider ${providerName} not supported yet`);
    }
  }

  /**
   * Step 1: FETCH_ACCOUNTS
   * Fetches account domain list from registrar and upserts into local DB.
   */
  getFetchAccountsStep(): StepDefinition {
    return {
      name: 'FETCH_ACCOUNTS',
      timeoutMs: 120000, // 2 minutes
      retryPolicy: {
        maxRetries: 2,
        backoffMs: 3000,
      },
      run: async (context: WorkflowContext) => {
        const accountId = context.targetId;
        if (!accountId) throw new ValidationError('FETCH_ACCOUNTS: targetId (accountId) is required');

        const account = await this.prisma.account.findUnique({
          where: { id: accountId },
        });
        if (!account) throw new ValidationError(`Account ${accountId} not found`);

        this.logger.log(`FETCH_ACCOUNTS: Syncing zones list for account: ${account.id}`);
        if (context.heartbeat) await context.heartbeat();

        const provider = this.getProvider(account.providerName);
        const apiKey = account.apiKey;
        const apiSecret = account.apiSecret || account.email || undefined;

        // Fetch zones
        const zones = await provider.getZones(apiKey, apiSecret);
        const activeZoneNames = zones.map((z) => z.name);

        if (context.heartbeat) await context.heartbeat();

        // Cleanup removed domains locally
        await this.prisma.domain.deleteMany({
          where: {
            accountId: account.id,
            domainName: { notIn: activeZoneNames },
          },
        });

        // Fast Sync: Upsert domains
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
          if (context.heartbeat) await context.heartbeat();
        }

        // Fetch domains back to create individual sync tasks
        const activeDomains = await this.prisma.domain.findMany({
          where: { accountId: account.id },
          select: { id: true },
        });

        if (activeDomains.length > 0) {
          const batchId = context.batchId;
          if (!batchId) throw new Error('FETCH_ACCOUNTS: batchId is required to spawn sub-tasks');

          // Update batch totalJobs
          await this.prisma.jobBatch.update({
            where: { id: batchId },
            data: { totalJobs: { increment: activeDomains.length } }
          });

          // Create tasks & steps
          for (const d of activeDomains) {
            const bullJobId = `sync_dom_${batchId}_${d.id}`;
            const task = await this.prisma.jobTask.create({
              data: {
                bullJobId,
                batchId,
                targetId: d.id,
                status: 'PENDING',
                currentStep: 'FETCH_REMOTE_RECORDS',
              },
            });

            await this.prisma.jobStep.createMany({
              data: [
                { taskId: task.id, name: 'FETCH_REMOTE_RECORDS', status: 'PENDING' },
                { taskId: task.id, name: 'COMPARE_STATE', status: 'PENDING' },
                { taskId: task.id, name: 'APPLY_CHANGES', status: 'PENDING' },
              ],
            });

            // Queue domain sync task
            await this.syncQueue.add('sync-domain', {
              taskId: task.id,
              batchId,
              targetId: d.id,
              taskType: 'sync-domain',
              dryRun: context.dryRun,
            });
          }
          this.logger.log(`FETCH_ACCOUNTS queued ${activeDomains.length} domain sync tasks.`);
        }

        context.domainsSynced = zones.length;
        this.logger.log(`FETCH_ACCOUNTS completed. Synced ${zones.length} domains.`);
      },
    };
  }

  /**
   * Step 2: FETCH_REMOTE_RECORDS
   * Fetches remote DNS records from provider API for a domain.
   */
  getFetchRemoteRecordsStep(): StepDefinition {
    return {
      name: 'FETCH_REMOTE_RECORDS',
      timeoutMs: 180000, // 3 minutes
      retryPolicy: {
        maxRetries: 3,
        backoffMs: 2000,
        exponential: true,
      },
      run: async (context: WorkflowContext) => {
        const domainId = context.targetId;
        if (!domainId) throw new ValidationError('FETCH_REMOTE_RECORDS: targetId (domainId) is required');

        const domain = await this.prisma.domain.findUnique({
          where: { id: domainId },
          include: { account: true },
        });
        if (!domain) throw new ValidationError(`Domain ${domainId} not found in database`);

        if (!domain.domainName) {
          throw new ValidationError(`Domain ${domainId} has an empty or invalid domainName`);
        }

        if (context.heartbeat) await context.heartbeat();

        const provider = this.getProvider(domain.provider);
        const apiKey = domain.account.apiKey;
        const apiSecret = domain.account.apiSecret || domain.account.email || undefined;

        let domainIdentifier =
          domain.provider.toLowerCase() === 'cloudflare'
            ? domain.providerDomainId
            : domain.domainName;

        // Cloudflare Zone ID dynamic healing
        if (
          domain.provider.toLowerCase() === 'cloudflare' &&
          (!domainIdentifier || !/^[a-f0-9]{32}$/i.test(domainIdentifier))
        ) {
          const realZoneId = await this.cloudflare.getZoneIdByName(
            domain.domainName,
            apiKey,
            apiSecret,
          );
          if (realZoneId) {
            await this.prisma.domain.update({
              where: { id: domain.id },
              data: { providerDomainId: realZoneId },
            });
            domainIdentifier = realZoneId;
          }
        }

        const records = await provider.getRecords(
          domainIdentifier || domain.domainName,
          apiKey,
          apiSecret,
        );

        // Store records in task context for the next steps
        context.remoteRecords = records;
        this.logger.log(`FETCH_REMOTE_RECORDS completed for ${domain.domainName}. Found ${records.length} records.`);
      },
    };
  }

  /**
   * Step 3: COMPARE_STATE
   * Diffs remote records against local database records.
   */
  getCompareStateStep(): StepDefinition {
    return {
      name: 'COMPARE_STATE',
      timeoutMs: 60000, // 1 minute
      run: async (context: WorkflowContext) => {
        const domainId = context.targetId;
        const remoteRecords = context.remoteRecords;
        if (!domainId) throw new ValidationError('COMPARE_STATE: domainId is required');
        if (!remoteRecords) throw new ValidationError('COMPARE_STATE: remoteRecords are missing from context');

        // Fetch local records
        const localRecords = await this.prisma.record.findMany({
          where: { domainId },
        });

        // Compute diff
        const toCreate: any[] = [];
        const toDelete: string[] = [];
        const toUpdate: { id: string; data: any }[] = [];

        // Check remote against local (to create or update)
        for (const remote of remoteRecords) {
          const matched = localRecords.find((l) => l.providerRecordId === remote.id);
          if (!matched) {
            toCreate.push({
              domainId,
              type: remote.type,
              name: remote.name,
              content: remote.content,
              ttl: remote.ttl,
              providerRecordId: remote.id,
              extraData: remote.priority ? { priority: remote.priority } : undefined,
            });
          } else if (
            matched.type !== remote.type ||
            matched.name !== remote.name ||
            matched.content !== remote.content ||
            matched.ttl !== remote.ttl
          ) {
            toUpdate.push({
              id: matched.id,
              data: {
                type: remote.type,
                name: remote.name,
                content: remote.content,
                ttl: remote.ttl,
                extraData: remote.priority ? { priority: remote.priority } : undefined,
              },
            });
          }
        }

        // Check local against remote (to delete)
        for (const local of localRecords) {
          if (local.providerRecordId) {
            const matched = remoteRecords.find((r) => r.id === local.providerRecordId);
            if (!matched) {
              toDelete.push(local.id);
            }
          }
        }

        // Store computed diff in task context
        context.diff = { toCreate, toDelete, toUpdate };
        this.logger.log(
          `COMPARE_STATE completed: ${toCreate.length} to create, ${toUpdate.length} to update, ${toDelete.length} to delete.`,
        );
      },
    };
  }

  /**
   * Step 4: APPLY_CHANGES
   * Mirrors diff to local DB (bypassed if context.dryRun is true).
   */
  getApplyChangesStep(): StepDefinition {
    return {
      name: 'APPLY_CHANGES',
      timeoutMs: 120000, // 2 minutes
      run: async (context: WorkflowContext) => {
        const domainId = context.targetId;
        const diff = context.diff;
        if (!domainId) throw new ValidationError('APPLY_CHANGES: domainId is required');
        if (!diff) throw new ValidationError('APPLY_CHANGES: diff is missing from context');

        if (context.dryRun) {
          this.logger.log(`APPLY_CHANGES: Bypassing database updates (DRY_RUN mode active).`);
          return;
        }

        const { toCreate, toDelete, toUpdate } = diff;

        // Apply deletes
        if (toDelete.length > 0) {
          await this.prisma.record.deleteMany({
            where: { id: { in: toDelete } },
          });
        }

        // Apply updates sequentially (usually low volume)
        for (const upd of toUpdate) {
          await this.prisma.record.update({
            where: { id: upd.id },
            data: upd.data,
          });
        }

        // Apply creates
        if (toCreate.length > 0) {
          await this.prisma.record.createMany({
            data: toCreate,
          });
        }

        // Update recordsCount and lastSync
        const currentRecordsCount = await this.prisma.record.count({
          where: { domainId },
        });

        await this.prisma.domain.update({
          where: { id: domainId },
          data: {
            recordsCount: currentRecordsCount,
            lastSync: new Date(),
          },
        });

        this.logger.log(`APPLY_CHANGES completed for domain ${domainId}. Local DB successfully updated.`);
      },
    };
  }
}
