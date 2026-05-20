import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DnsProvider, DnsZone, DnsRecord, ProviderCapabilities } from '../dns-provider.interface';
import { RateLimiterService } from '../../workflows/rate-limiter.service';

@Injectable()
export class GodaddyService implements DnsProvider {
  getCapabilities(account?: any): ProviderCapabilities {
    return { canCreateZone: false, canUpdateNameservers: true, canManageDnssec: false, supportsIdempotencyKeys: false };
  }

  private readonly logger = new Logger(GodaddyService.name);
  private readonly baseUrl = 'https://api.godaddy.com/v1';

  constructor(private readonly rateLimiter: RateLimiterService) {}

  private getHeaders(apiKey: string, apiSecret?: string) {
    // GoDaddy uses Key:Secret format in Authorization header
    const cleanKey = apiKey.trim();
    const cleanSecret = apiSecret?.trim() || '';
    return {
      Authorization: `sso-key ${cleanKey}:${cleanSecret}`,
      'Content-Type': 'application/json',
    };
  }

  async getZones(apiKey: string, apiSecret?: string): Promise<DnsZone[]> {
    await this.rateLimiter.acquire('godaddy');
    try {
      await this.rateLimiter.throttleDelay('godaddy');
      this.logger.log('Fetching domains from GoDaddy...');
      const response = await axios.get(`${this.baseUrl}/domains`, {
        headers: this.getHeaders(apiKey, apiSecret),
      });

      return response.data.map((d: any) => ({
        id: d.domainId?.toString() || d.domain,
        name: d.domain,
        status: d.status,
      }));
    } catch (error: any) {
      this.logger.error(
        'GoDaddy getZones Error:',
        error.response?.data || error.message,
      );
      throw new Error(
        `GoDaddy API Error (Zones): ${error.response?.data?.message || error.message}`,
      );
    } finally {
      this.rateLimiter.release('godaddy');
    }
  }

  async getRecords(
    domain: string,
    apiKey: string,
    apiSecret?: string,
  ): Promise<DnsRecord[]> {
    await this.rateLimiter.acquire('godaddy');
    try {
      await this.rateLimiter.throttleDelay('godaddy');
      const response = await axios.get(
        `${this.baseUrl}/domains/${domain}/records`,
        {
          headers: this.getHeaders(apiKey, apiSecret),
        },
      );

      return response.data.map((r: any, index: number) => ({
        id: `${r.type}|${r.name}|${index}`, // Composite ID since GoDaddy doesn't provide record IDs
        type: r.type,
        name: r.name,
        content: r.data,
        ttl: r.ttl,
      }));
    } catch (error: any) {
      const apiCode = error.response?.data?.code;
      const apiMessage = error.response?.data?.message || '';

      if (
        apiCode === 'UNKNOWN_DOMAIN' ||
        apiCode === 'ACCESS_DENIED' ||
        apiMessage.includes('not registered') ||
        apiMessage.includes('not allowed access')
      ) {
        this.logger.warn(
          `Domain ${domain} returned ${apiCode || 'error'} from GoDaddy. Returning 0 hosted records.`,
        );
        return [];
      }

      this.logger.error(
        'GoDaddy getRecords Error:',
        error.response?.data || error.message,
      );
      throw new Error(
        `GoDaddy API Error (Records): ${error.response?.data?.message || error.message}`,
      );
    } finally {
      this.rateLimiter.release('godaddy');
    }
  }

  async deleteRecord(
    domain: string,
    recordId: string,
    apiKey: string,
    apiSecret?: string,
  ): Promise<boolean> {
    await this.rateLimiter.acquire('godaddy');
    try {
      await this.rateLimiter.throttleDelay('godaddy');
      const [type, name] = recordId.split('|');
      // GoDaddy DELETE endpoint removes ALL records of that type and name
      // This matches the "Cleaner" use case where we want to wipe records of specific types.
      await axios.delete(
        `${this.baseUrl}/domains/${domain}/records/${type}/${name}`,
        {
          headers: this.getHeaders(apiKey, apiSecret),
        },
      );
      return true;
    } catch (error: any) {
      this.logger.error(
        'GoDaddy deleteRecord Error:',
        error.response?.data || error.message,
      );
      throw new Error(
        `GoDaddy API Error (Delete): ${error.response?.data?.message || error.message}`,
      );
    } finally {
      this.rateLimiter.release('godaddy');
    }
  }

  async updateNameservers(
    domainName: string,
    nameServers: string[],
    apiKey: string,
    email?: string,
    extraData?: any
  ): Promise<boolean> {
    this.logger.warn('Godaddy updateNameservers not fully implemented yet.');
    return true;
  }
}
