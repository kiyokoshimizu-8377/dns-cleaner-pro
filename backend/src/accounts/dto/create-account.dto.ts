export class CreateAccountDto {
  label?: string;
  providerName: string; // cloudflare, godaddy, etc.
  apiKey: string;
  apiSecret?: string;
  email?: string;
}
