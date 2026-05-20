require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const domainsToTest = [
  'espadongazebo.work',
  'repellentinez.work',
  'unfieldedalphorn.work',
  'letdownsantimi.work',
  'taskmrnest.work',
  'tidebearishly.work',
  'vinestalkdonable.work',
  'initiarywahabi.work',
  'infoglidemd.work',
  'isopycnicsac.work',
  'dialecticinize.work'
];

async function main() {
  console.log('--- Database Diagnosis ---');
  
  const totalDomains = await prisma.domain.count();
  console.log(`Total domains in database: ${totalDomains}`);

  const matchedDomains = await prisma.domain.findMany({
    where: { domainName: { in: domainsToTest } },
    include: {
      account: true,
      records: {
        select: { id: true, type: true }
      }
    }
  });

  console.log(`Matched domains count: ${matchedDomains.length}`);
  
  matchedDomains.forEach(d => {
    console.log(`Domain: ${d.domainName} (${d.provider}) | Total records in DB: ${d.records.length} | recordsCount field: ${d.recordsCount}`);
  });

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  prisma.$disconnect();
});
