import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CircuitState } from '@prisma/client';
import { CircuitBreakerOpenException, InfraWorkflowError } from './errors';

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  
  // Default configurations
  private readonly DEFAULT_THRESHOLD = 5; // Failures before opening
  private readonly DEFAULT_COOLDOWN_MS = 300000; // 5 minutes

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Checks if the circuit is open for a provider.
   * Throws CircuitBreakerOpenException if open.
   */
  async checkState(provider: string): Promise<void> {
    let state = await this.prisma.providerState.findUnique({
      where: { provider }
    });

    if (!state) {
      state = await this.prisma.providerState.create({
        data: {
          provider,
          state: 'CLOSED',
          cooldownMs: this.DEFAULT_COOLDOWN_MS
        }
      });
    }

    if (state.state === 'OPEN') {
      const now = new Date();
      if (state.nextRetryAt && state.nextRetryAt <= now) {
        // Cooldown period has passed. Transition to HALF_OPEN to test the waters.
        this.logger.log(`Circuit for ${provider} transitioning from OPEN to HALF_OPEN`);
        await this.prisma.providerState.update({
          where: { provider },
          data: { state: 'HALF_OPEN' }
        });
        return; // Allow the request to proceed
      } else {
        // Still OPEN, throw exception
        const remainingDelayMs = state.nextRetryAt ? state.nextRetryAt.getTime() - now.getTime() : state.cooldownMs;
        throw new CircuitBreakerOpenException(provider, Math.max(1000, remainingDelayMs));
      }
    }
  }

  /**
   * Records a successful operation, resetting the circuit if necessary.
   */
  async recordSuccess(provider: string): Promise<void> {
    const state = await this.prisma.providerState.findUnique({ where: { provider } });
    if (state && (state.failureCount > 0 || state.state !== 'CLOSED')) {
      this.logger.log(`Circuit for ${provider} transitioning to CLOSED (Healthy)`);
      await this.prisma.providerState.update({
        where: { provider },
        data: {
          state: 'CLOSED',
          failureCount: 0,
          nextRetryAt: null
        }
      });
    }
  }

  /**
   * Records a failure. Evaluates if the error is an infra error before incrementing.
   */
  async recordFailure(provider: string, error: Error): Promise<void> {
    // Only Infra errors (like 429, timeouts) should trip the circuit breaker.
    // Business logic errors (e.g., domain not found) are expected and healthy for the infra.
    const isInfraError = error instanceof InfraWorkflowError || 
                         (error as any).isRetryable === true ||
                         error.name === 'TransientApiError';

    if (!isInfraError) {
      return; // Ignore business/security errors
    }

    const state = await this.prisma.providerState.upsert({
      where: { provider },
      create: { provider, state: 'CLOSED', failureCount: 1, cooldownMs: this.DEFAULT_COOLDOWN_MS, lastFailure: new Date() },
      update: { failureCount: { increment: 1 }, lastFailure: new Date() }
    });

    if (state.state === 'HALF_OPEN') {
      // If we were testing the waters and failed, trip immediately back to OPEN.
      this.tripBreaker(provider, state.cooldownMs);
    } else if (state.state === 'CLOSED' && state.failureCount >= this.DEFAULT_THRESHOLD) {
      // Threshold reached, trip the breaker.
      this.tripBreaker(provider, state.cooldownMs);
    }
  }

  private async tripBreaker(provider: string, cooldownMs: number) {
    const nextRetryAt = new Date(Date.now() + cooldownMs);
    this.logger.warn(`TRIPPING CIRCUIT BREAKER for ${provider}. State: OPEN. Cooldown: ${cooldownMs}ms`);
    
    await this.prisma.providerState.update({
      where: { provider },
      data: {
        state: 'OPEN',
        nextRetryAt
      }
    });
  }
}
