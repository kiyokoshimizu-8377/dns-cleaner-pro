const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://cleaneruser:cleanerpass@localhost:5432/dnscleaner?schema=public",
    },
  },
});

async function main() {
  const steps = await prisma.jobStep.findMany({
    where: { status: 'FAILED' },
    orderBy: { startedAt: 'desc' },
    take: 5,
    include: { task: true }
  });
  
  console.log("RECENT FAILED STEPS:");
  for (const step of steps) {
    console.log(`- Task ID: ${step.taskId}`);
    console.log(`  Step Name: ${step.name}`);
    console.log(`  Error: ${step.error}`);
    console.log(`  Target ID: ${step.task.targetId}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
