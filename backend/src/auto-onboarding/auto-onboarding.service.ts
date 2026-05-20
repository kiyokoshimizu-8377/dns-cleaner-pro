import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudflareService } from '../providers/cloudflare/cloudflare.service';
import { SpaceshipService } from '../providers/spaceship/spaceship.service';
import { GodaddyService } from '../providers/godaddy/godaddy.service';
import { NamecheapService } from '../providers/namecheap/namecheap.service';
import { DnsProvider } from '../providers/dns-provider.interface';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BatchType, Status } from '@prisma/client';
import { StartOnboardingDto } from './dto/start-onboarding.dto';
import { normalizeAndValidateDomain } from './domain-validation.helper';

@Injectable()
export class AutoOnboardingService {
  private readonly logger = new Logger(AutoOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudflare: CloudflareService,
    private readonly spaceship: SpaceshipService,
    private readonly godaddy: GodaddyService,
    private readonly namecheap: NamecheapService,
    @InjectQueue('onboarding-queue') private readonly onboardingQueue: Queue,
  ) {}

  private getProvider(name: string): DnsProvider {
    switch (name.toLowerCase()) {
      case 'cloudflare': return this.cloudflare;
      case 'spaceship': return this.spaceship;
      case 'godaddy': return this.godaddy;
      case 'namecheap': return this.namecheap;
      default: throw new Error(`Provider ${name} not supported`);
    }
  }

  async getRegistrarDomains(accountId: string): Promise<{ domains: string[] }> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');

    const provider = this.getProvider(account.providerName);
    try {
      const zones = await provider.getZones(account.apiKey, account.email || '');
      return { domains: zones.map(z => z.name) };
    } catch (err: any) {
      this.logger.error(`Failed to fetch registrar domains for ${accountId}: ${err.message}`);
      throw new BadRequestException(`Failed to fetch domains from registrar: ${err.message}`);
    }
  }

  async startOnboarding(dto: StartOnboardingDto) {
    const {
      mode,
      cloudflareAccountId,
      registrarAccountId,
      selectedDomains = [],
      manualDomains = [],
      dryRun = false,
      ownershipVerificationMode = 'NONE',
    } = dto;

    if (!cloudflareAccountId) throw new BadRequestException('Cloudflare destination account is required');
    const cloudflareAccount = await this.prisma.account.findUnique({ where: { id: cloudflareAccountId } });
    if (!cloudflareAccount) throw new NotFoundException('Cloudflare account not found');
    if (cloudflareAccount.providerName.toLowerCase() !== 'cloudflare') {
      throw new BadRequestException('Destination account must be a Cloudflare provider');
    }

    let registrarAccount: any = null;
    let registrarProvider: DnsProvider | null = null;
    if (registrarAccountId) {
      registrarAccount = await this.prisma.account.findUnique({ where: { id: registrarAccountId } });
      if (!registrarAccount) throw new NotFoundException('Registrar account not found');
      registrarProvider = this.getProvider(registrarAccount.providerName);
    }

    if ((mode === 'FULL_ACCOUNT' || mode === 'SELECTED_DOMAINS') && !registrarAccountId) {
      throw new BadRequestException(`Registrar account is required for mode: ${mode}`);
    }

    // 1. Gather & Normalize domain list
    let rawDomains: string[] = [];
    if (mode === 'FULL_ACCOUNT') {
      this.logger.log(`Fetching all domains from registrar ${registrarAccount.providerName} (${registrarAccountId})`);
      const zones = await registrarProvider!.getZones(registrarAccount.apiKey, registrarAccount.email || '');
      rawDomains = zones.map(z => z.name);
    } else if (mode === 'SELECTED_DOMAINS') {
      rawDomains = selectedDomains;
    } else if (mode === 'MANUAL_LIST') {
      rawDomains = manualDomains;
    } else {
      throw new BadRequestException(`Invalid onboarding mode: ${mode}`);
    }

    const requestedCount = rawDomains.length;
    const normalizedDomains: string[] = [];
    let invalidCount = 0;

    for (const d of rawDomains) {
      const norm = normalizeAndValidateDomain(d);
      if (norm) {
        normalizedDomains.push(norm);
      } else {
        invalidCount++;
      }
    }

    const uniqueDomains = Array.from(new Set(normalizedDomains));
    const duplicatesCount = normalizedDomains.length - uniqueDomains.length;

    // 2. Ownership Match Verification (Only applicable if REGISTRAR_MATCH is set in MANUAL_LIST)
    let finalTargetDomains = [...uniqueDomains];
    let skippedOwnershipCount = 0;

    if (mode === 'MANUAL_LIST' && registrarAccountId && ownershipVerificationMode === 'REGISTRAR_MATCH') {
      const registrarZones = await registrarProvider!.getZones(registrarAccount.apiKey, registrarAccount.email || '');
      const registrarDomainNames = new Set(registrarZones.map(z => z.name.toLowerCase()));
      
      finalTargetDomains = uniqueDomains.filter(d => registrarDomainNames.has(d.toLowerCase()));
      skippedOwnershipCount = uniqueDomains.length - finalTargetDomains.length;
    }

    // 3. Diff against Cloudflare
    const cfZones = await this.cloudflare.getZones(cloudflareAccount.apiKey, cloudflareAccount.email || '');
    const cfZoneNames = new Set(cfZones.map(z => z.name.toLowerCase()));

    const alreadyInCloudflare: string[] = [];
    const willCreateZones: string[] = [];

    for (const domain of finalTargetDomains) {
      if (cfZoneNames.has(domain.toLowerCase())) {
        alreadyInCloudflare.push(domain);
      } else {
        willCreateZones.push(domain);
      }
    }

    // Calculate NS update availability
    let canUpdateNs = false;
    if (registrarAccount && registrarProvider) {
      const caps = registrarProvider.getCapabilities(registrarAccount);
      canUpdateNs = caps.canUpdateNameservers;
    }

    const willUpdateNameserversCount = canUpdateNs ? willCreateZones.length : 0;
    const manualNsRequiredCount = canUpdateNs ? 0 : willCreateZones.length;

    const summary = {
      requested: requestedCount,
      normalized: normalizedDomains.length,
      duplicatesRemoved: duplicatesCount,
      invalid: invalidCount,
      alreadyInCloudflare: alreadyInCloudflare.length,
      willCreateZones: willCreateZones.length,
      willUpdateNameservers: willUpdateNameserversCount,
      manualNsRequired: manualNsRequiredCount,
      skippedOwnershipVerification: skippedOwnershipCount,
    };

    if (dryRun) {
      return {
        dryRun: true,
        summary,
        details: {
          willCreateZones,
          alreadyInCloudflare,
        }
      };
    }

    if (willCreateZones.length === 0) {
      return {
        message: 'No new domains to onboard (all exist in Cloudflare or were excluded).',
        summary,
      };
    }

    // 4. Create JobBatch
    const batch = await this.prisma.jobBatch.create({
      data: {
        type: BatchType.AUTO_ONBOARDING,
        status: Status.RUNNING,
        totalJobs: willCreateZones.length,
        meta: {
          sourceType: mode,
          registrarAccountId,
          cloudflareAccountId,
          summary,
        }
      }
    });

    // 5. Enqueue tasks
    for (const domainName of willCreateZones) {
      let dbDomain = await this.prisma.domain.findUnique({ where: { domainName } });
      if (!dbDomain) {
        dbDomain = await this.prisma.domain.create({
          data: {
            accountId: registrarAccountId || cloudflareAccountId, // Fallback to CF account if registrar is empty
            domainName,
            provider: registrarAccount ? registrarAccount.providerName : 'cloudflare',
            status: 'IMPORTING',
          }
        });
      } else {
        await this.prisma.domain.update({
          where: { id: dbDomain.id },
          data: { status: 'IMPORTING' }
        });
      }

      const task = await this.prisma.jobTask.create({
        data: {
          batchId: batch.id,
          targetId: dbDomain.id,
          status: Status.PENDING,
          bullJobId: `onboard-${dbDomain.id}-${Date.now()}`,
        }
      });

      await this.onboardingQueue.add('onboard-domain', {
        taskId: task.id,
        batchId: batch.id,
        domainId: dbDomain.id,
        registrarAccountId,
        cloudflareAccountId,
      }, {
        jobId: `onboard-${task.id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 }
      });
    }

    return {
      message: `Onboarding batch successfully created with ${willCreateZones.length} domains.`,
      batchId: batch.id,
      summary,
    };
  }
}
