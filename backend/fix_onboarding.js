const fs = require('fs');
const path = require('path');

const modulePath = path.join(__dirname, 'src/auto-onboarding/auto-onboarding.module.ts');
let moduleCode = fs.readFileSync(modulePath, 'utf8');
moduleCode = moduleCode.replace("import { ProvidersModule } from '../providers/providers.module';", 
`import { CloudflareModule } from '../providers/cloudflare/cloudflare.module';
import { SpaceshipModule } from '../providers/spaceship/spaceship.module';
import { GodaddyModule } from '../providers/godaddy/godaddy.module';
import { NamecheapModule } from '../providers/namecheap/namecheap.module';`);
moduleCode = moduleCode.replace("ProvidersModule,", "CloudflareModule, SpaceshipModule, GodaddyModule, NamecheapModule,");
fs.writeFileSync(modulePath, moduleCode);

const servicePath = path.join(__dirname, 'src/auto-onboarding/auto-onboarding.service.ts');
let serviceCode = fs.readFileSync(servicePath, 'utf8');
serviceCode = serviceCode.replace("import { ProvidersFactory } from '../providers/providers.factory';", 
`import { CloudflareService } from '../providers/cloudflare/cloudflare.service';
import { SpaceshipService } from '../providers/spaceship/spaceship.service';
import { GodaddyService } from '../providers/godaddy/godaddy.service';
import { NamecheapService } from '../providers/namecheap/namecheap.service';
import { DnsProvider } from '../providers/dns-provider.interface';`);
serviceCode = serviceCode.replace("private readonly providersFactory: ProvidersFactory,", 
`private readonly cloudflare: CloudflareService,
    private readonly spaceship: SpaceshipService,
    private readonly godaddy: GodaddyService,
    private readonly namecheap: NamecheapService,`);
serviceCode = serviceCode.replace("const registrarProvider = this.providersFactory.getProvider(registrarAccount.providerName);", 
`const getProvider = (name: string): DnsProvider => {
      switch (name.toLowerCase()) {
        case 'cloudflare': return this.cloudflare;
        case 'spaceship': return this.spaceship;
        case 'godaddy': return this.godaddy;
        case 'namecheap': return this.namecheap;
        default: throw new Error(\`Provider \${name} not supported\`);
      }
    };
    const registrarProvider = getProvider(registrarAccount.providerName);`);
serviceCode = serviceCode.replace("const cfProvider = this.providersFactory.getProvider('cloudflare');", "const cfProvider = this.cloudflare;");
// Add bullJobId
serviceCode = serviceCode.replace(/batchId: batch\.id,\n\s*targetId: dbDomain\.id,\n\s*status: Status\.PENDING,/g, 
`batchId: batch.id,
          targetId: dbDomain.id,
          status: Status.PENDING,
          bullJobId: \`onboard-\${dbDomain.id}-\${Date.now()}\`,`);
fs.writeFileSync(servicePath, serviceCode);

const processorPath = path.join(__dirname, 'src/auto-onboarding/auto-onboarding.processor.ts');
let processorCode = fs.readFileSync(processorPath, 'utf8');
processorCode = processorCode.replace("import { ProvidersFactory } from '../providers/providers.factory';", 
`import { CloudflareService } from '../providers/cloudflare/cloudflare.service';
import { SpaceshipService } from '../providers/spaceship/spaceship.service';
import { GodaddyService } from '../providers/godaddy/godaddy.service';
import { NamecheapService } from '../providers/namecheap/namecheap.service';
import { DnsProvider } from '../providers/dns-provider.interface';`);
processorCode = processorCode.replace("private readonly providersFactory: ProvidersFactory,", 
`private readonly cloudflare: CloudflareService,
    private readonly spaceship: SpaceshipService,
    private readonly godaddy: GodaddyService,
    private readonly namecheap: NamecheapService,`);
processorCode = processorCode.replace("const registrarProvider = this.providersFactory.getProvider(registrarAccount.providerName);", 
`const getProvider = (name: string): DnsProvider => {
      switch (name.toLowerCase()) {
        case 'cloudflare': return this.cloudflare;
        case 'spaceship': return this.spaceship;
        case 'godaddy': return this.godaddy;
        case 'namecheap': return this.namecheap;
        default: throw new Error(\`Provider \${name} not supported\`);
      }
    };
    const registrarProvider = getProvider(registrarAccount.providerName);`);
processorCode = processorCode.replace("const cfProvider = this.providersFactory.getProvider('cloudflare');", "const cfProvider = this.cloudflare;");
fs.writeFileSync(processorPath, processorCode);
