import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { AutoOnboardingController } from './auto-onboarding.controller';
import { AutoOnboardingService } from './auto-onboarding.service';
import { AutoOnboardingProcessor } from './auto-onboarding.processor';
import { CloudflareModule } from '../providers/cloudflare/cloudflare.module';
import { SpaceshipModule } from '../providers/spaceship/spaceship.module';
import { GodaddyModule } from '../providers/godaddy/godaddy.module';
import { NamecheapModule } from '../providers/namecheap/namecheap.module';

@Module({
  imports: [
    PrismaModule,
    CloudflareModule, SpaceshipModule, GodaddyModule, NamecheapModule,
    BullModule.registerQueue({
      name: 'onboarding-queue',
    }),
  ],
  controllers: [AutoOnboardingController],
  providers: [AutoOnboardingService, AutoOnboardingProcessor],
  exports: [AutoOnboardingService],
})
export class AutoOnboardingModule {}
