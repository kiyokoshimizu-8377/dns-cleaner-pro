import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  
  // Dynamic concurrency limits per provider
  private readonly limits: Record<string, number> = {
    cloudflare: 10,
    godaddy: 5,
    namecheap: 2,
    spaceship: 1,
  };

  private activeCounts: Record<string, number> = {};
  private waitingQueue: Record<string, (() => void)[]> = {};

  /**
   * Acquire execution slot for a specific provider.
   * Blocks if the provider has hit concurrency limit.
   */
  async acquire(provider: string): Promise<void> {
    const key = provider.toLowerCase();
    const max = this.limits[key] ?? 5; // Default fallback to 5

    if (!this.activeCounts[key]) this.activeCounts[key] = 0;
    if (!this.waitingQueue[key]) this.waitingQueue[key] = [];

    if (this.activeCounts[key] < max) {
      this.activeCounts[key]++;
      return;
    }

    this.logger.debug(`Concurrency limit of ${max} reached for ${provider}. Queuing execution...`);
    return new Promise<void>((resolve) => {
      this.waitingQueue[key].push(resolve);
    });
  }

  /**
   * Release execution slot for a specific provider, allowing next queued operation to run.
   */
  release(provider: string): void {
    const key = provider.toLowerCase();
    if (this.activeCounts[key] > 0) {
      this.activeCounts[key]--;
    }

    const next = this.waitingQueue[key]?.shift();
    if (next) {
      this.activeCounts[key]++;
      next();
    }
  }

  /**
   * Safe pacing delay helper
   */
  async throttleDelay(provider: string): Promise<void> {
    const key = provider.toLowerCase();
    // Default safe pacing delays per API call
    let delayMs = 200;
    if (key === 'cloudflare') {
      delayMs = 260; // Safe for cloudflare (4/sec rate limits)
    } else if (key === 'namecheap') {
      delayMs = 3500; // Pacing for Namecheap API firewalls
    }
    
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
