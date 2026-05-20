export class StartOnboardingDto {
  mode: 'FULL_ACCOUNT' | 'SELECTED_DOMAINS' | 'MANUAL_LIST';
  cloudflareAccountId: string;
  registrarAccountId?: string;
  selectedDomains?: string[];
  manualDomains?: string[];
  dryRun?: boolean;
  ownershipVerificationMode?: 'NONE' | 'REGISTRAR_MATCH';
}
