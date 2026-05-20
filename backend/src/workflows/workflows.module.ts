import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkflowRunner } from './workflow-runner.service';
import { RateLimiterService } from './rate-limiter.service';
import { WorkflowEventsService } from './workflow-events.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { BullModule } from '@nestjs/bullmq';

@Global()
@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue(
      { name: 'api-queue' },
      { name: 'sync-queue' }
    ),
  ],
  providers: [WorkflowRunner, RateLimiterService, WorkflowEventsService, CircuitBreakerService],
  exports: [WorkflowRunner, RateLimiterService, WorkflowEventsService, CircuitBreakerService, BullModule],
})
export class WorkflowsModule {}
