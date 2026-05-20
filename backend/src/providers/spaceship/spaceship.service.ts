import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DnsProvider, DnsZone, DnsRecord, ProviderCapabilities } from '../dns-provider.interface';
import { RateLimiterService } from '../../workflows/rate-limiter.service';

@Injectable()
export class SpaceshipService implements DnsProvider {
  getCapabilities(account?: any): ProviderCapabilities {
    return { canCreateZone: false, canUpdateNameservers: true, canManageDnssec: false, supportsIdempotencyKeys: false };
  }

  private readonly logger = new Logger(SpaceshipService.name);
  private readonly baseUrl = 'https://spaceship.dev/api/v1';

  constructor(private readonly rateLimiter: RateLimiterService) {}

  private getHeaders(apiKey: string, apiSecret: string) {
    return {
      'X-Api-Key': apiKey.trim(),
      'X-Api-Secret': apiSecret.trim(),
      'Content-Type': 'application/json',
    };
  }

  private async requestWithRetry<T>(
    fn: () => Promise<T>,
    retries = 3,
    delay = 1500,
    isRetry = false,
  ): Promise<T> {
    if (!isRetry) {
      await this.rateLimiter.acquire('spaceship');
    }
    try {
      if (!isRetry) {
        await this.rateLimiter.throttleDelay('spaceship');
      }
      return await fn();
    } catch (error: any) {
      const errorMsg = error.message || '';
      const isTransient =
        errorMsg.includes('socket hang up') ||
        errorMsg.includes('ECONNRESET') ||
        errorMsg.includes('ETIMEDOUT') ||
        error.response?.status === 429 ||
        error.response?.status === 502 ||
        error.response?.status === 503 ||
        error.response?.status === 504;

      if (retries > 0 && isTransient) {
        this.logger.warn(
          `Spaceship API Transient error: ${errorMsg}. Retrying in ${delay}ms... (${retries} left)`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.requestWithRetry(fn, retries - 1, delay * 1.5, true);
      }
      throw error;
    } finally {
      if (!isRetry) {
        this.rateLimiter.release('spaceship');
      }
    }
  }

  async getZones(apiKey: string, apiSecret: string): Promise<DnsZone[]> {
    try {
      this.logger.log('Fetching domains from Spaceship...');
      const allZones: DnsZone[] = [];
      let skip = 0;
      const take = 100;
      let hasMore = true;

      while (hasMore) {
        const response = await this.requestWithRetry(() =>
          axios.get(`${this.baseUrl}/domains`, {
            headers: this.getHeaders(apiKey, apiSecret),
            params: {
              take,
              skip,
            },
          }),
        );

        const domains = response.data.items || response.data || [];

        const zones = domains.map((d: any) => ({
          id: d.id || d.name,
          name: d.name,
          status: d.status || 'active',
        }));

        allZones.push(...zones);

        const total = response.data.total || 0;
        if (allZones.length >= total || domains.length < take) {
          hasMore = false;
        } else {
          skip += take;
        }
      }

      this.logger.log(
        `Successfully fetched ${allZones.length} domains from Spaceship.`,
      );
      return allZones;
    } catch (error: any) {
      this.logger.error(
        'Spaceship getZones Error:',
        error.response?.data || error.message,
      );
      const errorMsg = error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;
      throw new Error(`Spaceship API Error (Zones): ${errorMsg}`);
    }
  }

  async getRecords(
    domainName: string,
    apiKey: string,
    apiSecret: string,
  ): Promise<DnsRecord[]> {
    try {
      const allRecords: DnsRecord[] = [];
      let skip = 0;
      const take = 100;
      let hasMore = true;

      while (hasMore) {
        const response = await this.requestWithRetry(() =>
          axios.get(`${this.baseUrl}/dns/records/${domainName}`, {
            headers: this.getHeaders(apiKey, apiSecret),
            params: {
              take,
              skip,
            },
          }),
        );

        const records = response.data.items || response.data || [];

        const mapped = records.map((r: any) => {
          const contentValue =
            r.content ||
            r.address ||
            r.value ||
            r.cname ||
            r.exchange ||
            r.target ||
            '';
          return {
            id: r.id ? String(r.id) : undefined,
            type: r.type,
            name: r.name,
            content: String(contentValue),
            ttl: r.ttl ? parseInt(r.ttl, 10) : 3600,
            priority:
              r.priority || r.preference
                ? parseInt(r.priority || r.preference, 10)
                : undefined,
          };
        });

        allRecords.push(...mapped);

        const total = response.data.total || 0;
        if (allRecords.length >= total || records.length < take) {
          hasMore = false;
        } else {
          skip += take;
        }
      }

      return allRecords;
    } catch (error: any) {
      this.logger.error(
        'Spaceship getRecords Error:',
        error.response?.data || error.message,
      );
      const errorMsg = error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;
      throw new Error(`Spaceship API Error (Records): ${errorMsg}`);
    }
  }

  async deleteRecord(
    domainName: string,
    recordId: string,
    apiKey: string,
    apiSecret: string,
  ): Promise<boolean> {
    try {
      await this.requestWithRetry(() =>
        axios.delete(`${this.baseUrl}/dns/records/${domainName}/${recordId}`, {
          headers: this.getHeaders(apiKey, apiSecret),
        }),
      );
      return true;
    } catch (error: any) {
      this.logger.error(
        'Spaceship deleteRecord Error:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Spaceship API Error (Delete): ${error.response?.data?.message || error.message}`,
      );
    }
  }

  async updateNameservers(
    domainName: string,
    nameServers: string[],
    apiKey: string,
    email?: string,
    extraData?: any
  ): Promise<boolean> {
    this.logger.warn('Spaceship updateNameservers not fully implemented yet.');
    return true;
  }
}
