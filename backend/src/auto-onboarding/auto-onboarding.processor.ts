import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowRunner } from '../workflows/workflow-runner.service';
import { CloudflareService } from '../providers/cloudflare/cloudflare.service';
import { SpaceshipService } from '../providers/spaceship/spaceship.service';
import { GodaddyService } from '../providers/godaddy/godaddy.service';
import { NamecheapService } from '../providers/namecheap/namecheap.service';
import { DnsProvider } from '../providers/dns-provider.interface';
import { WorkflowContext, StepDefinition } from '../workflows/types';
import { getProviderConfig } from '../providers/provider-config.helper';

export interface OnboardingJobData {
  taskId: string;
  batchId: string;
  domainId: string;
  registrarAccountId?: string;
  cloudflareAccountId: string;
}

@Processor('onboarding-queue', { concurrency: 2 }) // Slow lane
export class AutoOnboardingProcessor extends WorkerHost {
  private readonly logger = new Logger(AutoOnboardingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowRunner: WorkflowRunner,
    private readonly cloudflare: CloudflareService,
    private readonly spaceship: SpaceshipService,
    private readonly godaddy: GodaddyService,
    private readonly namecheap: NamecheapService,
  ) {
    super();
  }

  async process(job: Job<OnboardingJobData, any, string>): Promise<any> {
    const { taskId, batchId, domainId, registrarAccountId, cloudflareAccountId } = job.data;
    this.logger.log(`Processing onboarding job ${job.id} for Task ${taskId}`);

    const domain = await this.prisma.domain.findUnique({ where: { id: domainId } });
    const cloudflareAccount = await this.prisma.account.findUnique({ where: { id: cloudflareAccountId } });

    if (!domain || !cloudflareAccount) {
      throw new Error('Required entities not found for onboarding task');
    }

    let registrarAccount: any = null;
    let registrarProvider: DnsProvider | null = null;
    if (registrarAccountId) {
      registrarAccount = await this.prisma.account.findUnique({ where: { id: registrarAccountId } });
      if (!registrarAccount) {
        throw new Error('Registrar account provided but not found');
      }
      
      const getProvider = (name: string): DnsProvider => {
        switch (name.toLowerCase()) {
          case 'cloudflare': return this.cloudflare;
          case 'spaceship': return this.spaceship;
          case 'godaddy': return this.godaddy;
          case 'namecheap': return this.namecheap;
          default: throw new Error(`Provider ${name} not supported`);
        }
      };
      registrarProvider = getProvider(registrarAccount.providerName);
    }

    const cfProvider = this.cloudflare;

    const context: WorkflowContext = {
      batchId,
      taskId,
      targetId: domainId,
      bullJob: job,
    };

    const steps: StepDefinition[] = [];

    // Step 1: Ensure zone exists in Cloudflare
    steps.push({
      name: 'CREATE_CLOUDFLARE_ZONE',
      run: async (ctx) => {
        this.logger.log(`Step: Ensuring Cloudflare zone exists for ${domain.domainName}`);
        if (!cfProvider.createZone) throw new Error('Cloudflare provider missing createZone');
        
        const result = await cfProvider.createZone(domain.domainName, cloudflareAccount.apiKey, cloudflareAccount.email || '');
        
        if (!result.nameServers || result.nameServers.length === 0) {
          throw new Error(`Cloudflare zone created but no nameservers were assigned for ${domain.domainName}`);
        }

        // Cache for next step and retries
        ctx.stepResultData = {
          cloudflareZoneId: result.id,
          assignedNameservers: result.nameServers
        };
        this.logger.log(`Cloudflare Zone ensured. NS: ${result.nameServers.join(', ')}`);
      },
      retryPolicy: { maxRetries: 3, backoffMs: 2000 }
    });

    // Step 2: Dynamically add Registrar Nameserver update if registrar is present
    if (registrarAccountId && registrarAccount && registrarProvider) {
      steps.push({
        name: 'UPDATE_REGISTRAR_NAMESERVERS',
        run: async (ctx) => {
          this.logger.log(`Step: Updating Registrar Nameservers for ${domain.domainName}`);
          
          let nsToSet: string[] = ctx.stepResultData?.assignedNameservers;
          
          if (!nsToSet) {
            const createStep = await this.prisma.jobStep.findFirst({
              where: { taskId, name: 'CREATE_CLOUDFLARE_ZONE', status: 'COMPLETED' }
            });
            const data = createStep?.resultData as any;
            if (data?.assignedNameservers) {
              nsToSet = data.assignedNameservers;
            } else {
              throw new Error('Cannot find assigned nameservers from Cloudflare step');
            }
          }

          if (!registrarProvider.updateNameservers) {
            throw new Error(`Provider ${registrarAccount.providerName} missing updateNameservers`);
          }

          const extraData = getProviderConfig(registrarAccount);
          
          await registrarProvider.updateNameservers(
            domain.domainName,
            nsToSet,
            registrarAccount.apiKey,
            registrarAccount.email || '',
            extraData
          );
          
          this.logger.log(`Registrar Nameservers updated successfully for ${domain.domainName}`);
        },
        retryPolicy: { maxRetries: 5, backoffMs: 5000 }
      });
    } else {
      this.logger.log(`No registrar account provided for ${domain.domainName}. Skipping auto nameserver updates.`);
    }

    // Step 3: Update domain status in database
    steps.push({
      name: 'UPDATE_DOMAIN_STATUS',
      run: async () => {
        await this.prisma.domain.update({
          where: { id: domainId },
          data: { status: 'PENDING_PROPAGATION' }
        });
        this.logger.log(`Domain ${domain.domainName} marked as PENDING_PROPAGATION`);
      }
    });

    try {
      await this.workflowRunner.executeTask(context, steps);
      this.logger.log(`Successfully processed onboarding job ${job.id} for Task ${taskId}`);
      return { success: true, taskId };
    } catch (error: any) {
      if (error.name !== 'DelayedError') {
         await this.prisma.domain.update({
           where: { id: domainId },
           data: { status: 'ONBOARDING_FAILED' }
         });
      }
      this.logger.error(`Failed to process onboarding job ${job.id} for Task ${taskId}: ${error.message}`);
      throw error;
    }
  }
}
