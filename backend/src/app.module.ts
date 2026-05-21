import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config'; // 👈 Zdna ConfigService hna
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
      // 👇 Hna kankhelliw NestJS i-chouf l-.env f root dyal docker wla rje3ti 1 step bray backend f local
      envFilePath:
        process.env.NODE_ENV === 'production' ? [] : ['../.env', '.env'],
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

    // 👇 Dynamic connection dyal BullMQ m7miya m9adda bl-ConfigService
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'redis'),
          port: configService.get<number>('REDIS_PORT', 6379),
          // 👇 Ila l9a pass khawi (b7al dynamic config jdid) ghadi i-passi undefined safe bla NOAUTH error
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
