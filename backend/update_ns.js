const fs = require('fs');
const path = require('path');

// NAMECHEAP
const namecheapPath = path.join(__dirname, 'src', 'providers', 'namecheap', 'namecheap.service.ts');
let ncContent = fs.readFileSync(namecheapPath, 'utf8');

const ncMethod = `
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
      this.logger.log(\`Mock Namecheap API updateNameservers triggered for \${domainName}\`);
      return true;
    }

    const [sld, tld] = domainName.split(/\\.(.+)/);
    const clientIp = extraData?.clientIp || '1.1.1.1';

    try {
      this.logger.log(\`Updating nameservers for \${domainName} at Namecheap...\`);
      const response = await this.requestWithRetry({
        method: 'GET',
        url: this.baseUrl,
        params: {
          ...this.getBaseParams(apiKey, apiUser),
          ClientIp: clientIp,
          Command: 'namecheap.domains.dns.setCustom',
          SLD: sld,
          TLD: tld,
          Nameservers: nameServers.join(','),
        },
      });

      const responseXml = response.data;
      if (responseXml.includes('Status="ERROR"')) {
        const errorMatch = responseXml.match(/<Error[^>]*>([^<]+)<\\/Error>/);
        throw new Error(errorMatch ? errorMatch[1] : 'Unknown Namecheap API error');
      }

      return true;
    } catch (error: any) {
      this.logger.error(\`Namecheap updateNameservers Error for \${domainName}:\`, error.message);
      throw new Error(\`Namecheap API Error (Update NS): \${error.message}\`);
    }
  }
}
`;
if (!ncContent.includes('updateNameservers')) {
  ncContent = ncContent.replace(/}\s*$/, ncMethod);
  fs.writeFileSync(namecheapPath, ncContent);
  console.log('Updated Namecheap');
}

// GODADDY
const godaddyPath = path.join(__dirname, 'src', 'providers', 'godaddy', 'godaddy.service.ts');
let gdContent = fs.readFileSync(godaddyPath, 'utf8');
const gdMethod = `
  async updateNameservers(
    domainName: string,
    nameServers: string[],
    apiKey: string,
    email?: string,
    extraData?: any
  ): Promise<boolean> {
    this.logger.warn('Godaddy updateNameservers not fully implemented yet.');
    return true;
  }
}
`;
if (!gdContent.includes('updateNameservers')) {
  gdContent = gdContent.replace(/}\s*$/, gdMethod);
  fs.writeFileSync(godaddyPath, gdContent);
  console.log('Updated Godaddy');
}

// SPACESHIP
const spaceshipPath = path.join(__dirname, 'src', 'providers', 'spaceship', 'spaceship.service.ts');
let spContent = fs.readFileSync(spaceshipPath, 'utf8');
const spMethod = `
  async updateNameservers(
    domainName: string,
    nameServers: string[],
    apiKey: string,
    email?: string,
    extraData?: any
  ): Promise<boolean> {
    this.logger.warn('Spaceship updateNameservers not fully implemented yet.');
    return true;
  }
}
`;
if (!spContent.includes('updateNameservers')) {
  spContent = spContent.replace(/}\s*$/, spMethod);
  fs.writeFileSync(spaceshipPath, spContent);
  console.log('Updated Spaceship');
}
