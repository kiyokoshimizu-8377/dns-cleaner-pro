import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosRequestConfig, AxiosResponse, isAxiosError } from 'axios';
import {
  DnsProvider,
  DnsZone,
  DnsRecord,
  ProviderCapabilities,
} from '../dns-provider.interface';
import { RateLimiterService } from '../../workflows/rate-limiter.service';
import {
  CloudflareAccount,
  CloudflareApiResponse,
  CloudflareDnsRecord,
  CloudflareZone,
} from './cloudflare.types';

function mapZone(z: CloudflareZone): DnsZone {
  return { id: z.id, name: z.name, status: z.status };
}

function mapRecord(r: CloudflareDnsRecord): DnsRecord {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    content: r.content,
    ttl: r.ttl,
    priority: r.priority,
  };
}

function getCloudflareErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as
      | CloudflareApiResponse<unknown>
      | undefined;
    const apiMessage = data?.errors?.[0]?.message;
    if (apiMessage) return apiMessage;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

function getCloudflareErrorCode(error: unknown): number | undefined {
  if (!isAxiosError(error)) return undefined;
  const data = error.response?.data as
    | CloudflareApiResponse<unknown>
    | undefined;
  return data?.errors?.[0]?.code;
}

function getAxiosErrorPayload(error: unknown): unknown {
  if (isAxiosError(error)) {
    // 🛡️ N9iw l-headers d Axios parsing bach l-API keys ma-ymchiwch l l-logs abadan
    if (error.config?.headers) delete error.config.headers['Authorization'];
    if (error.response?.config?.headers)
      delete error.response.config.headers['Authorization'];
    return error.response?.data ?? error.message;
  }
  return error instanceof Error ? error.message : error;
}

@Injectable()
export class CloudflareService implements DnsProvider {
  // 🚀 L-ISLA7 HNA: Rddnaha true bach l-queue d sync t-doz fluid!
  getCapabilities(_account?: unknown): ProviderCapabilities {
    return {
      canCreateZone: true,
      canUpdateNameservers: true,
      canManageDnssec: true,
      supportsIdempotencyKeys: true,
    };
  }

  private readonly logger = new Logger(CloudflareService.name);
  private readonly baseUrl = 'https://api.cloudflare.com/client/v4';

  constructor(private readonly rateLimiter: RateLimiterService) {}

  private isMock(apiKey: string): boolean {
    const clean = apiKey.trim();
    return clean === 'mock-api-key' || clean.startsWith('mock-');
  }

  private getHeaders(apiKey: string): Record<string, string> {
    const cleanKey = apiKey.trim();
    return {
      Authorization: `Bearer ${cleanKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async requestWithRetry<T>(
    config: AxiosRequestConfig,
    retries = 3,
    backoff = 2000,
    isRetry = false,
  ): Promise<AxiosResponse<CloudflareApiResponse<T>>> {
    if (!isRetry) {
      await this.rateLimiter.acquire('cloudflare');
    }
    try {
      if (!isRetry) {
        await this.rateLimiter.throttleDelay('cloudflare');
      }
      return await axios.request<CloudflareApiResponse<T>>(config);
    } catch (error: unknown) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 429 && retries > 0) {
        this.logger.warn(`Rate limit hit. Retrying in ${backoff}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return this.requestWithRetry<T>(config, retries - 1, backoff * 2, true);
      }
      throw error;
    } finally {
      if (!isRetry) {
        this.rateLimiter.release('cloudflare');
      }
    }
  }

  private mockFails = 0;

  async getZones(apiKey: string, _email?: string): Promise<DnsZone[]> {
    const cleanKey = apiKey.trim();
    if (cleanKey === 'mock-small') {
      return [{ id: 'zone-small-1', name: 'small-1.com', status: 'active' }];
    } else if (cleanKey === 'mock-stress') {
      return Array.from({ length: 100 }, (_, i) => ({
        id: `zone-stress-${i}`,
        name: `stress-${i}.com`,
        status: 'active',
      }));
    } else if (cleanKey === 'mock-fail') {
      return [{ id: 'zone-fail-1', name: 'fail-1.com', status: 'active' }];
    } else if (cleanKey === 'mock-cancel') {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return [{ id: 'zone-cancel-1', name: 'cancel-1.com', status: 'active' }];
    } else if (this.isMock(apiKey)) {
      this.logger.log('Mock Cloudflare API getZones triggered');
      return [
        {
          id: 'mock-zone-id-32-chars-long-12345',
          name: 'test-wf-domain.com',
          status: 'active',
        },
      ];
    }
    try {
      this.logger.log(
        'Fetching initial page from Cloudflare to determine total pages...',
      );

      const firstResponse = await this.requestWithRetry<CloudflareZone[]>({
        method: 'GET',
        url: `${this.baseUrl}/zones`,
        headers: this.getHeaders(apiKey),
        params: { per_page: 50, page: 1 },
      });

      const firstZones = firstResponse.data.result.map(mapZone);

      const allZones: DnsZone[] = [...firstZones];
      const resultInfo = firstResponse.data.result_info ?? {};
      const totalCount = resultInfo.total_count ?? 0;
      const totalPages = resultInfo.total_pages ?? 1;

      this.logger.log(
        `Total domains found: ${totalCount}. Fetching across ${totalPages} pages...`,
      );

      if (totalPages > 1) {
        const pagesToFetch = Array.from(
          { length: totalPages - 1 },
          (_, i) => i + 2,
        );
        const chunkSize = 15;

        for (let i = 0; i < pagesToFetch.length; i += chunkSize) {
          const chunk = pagesToFetch.slice(i, i + chunkSize);

          const promises = chunk.map((page) =>
            this.requestWithRetry<CloudflareZone[]>({
              method: 'GET',
              url: `${this.baseUrl}/zones`,
              headers: this.getHeaders(apiKey),
              params: { per_page: 50, page },
            }),
          );

          const responses = await Promise.all(promises);

          for (const res of responses) {
            allZones.push(...res.data.result.map(mapZone));
          }

          this.logger.log(
            `Fetched ${allZones.length}/${totalCount} zones (Batch ${i / chunkSize + 1}/${Math.ceil(pagesToFetch.length / chunkSize)})`,
          );

          if (i + chunkSize < pagesToFetch.length) {
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        }
      }

      return allZones;
    } catch (error: unknown) {
      this.logger.error(
        'Cloudflare getZones Error:',
        getAxiosErrorPayload(error),
      );
      throw new Error(
        `Cloudflare API Error (Zones): ${getCloudflareErrorMessage(error)}`,
      );
    }
  }

  async getRecords(
    zoneId: string,
    apiKey: string,
    _email?: string,
  ): Promise<DnsRecord[]> {
    const cleanKey = apiKey.trim();
    if (cleanKey === 'mock-small') {
      return [
        {
          id: 'rec-1',
          type: 'A',
          name: 'small-1.com',
          content: '1.1.1.1',
          ttl: 3600,
        },
        {
          id: 'rec-2',
          type: 'TXT',
          name: 'small-1.com',
          content: 'test',
          ttl: 3600,
        },
      ];
    } else if (cleanKey === 'mock-stress') {
      return Array.from({ length: 10 }, (_, i) => ({
        id: `rec-stress-${zoneId}-${i}`,
        type: 'A',
        name: `stress-${zoneId}.com`,
        content: `10.0.0.${i}`,
        ttl: 3600,
      }));
    } else if (cleanKey === 'mock-fail') {
      if (this.mockFails < 2) {
        this.mockFails++;
        throw new Error('socket hang up');
      }
      this.mockFails = 0;
      return [
        {
          id: 'rec-fail-1',
          type: 'A',
          name: 'fail-1.com',
          content: '2.2.2.2',
          ttl: 3600,
        },
      ];
    } else if (cleanKey === 'mock-cancel') {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      return [
        {
          id: 'rec-cancel-1',
          type: 'A',
          name: 'cancel-1.com',
          content: '3.3.3.3',
          ttl: 3600,
        },
      ];
    } else if (this.isMock(apiKey)) {
      this.logger.log('Mock Cloudflare API getRecords triggered');
      return [
        {
          id: 'mock-rec-id',
          type: 'A',
          name: 'test-wf-record.com',
          content: '1.2.3.4',
          ttl: 3600,
        },
      ];
    }
    try {
      const response = await this.requestWithRetry<CloudflareDnsRecord[]>({
        method: 'GET',
        url: `${this.baseUrl}/zones/${zoneId}/dns_records`,
        headers: this.getHeaders(apiKey),
        params: { per_page: 500 },
      });

      return response.data.result.map(mapRecord);
    } catch (error: unknown) {
      this.logger.error(
        'Cloudflare getRecords Error:',
        getAxiosErrorPayload(error),
      );
      throw new Error(
        `Cloudflare API Error (Records): ${getCloudflareErrorMessage(error)}`,
      );
    }
  }

  async deleteRecord(
    zoneId: string,
    recordId: string,
    apiKey: string,
    _email?: string,
  ): Promise<boolean> {
    if (this.isMock(apiKey)) {
      this.logger.log('Mock Cloudflare API deleteRecord triggered');
      return true;
    }
    try {
      await this.requestWithRetry<null>({
        method: 'DELETE',
        url: `${this.baseUrl}/zones/${zoneId}/dns_records/${recordId}`,
        headers: this.getHeaders(apiKey),
      });
      return true;
    } catch (error: unknown) {
      this.logger.error(
        'Cloudflare deleteRecord Error:',
        getAxiosErrorPayload(error),
      );
      throw new Error(
        `Cloudflare API Error (Delete): ${getCloudflareErrorMessage(error)}`,
      );
    }
  }

  async getZoneIdByName(
    domainName: string,
    apiKey: string,
    _email?: string,
  ): Promise<string | null> {
    if (this.isMock(apiKey)) {
      this.logger.log('Mock Cloudflare API getZoneIdByName triggered');
      return 'mock-zone-id-32-chars-long-12345';
    }
    try {
      const response = await this.requestWithRetry<CloudflareZone[]>({
        method: 'GET',
        url: `${this.baseUrl}/zones`,
        headers: this.getHeaders(apiKey),
        params: { name: domainName },
      });
      const zone = response.data.result[0];
      return zone ? zone.id : null;
    } catch (error: unknown) {
      this.logger.error(
        `Cloudflare getZoneIdByName Error for ${domainName}:`,
        getAxiosErrorPayload(error),
      );
      return null;
    }
  }

  async getZoneDetails(
    zoneId: string,
    apiKey: string,
  ): Promise<{ id: string; nameServers: string[] } | null> {
    try {
      const response = await this.requestWithRetry<CloudflareZone>({
        method: 'GET',
        url: `${this.baseUrl}/zones/${zoneId}`,
        headers: this.getHeaders(apiKey),
      });
      const zone = response.data.result;
      return zone
        ? { id: zone.id, nameServers: zone.name_servers ?? [] }
        : null;
    } catch (error: unknown) {
      this.logger.error(
        `Cloudflare getZoneDetails Error for ${zoneId}:`,
        getCloudflareErrorMessage(error),
      );
      return null;
    }
  }

  async resolveAccountId(apiKey: string): Promise<string> {
    try {
      const zonesResp = await this.requestWithRetry<CloudflareZone[]>({
        method: 'GET',
        url: `${this.baseUrl}/zones`,
        headers: this.getHeaders(apiKey),
        params: { per_page: 1 },
      });
      const zoneAccountId = zonesResp.data.result[0]?.account?.id;
      if (zoneAccountId) {
        return zoneAccountId;
      }

      const accountsResp = await this.requestWithRetry<CloudflareAccount[]>({
        method: 'GET',
        url: `${this.baseUrl}/accounts`,
        headers: this.getHeaders(apiKey),
      });
      const accountId = accountsResp.data.result[0]?.id;
      if (accountId) {
        return accountId;
      }

      throw new Error('Could not automatically resolve Cloudflare Account ID.');
    } catch (error: unknown) {
      throw new Error(
        `Failed to resolve Cloudflare Account ID: ${getCloudflareErrorMessage(error)}`,
      );
    }
  }

  async createZone(
    domainName: string,
    apiKey: string,
    email?: string,
  ): Promise<{
    id: string;
    name: string;
    status: string;
    nameServers?: string[];
  }> {
    if (this.isMock(apiKey)) {
      return {
        id: 'mock-new-zone',
        name: domainName,
        status: 'active',
        nameServers: ['ns1.mock.com', 'ns2.mock.com'],
      };
    }

    try {
      let accountId = email;
      if (!accountId || accountId.length !== 32) {
        this.logger.log(
          `Cloudflare account ID not provided directly (got '${email ?? ''}'). Attempting to resolve automatically...`,
        );
        accountId = await this.resolveAccountId(apiKey);
      }

      const response = await this.requestWithRetry<CloudflareZone>({
        method: 'POST',
        url: `${this.baseUrl}/zones`,
        headers: this.getHeaders(apiKey),
        data: {
          name: domainName,
          account: { id: accountId },
        },
      });
      const zone = response.data.result;
      return {
        id: zone.id,
        name: zone.name,
        status: zone.status,
        nameServers: zone.name_servers,
      };
    } catch (error: unknown) {
      const errorCode = getCloudflareErrorCode(error);
      const errorMessage = getCloudflareErrorMessage(error);

      if (
        errorCode === 1061 ||
        errorMessage.toLowerCase().includes('already exists')
      ) {
        this.logger.log(
          `Zone ${domainName} already exists in Cloudflare. Idempotently fetching its nameservers.`,
        );
        const zoneId = await this.getZoneIdByName(domainName, apiKey, email);
        if (zoneId) {
          const details = await this.getZoneDetails(zoneId, apiKey);
          if (details) {
            return {
              id: zoneId,
              name: domainName,
              status: 'active',
              nameServers: details.nameServers,
            };
          }
        }
      }

      this.logger.error(
        `Cloudflare createZone Error for ${domainName}:`,
        errorMessage,
      );
      throw new Error(`Cloudflare API Error (Create Zone): ${errorMessage}`);
    }
  }
}
