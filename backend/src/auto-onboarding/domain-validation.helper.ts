import { BadRequestException } from '@nestjs/common';

export function normalizeAndValidateDomain(domainInput: string): string | null {
  if (!domainInput || typeof domainInput !== 'string') {
    return null;
  }

  // 1. Trim & Lowercase
  let domain = domainInput.trim().toLowerCase();

  // 2. Remove protocol (http:// or https://)
  domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');

  // 3. Remove trailing path (e.g. example.com/test -> example.com)
  const slashIndex = domain.indexOf('/');
  if (slashIndex !== -1) {
    domain = domain.substring(0, slashIndex);
  }

  // 4. Remove wildcards (e.g. *.example.com -> example.com)
  if (domain.startsWith('*.')) {
    domain = domain.substring(2);
  }

  // 5. Basic domain regex validation
  // Matches valid domain names with letters, numbers, hyphens, and dots, ending in a TLD (2+ chars)
  const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
  
  if (!domainRegex.test(domain)) {
    return null;
  }

  return domain;
}
