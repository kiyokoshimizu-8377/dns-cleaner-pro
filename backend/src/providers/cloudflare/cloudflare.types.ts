export interface CloudflareApiError {
  code: number;
  message: string;
}

export interface CloudflareResultInfo {
  total_count?: number;
  total_pages?: number;
}

export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
  name_servers?: string[];
  account?: { id: string };
}

export interface CloudflareDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  priority?: number;
}

export interface CloudflareAccount {
  id: string;
}

export interface CloudflareApiResponse<T> {
  success: boolean;
  result: T;
  result_info?: CloudflareResultInfo;
  errors?: CloudflareApiError[];
}
