import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DnsProvider, DnsZone, DnsRecord, ProviderCapabilities } from '../dns-provider.interface';
import { RateLimiterService } from '../../workflows/rate-limiter.service';

@Injectable()
export class NamecheapService implements DnsProvider {
  getCapabilities(account?: any): ProviderCapabilities {
    return { canCreateZone: false, canUpdateNameservers: true, canManageDnssec: true, supportsIdempotencyKeys: false };
  }

  private readonly logger = new Logger(NamecheapService.name);
  private readonly baseUrl = 'https://api.namecheap.com/xml.response';

  constructor(private readonly rateLimiter: RateLimiterService) {}

  private getBaseParams(apiKey: string, apiUser: string) {
    return {
      ApiKey: apiKey.trim(),
      ApiUser: apiUser.trim(),
      UserName: apiUser.trim(),
      ClientIp: '1.1.1.1', // Placeholder, usually required by Namecheap
    };
  }

  async getZones(apiKey: string, apiUser: string): Promise<DnsZone[]> {
    try {
      this.logger.log('Fetching domains from Namecheap...');

      let page = 1;
      const pageSize = 100;
      const allZones: DnsZone[] = [];
      let hasMore = true;

      while (hasMore) {
        await this.rateLimiter.acquire('namecheap');
        let response;
        try {
          await this.rateLimiter.throttleDelay('namecheap');
          response = await axios.get(this.baseUrl, {
            params: {
              ...this.getBaseParams(apiKey, apiUser),
              Command: 'namecheap.domains.getList',
              Page: page,
              PageSize: pageSize,
            },
          });
        } finally {
          this.rateLimiter.release('namecheap');
        }

        const xml = response.data;

        // Check for Namecheap API errors
        if (xml.includes('Status="ERROR"')) {
          const errorMatch = xml.match(/<Error.*?>(.*?)<\/Error>/);
          const errorMsg = errorMatch
            ? errorMatch[1]
            : 'Unknown Namecheap API Error';
          throw new Error(errorMsg);
        }

        const domainMatches = [...xml.matchAll(/<Domain\s+([^>]*)\/>/g)];
        const zones = domainMatches
          .map((m: any) => {
            const attrStr = m[1];
            const idMatch = attrStr.match(/ID="([^"]*)"/);
            const nameMatch = attrStr.match(/Name="([^"]*)"/);
            const expiredMatch = attrStr.match(/IsExpired="([^"]*)"/);

            return {
              id: idMatch ? idMatch[1] : '',
              name: nameMatch ? nameMatch[1] : '',
              status:
                expiredMatch && expiredMatch[1] === 'true'
                  ? 'expired'
                  : 'active',
            };
          })
          .filter((d) => d.id && d.name);

        allZones.push(...zones);

        // Parse paging info
        const totalItemsMatch = xml.match(/<TotalItems>(\d+)<\/TotalItems>/);
        const totalItems = totalItemsMatch
          ? parseInt(totalItemsMatch[1], 10)
          : 0;

        if (allZones.length >= totalItems || zones.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }

      this.logger.log(
        `Successfully fetched ${allZones.length} domains from Namecheap.`,
      );
      return allZones;
    } catch (error: any) {
      this.logger.error('Namecheap getZones Error:', error.message);
      throw new Error(`Namecheap API Error (Zones): ${error.message}`);
    }
  }

  async getRecords(
    domain: string,
    apiKey: string,
    apiUser: string,
  ): Promise<DnsRecord[]> {
    await this.rateLimiter.acquire('namecheap');
    try {
      await this.rateLimiter.throttleDelay('namecheap');
      const firstDotIndex = domain.indexOf('.');
      const sld =
        firstDotIndex !== -1 ? domain.substring(0, firstDotIndex) : domain;
      const tld =
        firstDotIndex !== -1 ? domain.substring(firstDotIndex + 1) : '';

      const response = await axios.get(this.baseUrl, {
        params: {
          ...this.getBaseParams(apiKey, apiUser),
          Command: 'namecheap.domains.dns.getHosts',
          SLD: sld,
          TLD: tld,
        },
      });

      const xml = response.data;

      // Check for Namecheap API errors
      if (xml.includes('Status="ERROR"')) {
        const errorMatch = xml.match(/<Error.*?>(.*?)<\/Error>/);
        const errorMsg = errorMatch
          ? errorMatch[1]
          : 'Unknown Namecheap API Error';

        // Handle Custom Nameservers gracefully (0 hosted records on Namecheap)
        if (errorMsg.includes('proper DNS servers')) {
          this.logger.warn(
            `Domain ${domain} is using Custom Nameservers. Returning 0 hosted records.`,
          );
          return [];
        }

        throw new Error(errorMsg);
      }

      const hostMatches = [...xml.matchAll(/<host\s+([^>]*)\/>/g)];

      return hostMatches.map((m: any) => {
        const attrStr = m[1];
        const idMatch = attrStr.match(/HostId="([^"]*)"/);
        const typeMatch = attrStr.match(/Type="([^"]*)"/);
        const nameMatch = attrStr.match(/Name="([^"]*)"/);
        const addressMatch = attrStr.match(/Address="([^"]*)"/);
        const mxPrefMatch = attrStr.match(/MXPref="([^"]*)"/);
        const ttlMatch = attrStr.match(/TTL="([^"]*)"/);

        return {
          id: idMatch ? idMatch[1] : '',
          type: typeMatch ? typeMatch[1] : '',
          name: nameMatch ? nameMatch[1] : '',
          content: addressMatch ? addressMatch[1] : '',
          ttl: ttlMatch ? parseInt(ttlMatch[1], 10) : 60,
          priority: mxPrefMatch ? parseInt(mxPrefMatch[1], 10) : 10,
        };
      });
    } catch (error: any) {
      this.logger.error('Namecheap getRecords Error:', error.message);
      throw new Error(`Namecheap API Error (Records): ${error.message}`);
    } finally {
      this.rateLimiter.release('namecheap');
    }
  }

  async deleteRecord(
    zoneId: string,
    recordId: string,
    apiKey: string,
    apiUser?: string,
  ): Promise<boolean> {
    this.logger.warn(
      'Namecheap API requires sending ALL records to update/delete. This requires reading all records first. Implement carefully.',
    );
    return false;
  }

  async updateNameservers(
    domainName: string,
    nameServers: string[],
    apiKey: string,
    apiUser?: string,
    extraData?: any
  ): Promise<boolean> {
    if (!apiUser) {
      throw new Error('Namecheap requires apiUser to update nameservers.');
    }

    if (apiKey.trim() === 'mock-api-key' || apiKey.trim().startsWith('mock-')) {
      this.logger.log(`Mock Namecheap API updateNameservers triggered for ${domainName}`);
      return true;
    }

    const [sld, tld] = domainName.split(/\.(.+)/);
    const clientIp = extraData?.clientIp || '1.1.1.1';

    try {
      this.logger.log(`Updating nameservers for ${domainName} at Namecheap...`);
      
      // Namecheap uses a rate limiter for all calls.
      await this.rateLimiter.acquire('namecheap');
      
      let responseXml = '';
      try {
        await this.rateLimiter.throttleDelay('namecheap');
        const response = await axios.get(this.baseUrl, {
          params: {
            ...this.getBaseParams(apiKey, apiUser),
            ClientIp: clientIp,
            Command: 'namecheap.domains.dns.setCustom',
            SLD: sld,
            TLD: tld,
            Nameservers: nameServers.join(','),
          },
        });
        responseXml = response.data;
      } finally {
        this.rateLimiter.release('namecheap');
      }

      if (responseXml.includes('Status="ERROR"')) {
        const errorMatch = responseXml.match(/<Error[^>]*>([^<]+)<\/Error>/);
        throw new Error(errorMatch ? errorMatch[1] : 'Unknown Namecheap API error');
      }

      return true;
    } catch (error: any) {
      this.logger.error(`Namecheap updateNameservers Error for ${domainName}:`, error.message);
      throw new Error(`Namecheap API Error (Update NS): ${error.message}`);
    }
  }
}
