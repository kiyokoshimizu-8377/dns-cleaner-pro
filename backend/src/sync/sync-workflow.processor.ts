import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowRunner } from '../workflows/workflow-runner.service';
import { SyncWorkflows } from './sync-workflows.service';
import { WorkflowContext } from '../workflows/types';

export interface SyncJobData {
  taskId: string;
  batchId: string;
  targetId: string;
  taskType: 'sync-account' | 'sync-domain';
  dryRun?: boolean;
}

@Processor('sync-queue', { concurrency: 2 }) // Slow lane: Process up to 2 tasks in parallel globally
export class SyncWorkflowProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncWorkflowProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowRunner: WorkflowRunner,
    private readonly syncWorkflows: SyncWorkflows
  ) {
    super();
  }

  async process(job: Job<SyncJobData, any, string>): Promise<any> {
    const { taskId, batchId, targetId, taskType, dryRun } = job.data;
    this.logger.log(`Processing sync-queue job ${job.id} for Task ${taskId} (${taskType}: ${targetId})`);

    const context: WorkflowContext = {
      batchId,
      taskId,
      targetId,
      dryRun: !!dryRun,
      bullJob: job,
    };

    let steps: any[] = [];
    if (taskType === 'sync-account') {
      steps = [this.syncWorkflows.getFetchAccountsStep()];
    } else {
      steps = [
        this.syncWorkflows.getFetchRemoteRecordsStep(),
        this.syncWorkflows.getCompareStateStep(),
        this.syncWorkflows.getApplyChangesStep(),
      ];
    }

    try {
      await this.workflowRunner.executeTask(context, steps);
      this.logger.log(`Successfully processed sync-queue job ${job.id} for Task ${taskId}`);
      return { success: true, taskId };
    } catch (error: any) {
      this.logger.error(`Failed to process sync-queue job ${job.id} for Task ${taskId}: ${error.message}`);
      throw error;
    }
  }
}
