import { Module } from '@nestjs/common';
import { DomainsService } from './domains.service';
import { DomainsController } from './domains.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudflareModule } from '../providers/cloudflare/cloudflare.module';
import { SyncModule } from '../sync/sync.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    PrismaModule,
    CloudflareModule,
    SyncModule,
    BullModule.registerQueue(
      { name: 'clean-queue-v2' },
      { name: 'api-queue' }
    ),
  ],
  controllers: [DomainsController],
  providers: [DomainsService],
})
export class DomainsModule {}
