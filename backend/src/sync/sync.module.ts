import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncWorkflows } from './sync-workflows.service';
import { SyncWorkflowProcessor } from './sync-workflow.processor';
import { SyncController } from './sync.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudflareModule } from '../providers/cloudflare/cloudflare.module';
import { SpaceshipModule } from '../providers/spaceship/spaceship.module';
import { GodaddyModule } from '../providers/godaddy/godaddy.module';
import { NamecheapModule } from '../providers/namecheap/namecheap.module';
import { WorkflowsModule } from '../workflows/workflows.module';

@Module({
  imports: [
    PrismaModule,
    CloudflareModule,
    SpaceshipModule,
    GodaddyModule,
    NamecheapModule,
    WorkflowsModule,
  ],
  controllers: [SyncController],
  providers: [SyncService, SyncWorkflows, SyncWorkflowProcessor],
  exports: [SyncService, SyncWorkflows, SyncWorkflowProcessor],
})
export class SyncModule {}
