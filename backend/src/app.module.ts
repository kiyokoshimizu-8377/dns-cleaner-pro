import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AccountsModule } from './accounts/accounts.module';
import { CloudflareModule } from './providers/cloudflare/cloudflare.module';
import { SpaceshipModule } from './providers/spaceship/spaceship.module';
import { GodaddyModule } from './providers/godaddy/godaddy.module';
import { NamecheapModule } from './providers/namecheap/namecheap.module';
import { SyncModule } from './sync/sync.module';
import { DomainsModule } from './domains/domains.module';
import { CleanerModule } from './cleaner/cleaner.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { AutoOnboardingModule } from './auto-onboarding/auto-onboarding.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Khallih global bach i-fully configuri l'env
    }),
    PrismaModule,
    AccountsModule,
    CloudflareModule,
    SpaceshipModule,
    GodaddyModule,
    NamecheapModule,
    SyncModule,
    DomainsModule,
    CleanerModule,
    WorkflowsModule,
    AutoOnboardingModule,

    // 👇 Dynamic connection dyal BullMQ m7miya mn NOAUTH
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
        },
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
