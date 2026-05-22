export function maskSecret(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 4) return '****';
  return '****' + value.slice(-4);
}

export function isMaskedSecret(value: string | null | undefined): boolean {
  return !!value && value.startsWith('****');
}

export function sanitizeAccount(account: any): any {
  if (!account) return account;
  const { apiKey, apiSecret, ...rest } = account;
  return {
    ...rest,
    apiKey: maskSecret(apiKey),
    apiSecret: maskSecret(apiSecret),
  };
}

export function omitUnchangedSecrets<T extends { apiKey?: string; apiSecret?: string }>(
  data: T,
): T {
  const next = { ...data };
  if (!next.apiKey?.trim() || isMaskedSecret(next.apiKey)) {
    delete next.apiKey;
  }
  if (!next.apiSecret?.trim() || isMaskedSecret(next.apiSecret)) {
    delete next.apiSecret;
  }
  return next;
}
