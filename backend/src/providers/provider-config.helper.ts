import { Account } from '@prisma/client';

export interface ProviderConfig {
  clientIp?: string;
  apiUser?: string;
  shopperId?: string;
  sandbox?: boolean;
}

export function getProviderConfig(account: Account): ProviderConfig {
  if (!(account as any).extraData) {
    return {};
  }
  
  // Depending on how extraData is stored (Prisma Json field), it might be a stringified JSON or already an object
  try {
    const data = typeof (account as any).extraData === 'string' ? JSON.parse((account as any).extraData) : (account as any).extraData;
    return data as ProviderConfig;
  } catch (error) {
    return {};
  }
}
