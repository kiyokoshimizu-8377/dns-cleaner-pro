export interface DnsZone {
  id: string;
  name: string;
  status: string;
}

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  priority?: number;
}

export interface ProviderCapabilities {
  canCreateZone: boolean;
  canUpdateNameservers: boolean;
  canManageDnssec: boolean;
  supportsIdempotencyKeys: boolean;
}

export interface DnsProvider {
  getCapabilities(account?: any): ProviderCapabilities;
  
  getZones(apiKey: string, email?: string): Promise<DnsZone[]>;
  getRecords(
    zoneId: string,
    apiKey: string,
    email?: string,
  ): Promise<DnsRecord[]>;
  deleteRecord(
    zoneId: string,
    recordId: string,
    apiKey: string,
    email?: string,
  ): Promise<boolean>;

  createZone?(domainName: string, apiKey: string, email?: string): Promise<{ id: string; nameServers?: string[] }>;
  updateNameservers?(domainName: string, nameServers: string[], apiKey: string, email?: string, extraData?: any): Promise<boolean>;
}
