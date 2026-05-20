import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PrismaService } from './src/prisma/prisma.service';
import { DomainsService } from './src/domains/domains.service';
import { SyncService } from './src/sync/sync.service';

async function test() {
  console.log('--- Starting Workflow Engine Integration Test ---');
  const app = await NestFactory.createApplicationContext(AppModule);

  const prisma = app.get(PrismaService);
  const domainsService = app.get(DomainsService);
  const syncService = app.get(SyncService);

  // 1. Create a mock account
  const account = await prisma.account.upsert({
    where: { id: 'test-wf-account' },
    update: {},
    create: {
      id: 'test-wf-account',
      label: 'Test Workflow Account',
      providerName: 'CLOUDFLARE',
      apiKey: 'mock-api-key',
      email: 'test@example.com',
    },
  });

  // 2. Create a mock domain
  const domain = await prisma.domain.upsert({
    where: { id: 'test-wf-domain' },
    update: {
      recordsCount: 0,
      providerDomainId: 'mock-zone-id-32-chars-long-12345',
    },
    create: {
      id: 'test-wf-domain',
      domainName: 'test-wf-domain.com',
      provider: 'cloudflare',
      recordsCount: 0,
      accountId: account.id,
      providerDomainId: 'mock-zone-id-32-chars-long-12345',
    },
  });

  // Clear existing records
  await prisma.record.deleteMany({ where: { domainId: domain.id } });

  console.log('Mock account and domain prepared. Triggering Deep Sync...');

  // 3. Trigger Deep Sync Workflow
  const syncResult = await syncService.deepSyncAccount(account.id, false);
  console.log('Deep Sync start result:', syncResult);

  // 4. Poll database for Deep Sync execution outcomes
  console.log('Polling database for Deep Sync completion...');
  let syncBatch: any = null;
  let syncTasks: any[] = [];
  
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    syncBatch = await prisma.jobBatch.findUnique({
      where: { id: syncResult.batchId },
    });

    if (syncBatch) {
      syncTasks = await prisma.jobTask.findMany({
        where: { batchId: syncBatch.id },
        include: { steps: true },
      });

      console.log(`Polling Deep Sync Batch Status: ${syncBatch.status} (Completed: ${syncBatch.completedJobs}/${syncBatch.totalJobs})`);
      if (syncBatch.status === 'COMPLETED' || syncBatch.status === 'FAILED') {
        break;
      }
    }
  }

  console.log('\n--- DEEP SYNC RESULT ---');
  console.log('Batch:', syncBatch);
  console.log('Tasks & Steps:', JSON.stringify(syncTasks, null, 2));

  // Verify records synced
  const recordsAfterSync = await prisma.record.findMany({
    where: { domainId: domain.id },
  });
  console.log(`Synced Records Count: ${recordsAfterSync.length}`);
  console.log('Synced Records:', recordsAfterSync);

  // 5. Trigger Cleaner deletion
  console.log('\nTriggering Mass Deletion...');
  const deleteResult = await domainsService.massDeleteRecords(domain.id, ['A']);
  console.log('Mass Delete start result:', deleteResult);

  // 6. Poll database for Cleaner execution outcomes
  console.log('Polling database for Mass Delete completion...');
  let deleteBatch: any = null;
  let deleteTasks: any[] = [];

  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    deleteBatch = await prisma.jobBatch.findUnique({
      where: { id: deleteResult.batchId },
    });

    if (deleteBatch) {
      deleteTasks = await prisma.jobTask.findMany({
        where: { batchId: deleteBatch.id },
        include: { steps: true },
      });

      console.log(`Polling Cleaner Batch Status: ${deleteBatch.status} (Completed: ${deleteBatch.completedJobs}/${deleteBatch.totalJobs})`);
      if (deleteBatch.status === 'COMPLETED' || deleteBatch.status === 'FAILED') {
        break;
      }
    }
  }

  console.log('\n--- CLEANER RESULT ---');
  console.log('Batch:', deleteBatch);
  console.log('Tasks & Steps:', JSON.stringify(deleteTasks, null, 2));

  // Verify record was deleted from local DB
  const recordsAfterDelete = await prisma.record.findMany({
    where: { domainId: domain.id },
  });
  console.log(`Local Records Remaining: ${recordsAfterDelete.length}`);

  // 7. Clean up
  console.log('Cleaning up mock database records...');
  // Delete jobs data first
  if (syncBatch?.id) {
    for (const t of syncTasks) {
      await prisma.jobStep.deleteMany({ where: { taskId: t.id } });
    }
    await prisma.jobTask.deleteMany({ where: { batchId: syncBatch.id } });
    await prisma.jobBatch.delete({ where: { id: syncBatch.id } });
  }

  if (deleteBatch?.id) {
    for (const t of deleteTasks) {
      await prisma.jobStep.deleteMany({ where: { taskId: t.id } });
    }
    await prisma.jobTask.deleteMany({ where: { batchId: deleteBatch.id } });
    await prisma.jobBatch.delete({ where: { id: deleteBatch.id } });
  }

  await prisma.record.deleteMany({ where: { domainId: domain.id } });
  await prisma.domain.delete({ where: { id: domain.id } });
  await prisma.account.delete({ where: { id: account.id } });

  console.log('Cleanup complete.');
  await app.close();
  console.log('--- Test Finished ---');
}

test().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
