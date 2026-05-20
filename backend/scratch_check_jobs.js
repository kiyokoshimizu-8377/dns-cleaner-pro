const { Queue } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || '20.112.19.16',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

async function main() {
  console.log('Connecting to Queue "clean-queue" on Redis...');
  const queue = new Queue('clean-queue', { connection });

  // Get failed jobs
  const failedJobs = await queue.getFailed();
  console.log(`\nTotal failed jobs in queue: ${failedJobs.length}`);

  // Display details of the last 5 failed jobs
  const recentFailed = failedJobs.slice(-5);
  for (const job of recentFailed) {
    console.log(`\n--- Job ID: ${job.id} ---`);
    console.log(`Domain ID in data: ${job.data?.domainId}`);
    console.log(`Record Types: ${job.data?.types?.join(', ') || 'ALL'}`);
    console.log(`Failed Reason: ${job.failedReason}`);
    console.log(`Stacktrace: ${job.stacktrace?.join('\n')}`);
  }

  // Get active/completed/waiting counts
  const counts = await queue.getJobCounts();
  console.log('\n--- Job Counts ---');
  console.log(JSON.stringify(counts, null, 2));

  await queue.close();
}

main().catch(console.error);
