import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SyncService } from '../sync/sync.service';
import Redis from 'ioredis';
import { CleanJobStatus, BatchStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

export interface CleanJobData {
  domainId: string;
  types?: string[];
  batchId?: string;
}

@Injectable()
export class DomainsService {
  private redisClient: Redis;

  constructor(
    private prisma: PrismaService,
    private syncService: SyncService,
    @InjectQueue('clean-queue-v2')
    private cleanQueue: Queue<CleanJobData, any, string>,
    @InjectQueue('api-queue')
    private apiQueue: Queue,
  ) {
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    });
  }

  findAll() {
    return this.prisma.domain.findMany({
      select: {
        id: true,
        domainName: true,
        provider: true,
        recordsCount: true,
        lastSync: true,
        accountId: true,
      },
      orderBy: [{ recordsCount: 'desc' }, { domainName: 'asc' }],
    });
  }

  async findOne(id: string) {
    let domain = await this.prisma.domain.findUnique({
      where: { id },
      include: {
        records: {
          orderBy: { type: 'asc' },
        },
        account: true,
      },
    });

    if (!domain) return null;

    // JIT: Just-In-Time Records Sync. If no records are present for this domain locally,
    // or if the last sync was more than 1 hour ago (stale), fetch them dynamically from the API!
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const isStale = !domain.lastSync || new Date(domain.lastSync) < oneHourAgo;

    if ((domain.records.length === 0 && domain.recordsCount > 0) || isStale) {
      try {
        await this.syncService.syncDomainRecords(id);

        // Fetch again with populated records
        domain = await this.prisma.domain.findUnique({
          where: { id },
          include: {
            records: {
              orderBy: { type: 'asc' },
            },
            account: true,
          },
        });
      } catch (error) {
        // Just log the error and return empty records so the app doesn't crash
        console.error(`JIT Records sync failed:`, error);
      }
    }

    return domain;
  }

  async syncDomainRecords(id: string) {
    return this.syncService.syncDomainRecords(id);
  }

  async massDeleteRecords(domainId: string, types?: string[]) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      include: { records: true },
    });

    if (!domain) throw new Error('Domain not found');

    const batchId = randomUUID();

    // Reset cancellation flag before new queue
    await this.redisClient.del('mass_clean_cancelled');
    await this.cleanQueue.resume();

    // 1. Old Engine write
    const job = await this.cleanQueue.add('clean-job', {
      domainId,
      types,
      batchId,
    });

    await this.prisma.cleanJob.create({
      data: {
        bullJobId: job.id!,
        domainId: domain.id,
        status: CleanJobStatus.PENDING,
      },
    });

    // 2. New Engine write
    await this.prisma.jobBatch.create({
      data: {
        id: batchId,
        type: 'MASS_CLEAN',
        totalJobs: 1,
        status: 'PENDING',
      },
    });

    const taskId = randomUUID();
    await this.prisma.jobTask.create({
      data: {
        id: taskId,
        batchId,
        targetId: domainId,
        status: 'PENDING',
        bullJobId: `workflow_${taskId}`,
      },
    });

    await this.apiQueue.add(
      'mass-clean-task',
      {
        taskId,
        batchId,
        domainId,
        types,
      },
      { jobId: `workflow_${taskId}` }
    );

    return {
      message: `Mass delete job queued`,
      jobId: job.id,
      batchId: batchId,
      domainName: domain.domainName,
    };
  }

  async bulkMassDelete(domainNames: string[], types?: string[]) {
    const domains = await this.prisma.domain.findMany({
      where: { domainName: { in: domainNames } },
    });

    if (domains.length === 0) {
      throw new BadRequestException(
        'None of the specified domains were found in the local database. Please ensure they are synced first.',
      );
    }

    const batchId = randomUUID();

    // 1. Old Engine write
    await this.prisma.cleanBatch.create({
      data: {
        id: batchId,
        totalJobs: domains.length,
        status: BatchStatus.PENDING,
      },
    });

    await this.cleanQueue.resume();

    const jobs = await Promise.all(
      domains.map((domain) =>
        this.cleanQueue.add(
          'clean-job',
          { domainId: domain.id, types, batchId },
          { jobId: `${batchId}_${domain.id}` },
        ),
      ),
    );

    await this.prisma.cleanJob.createMany({
      data: jobs.map((j) => ({
        bullJobId: j.id!,
        domainId: j.data.domainId,
        batchId: batchId,
        status: CleanJobStatus.PENDING,
      })),
    });

    // 2. New Engine write
    await this.prisma.jobBatch.create({
      data: {
        id: batchId,
        type: 'MASS_CLEAN',
        totalJobs: domains.length,
        status: 'PENDING',
      },
    });

    const tasksData = domains.map((domain) => {
      const taskId = randomUUID();
      return {
        id: taskId,
        batchId,
        targetId: domain.id,
        status: 'PENDING' as const,
        bullJobId: `workflow_${taskId}`,
      };
    });

    for (const task of tasksData) {
      await this.prisma.jobTask.create({ data: task });
    }

    await Promise.all(
      tasksData.map((task) =>
        this.apiQueue.add(
          'mass-clean-task',
          {
            taskId: task.id,
            batchId: task.batchId,
            domainId: task.targetId,
            types,
          },
          { jobId: `workflow_${task.id}` }
        )
      )
    );

    return {
      message: `${jobs.length} bulk delete jobs queued`,
      batchId: batchId,
      jobIds: jobs.map((j) => j.id),
    };
  }

  async getActiveJobs() {
    const jobs = await this.cleanQueue.getJobs(['active', 'waiting']);

    // Get domain details for these jobs to show names in the UI
    const domainIds = jobs.map((j) => j.data.domainId).filter(Boolean);
    const domains = await this.prisma.domain.findMany({
      where: { id: { in: domainIds } },
      select: { id: true, domainName: true },
    });

    const domainMap = new Map(domains.map((d) => [d.id, d.domainName]));

    return Promise.all(
      jobs.map(async (job) => ({
        id: job.id,
        progress: job.progress,
        status: await job.getState(),
        domainId: job.data.domainId,
        domainName: domainMap.get(job.data.domainId) || 'Unknown Domain',
        types: job.data.types,
      })),
    );
  }

  async getJobStatus(jobId: string) {
    const job = await this.cleanQueue.getJob(jobId);
    if (!job) throw new Error('Job not found');

    // Sync state with DB
    let status: string = await job.getState();
    const batchId = job.data?.batchId;

    let isCancelled = false;
    if (batchId) {
      isCancelled =
        (await this.redisClient.get(`mass_clean_cancelled:${batchId}`)) === '1';
    }

    if (isCancelled && (status === 'active' || status === 'waiting')) {
      status = 'cancelled';
    }

    let dbStatus: CleanJobStatus = CleanJobStatus.RUNNING;
    if (status === 'completed') dbStatus = CleanJobStatus.COMPLETED;
    if (status === 'failed') dbStatus = CleanJobStatus.FAILED;
    if (status === 'cancelled') dbStatus = CleanJobStatus.CANCELLED;
    if (status === 'waiting' || status === 'delayed')
      dbStatus = CleanJobStatus.PENDING;

    await this.prisma.cleanJob.updateMany({
      where: { bullJobId: jobId },
      data: {
        status: dbStatus,
        progress: Number(job.progress) || 0,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        result: job.returnvalue
          ? JSON.parse(JSON.stringify(job.returnvalue))
          : null,
      },
    });

    return {
      id: job.id,
      progress: job.progress,
      status: status,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      result: job.returnvalue,
    };
  }

  async pauseQueue() {
    await this.cleanQueue.pause();
    return { message: 'Queue paused' };
  }

  async resumeQueue() {
    await this.cleanQueue.resume();
    return { message: 'Queue resumed' };
  }

  async cancelBatch(batchId: string) {
    // Set flag in Redis with a 24h expiration
    await this.redisClient.set(
      `mass_clean_cancelled:${batchId}`,
      '1',
      'EX',
      86400,
    );

    // Filter waiting jobs and remove only those matching this batchId
    const waitingJobs = await this.cleanQueue.getWaiting();
    let removedCount = 0;
    for (const job of waitingJobs) {
      if (job.data?.batchId === batchId) {
        await job.remove();
        removedCount++;
      }
    }

    // Filter and remove waiting jobs from apiQueue
    const apiWaitingJobs = await this.apiQueue.getWaiting();
    for (const job of apiWaitingJobs) {
      if (job.data?.batchId === batchId) {
        await job.remove().catch(() => {});
      }
    }

    // Update DB state
    await this.prisma.cleanBatch.updateMany({
      where: { id: batchId },
      data: {
        status: BatchStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: 'USER_REQUEST',
      },
    });

    await this.prisma.cleanJob.updateMany({
      where: {
        batchId: batchId,
        status: { in: [CleanJobStatus.PENDING, CleanJobStatus.RUNNING] },
      },
      data: { status: CleanJobStatus.CANCELLED },
    });

    // Update New Engine DB state
    await this.prisma.jobBatch.update({
      where: { id: batchId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    }).catch(() => {});

    await this.prisma.jobTask.updateMany({
      where: {
        batchId: batchId,
        status: { in: ['PENDING', 'RUNNING'] },
      },
      data: { status: 'CANCELLED' },
    }).catch(() => {});

    await this.prisma.jobStep.updateMany({
      where: {
        task: { batchId: batchId },
        status: { in: ['PENDING', 'RUNNING'] },
      },
      data: { status: 'CANCELLED', completedAt: new Date() },
    }).catch(() => {});

    return {
      message: `Batch ${batchId} cancelled. ${removedCount} waiting jobs discarded. Active jobs will halt shortly.`,
      batchId,
    };
  }

  async getQueueMetrics() {
    const [waiting, active, completed, failed, delayed, paused] =
      await Promise.all([
        this.cleanQueue.getWaitingCount(),
        this.cleanQueue.getActiveCount(),
        this.cleanQueue.getCompletedCount(),
        this.cleanQueue.getFailedCount(),
        this.cleanQueue.getDelayedCount(),
        this.cleanQueue.isPaused(),
      ]);
    const isCancelling =
      (await this.redisClient.get('mass_clean_cancelled')) === '1';

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
      isCancelling,
    };
  }

  remove(id: string) {
    return this.prisma.domain.delete({
      where: { id },
    });
  }
}
