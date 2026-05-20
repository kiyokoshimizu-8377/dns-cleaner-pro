import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowRunner } from '../workflows/workflow-runner.service';
import { CleanerWorkflows } from './cleaner-workflows.service';
import { WorkflowContext } from '../workflows/types';

export interface WorkflowJobData {
  taskId: string;
  batchId: string;
  domainId: string;
  types?: string[];
}

@Processor('api-queue', { concurrency: 2 }) // Process up to 2 domains in parallel
export class CleanWorkflowProcessor extends WorkerHost {
  private readonly logger = new Logger(CleanWorkflowProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowRunner: WorkflowRunner,
    private readonly cleanerWorkflows: CleanerWorkflows
  ) {
    super();
  }

  async process(job: Job<WorkflowJobData, any, string>): Promise<any> {
    const { taskId, batchId, domainId, types } = job.data;
    this.logger.log(`Processing api-queue job ${job.id} for Task ${taskId} (Domain: ${domainId})`);

    const context: WorkflowContext = {
      batchId,
      taskId,
      domainId,
      targetId: domainId,
      types,
    };

    const steps = this.cleanerWorkflows.getSteps(types);

    try {
      await this.workflowRunner.executeTask(context, steps);
      this.logger.log(`Successfully processed api-queue job ${job.id} for Task ${taskId}`);
      return { success: true, taskId };
    } catch (error) {
      this.logger.error(`Failed to process api-queue job ${job.id} for Task ${taskId}: ${error.message}`);
      throw error;
    }
  }
}
