const { Queue } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || '20.112.19.16',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

async function main() {
  console.log('Connecting to Queue "clean-queue-v2" on Redis...');
  const queue = new Queue('clean-queue-v2', { connection });

  // Get active workers listening to this queue
  const workers = await queue.getWorkers();
  console.log(`\nTotal workers listening to "clean-queue-v2": ${workers.length}`);
  
  workers.forEach((worker, index) => {
    console.log(`Worker ${index + 1}: ID = ${worker.id}`);
  });

  const counts = await queue.getJobCounts();
  console.log('\n--- Job Counts for clean-queue-v2 ---');
  console.log(JSON.stringify(counts, null, 2));

  await queue.close();
}

main().catch(console.error);
