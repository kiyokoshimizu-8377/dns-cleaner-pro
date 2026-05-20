const fs = require('fs');
const path = require('path');

const providers = ['cloudflare', 'godaddy', 'namecheap', 'spaceship'];
const baseDir = path.join(__dirname, 'src', 'providers');

const capabilitiesMap = {
  cloudflare: `{ canCreateZone: true, canUpdateNameservers: false, canManageDnssec: true, supportsIdempotencyKeys: true }`,
  godaddy: `{ canCreateZone: false, canUpdateNameservers: true, canManageDnssec: false, supportsIdempotencyKeys: false }`,
  namecheap: `{ canCreateZone: false, canUpdateNameservers: true, canManageDnssec: true, supportsIdempotencyKeys: false }`,
  spaceship: `{ canCreateZone: false, canUpdateNameservers: true, canManageDnssec: false, supportsIdempotencyKeys: false }`,
};

for (const provider of providers) {
  const filePath = path.join(baseDir, provider, `${provider}.service.ts`);
  let content = fs.readFileSync(filePath, 'utf-8');
  
  if (!content.includes('getCapabilities')) {
    // Need to import ProviderCapabilities
    content = content.replace(
      /import \{ DnsProvider, DnsZone, DnsRecord \} from '\.\.\/dns-provider\.interface';/,
      `import { DnsProvider, DnsZone, DnsRecord, ProviderCapabilities } from '../dns-provider.interface';`
    );

    const capabilitiesStr = `
  getCapabilities(account?: any): ProviderCapabilities {
    return ${capabilitiesMap[provider]};
  }
`;

    // Insert after class declaration
    content = content.replace(/implements DnsProvider \{/, `implements DnsProvider {${capabilitiesStr}`);
    
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${provider}.service.ts`);
  }
}
