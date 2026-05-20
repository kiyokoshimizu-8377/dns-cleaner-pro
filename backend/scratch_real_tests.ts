import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PrismaService } from './src/prisma/prisma.service';
import { SyncService } from './src/sync/sync.service';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function cleanupMockData(prisma: PrismaService, accountId: string) {
  const domains = await prisma.domain.findMany({ where: { accountId } });
  
  for (const d of domains) {
    await prisma.record.deleteMany({ where: { domainId: d.id } });
  }
  await prisma.domain.deleteMany({ where: { accountId } });

  // Clean jobs history
  const tasks = await prisma.jobTask.findMany({ where: { targetId: accountId } });
  for (const t of tasks) {
    await prisma.jobStep.deleteMany({ where: { taskId: t.id } });
    await prisma.jobTask.delete({ where: { id: t.id } });
  }
  await prisma.account.delete({ where: { id: accountId } });
}

async function setupMockAccount(prisma: PrismaService, accountId: string, apiKey: string) {
  return prisma.account.upsert({
    where: { id: accountId },
    update: { apiKey },
    create: {
      id: accountId,
      label: `Test Account ${accountId}`,
      providerName: 'CLOUDFLARE',
      apiKey,
      email: 'test@example.com',
    },
  });
}

async function runScenario(scenarioName: string, accountId: string, apiKey: string, syncService: SyncService, prisma: PrismaService, cancelMidway = false) {
  console.log(`\n\n=== RUNNING SCENARIO: ${scenarioName} ===`);
  await setupMockAccount(prisma, accountId, apiKey);

  console.log(`Starting Deep Sync...`);
  const syncResult = await syncService.deepSyncAccount(accountId, false);
  console.log('Result:', syncResult);

  let batchId = syncResult.batchId;
  let batchStatus = 'PENDING';
  
  let loopCount = 0;
  while (loopCount < 120) { // Max 120 seconds wait per scenario
    await delay(1000);
    loopCount++;

    if (cancelMidway && loopCount === 3) { // Attempt cancellation 3 seconds in
      console.log(`[!] Initiating cancellation for batch ${batchId}...`);
      await prisma.jobBatch.update({
        where: { id: batchId },
        data: { status: 'CANCELLED', cancelReason: 'USER_TEST_CANCELLATION' }
      });
    }

    const batch = await prisma.jobBatch.findUnique({ where: { id: batchId } });
    if (!batch) break;

    batchStatus = batch.status;
    const completedTasks = await prisma.jobTask.count({ where: { batchId, status: 'COMPLETED' } });
    const failedTasks = await prisma.jobTask.count({ where: { batchId, status: 'FAILED' } });
    const totalTasks = await prisma.jobTask.count({ where: { batchId } });

    process.stdout.write(`\rStatus: ${batchStatus} | Completed: ${completedTasks}/${totalTasks} | Failed: ${failedTasks}`);

    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(batchStatus)) {
      break;
    }
  }

  console.log(`\nScenario ${scenarioName} finished with batch status: ${batchStatus}`);

  const totalDomains = await prisma.domain.count({ where: { accountId } });
  const totalRecords = await prisma.record.count({ where: { domain: { accountId } } });
  console.log(`Outcome DB State -> Domains: ${totalDomains}, Records: ${totalRecords}`);

  console.log('Cleaning up scenario data...');
  await cleanupMockData(prisma, accountId);
}

async function main() {
  console.log('--- Starting Real Deep Sync Workflows Tests ---');
  const app = await NestFactory.createApplicationContext(AppModule);

  const prisma = app.get(PrismaService);
  const syncService = app.get(SyncService);

  // Scenario 1: Small Sync
  await runScenario('Small Sync', 'acc-small', 'mock-small', syncService, prisma);

  // Scenario 2: Transient Failure Recovery
  await runScenario('Transient Failure Recovery', 'acc-fail', 'mock-fail', syncService, prisma);

  // Scenario 3: Cancellation
  await runScenario('Cancellation', 'acc-cancel', 'mock-cancel', syncService, prisma, true);

  // Scenario 4: Stress Test (100 domains, 10 records each)
  await runScenario('Stress Test (100 domains)', 'acc-stress', 'mock-stress', syncService, prisma);

  await app.close();
  console.log('\n--- All Scenarios Finished ---');
}

main().catch((err) => {
  console.error('Stress test execution failed:', err);
  process.exit(1);
});
