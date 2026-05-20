import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CleanerProcessor } from './cleaner.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudflareModule } from '../providers/cloudflare/cloudflare.module';
import { SpaceshipModule } from '../providers/spaceship/spaceship.module';
import { GodaddyModule } from '../providers/godaddy/godaddy.module';
import { NamecheapModule } from '../providers/namecheap/namecheap.module';
import { SyncModule } from '../sync/sync.module';
import { CleanerWorkflows } from './cleaner-workflows.service';
import { CleanWorkflowProcessor } from './clean-workflow.processor';
import { WorkflowsModule } from '../workflows/workflows.module';

@Module({
  imports: [
    PrismaModule,
    CloudflareModule,
    SpaceshipModule,
    GodaddyModule,
    NamecheapModule,
    SyncModule,
    WorkflowsModule,
    BullModule.registerQueue({
      name: 'clean-queue-v2',
    }),
  ],
  providers: [CleanerProcessor, CleanerWorkflows, CleanWorkflowProcessor],
  exports: [CleanerWorkflows],
})
export class CleanerModule {}
