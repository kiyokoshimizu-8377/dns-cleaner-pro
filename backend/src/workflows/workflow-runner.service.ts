import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StepDefinition, WorkflowContext } from './types';
import { Status, AccountHealth } from '@prisma/client';
import { WorkflowEventsService } from './workflow-events.service';
import { CircuitBreakerOpenException, SecurityWorkflowError, BusinessWorkflowError } from './errors';
import { DelayedError } from 'bullmq';

@Injectable()
export class WorkflowRunner {
  private readonly logger = new Logger(WorkflowRunner.name);
  private readonly defaultTimeoutMs = 5 * 60 * 1000; // Default 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: WorkflowEventsService,
  ) {}

  /**
   * Executes a sequence of steps for a given task, updating database states, enforcing timeouts, retries, and cancellation.
   */
  async executeTask(
    context: WorkflowContext,
    steps: StepDefinition[]
  ): Promise<void> {
    const { taskId, batchId, targetId } = context;
    this.logger.log(`Starting execution for Task ${taskId} in Batch ${batchId}`);

    // Attach heartbeat function to the context
    context.heartbeat = async () => {
      this.logger.debug(`Heartbeat received for Task ${taskId}`);
      await this.prisma.jobTask.update({
        where: { id: taskId },
        data: { updatedAt: new Date() },
      }).catch((err) => {
        this.logger.error(`Failed to record heartbeat for Task ${taskId}: ${err.message}`);
      });
      this.eventsService.emitWorkflowEvent({
        batchId,
        taskId,
        type: 'task_updated',
        data: { status: Status.RUNNING, updatedAt: new Date() }
      });
    };

    // Update Task status to RUNNING
    await this.prisma.jobTask.update({
      where: { id: taskId },
      data: { status: Status.RUNNING },
    });
    this.eventsService.emitWorkflowEvent({
      batchId,
      taskId,
      type: 'task_updated',
      data: { status: Status.RUNNING }
    });

    try {
      for (const stepDef of steps) {
        // 1. Check for cancellation before executing each step
        const isCancelled = await this.checkCancellation(batchId, taskId);
        if (isCancelled) {
          this.logger.log(`Task ${taskId} cancelled before starting step ${stepDef.name}`);
          return;
        }

        // 2. Initialize the step in the DB or get existing step to support resuming/idempotency
        let step = await this.prisma.jobStep.findFirst({
          where: { taskId, name: stepDef.name },
        });

        if (!step) {
          step = await this.prisma.jobStep.create({
            data: {
              taskId,
              name: stepDef.name,
              status: Status.PENDING,
            },
          });
        }

        // If the step is already completed, skip it (Idempotency / Resume support)
        if (step.status === Status.COMPLETED) {
          this.logger.log(`Step ${stepDef.name} for Task ${taskId} is already COMPLETED. Skipping.`);
          continue;
        }

        // 3. Update task current step and step status to RUNNING
        await this.prisma.jobTask.update({
          where: { id: taskId },
          data: { currentStep: stepDef.name },
        });
        await this.prisma.jobStep.update({
          where: { id: step.id },
          data: { status: Status.RUNNING, startedAt: new Date() },
        });

        this.eventsService.emitWorkflowEvent({
          batchId,
          taskId,
          type: 'step_updated',
          data: { stepName: stepDef.name, status: Status.RUNNING }
        });

        // Record BEFORE snapshot
        const beforeData = { timestamp: new Date().toISOString() };
        await this.prisma.stepSnapshot.create({
          data: { stepId: step.id, type: 'BEFORE', data: beforeData }
        });

        const stepStartTime = Date.now();

        // 4. Execute the step with retries & timeouts
        try {
          await this.executeStepWithRetries(context, stepDef);

          const stepDurationMs = Date.now() - stepStartTime;

          // Record AFTER snapshot
          const afterData = { timestamp: new Date().toISOString(), ...context.stepResultData };
          await this.prisma.stepSnapshot.create({
            data: { stepId: step.id, type: 'AFTER', data: afterData, durationMs: stepDurationMs }
          });

          // Mark step as COMPLETED
          await this.prisma.jobStep.update({
            where: { id: step.id },
            data: { 
              status: Status.COMPLETED, 
              completedAt: new Date(),
              externalRequestId: context.externalRequestId,
              idempotencyKey: context.idempotencyKey,
              resultData: context.stepResultData || {}
            },
          });

          this.eventsService.emitWorkflowEvent({
            batchId,
            taskId,
            type: 'step_updated',
            data: { stepName: stepDef.name, status: Status.COMPLETED }
          });
          
          // Clear context specific data for next step
          delete context.externalRequestId;
          delete context.idempotencyKey;
          delete context.stepResultData;

        } catch (error: any) {
          // If we intentionally delayed the job via bullmq, stop execution gracefully
          if (error.name === 'DelayedError') {
            this.logger.warn(`Task ${taskId} is delayed by circuit breaker. Suspending execution.`);
            return;
          }

          // Check if error is due to cancellation during execution
          const isStillCancelled = await this.checkCancellation(batchId, taskId);
          if (isStillCancelled) {
            this.logger.log(`Task ${taskId} execution stopped due to cancellation.`);
            return;
          }
          
          // Record ERROR snapshot
          await this.prisma.stepSnapshot.create({
            data: { stepId: step.id, type: 'ERROR', data: { error: error.message, stack: error.stack }, durationMs: Date.now() - stepStartTime }
          });

          // Mark step as FAILED
          const cleanMessage = error.message || 'Unknown step execution error';
          await this.prisma.jobStep.update({
            where: { id: step.id },
            data: {
              status: Status.FAILED,
              completedAt: new Date(),
              error: cleanMessage,
            },
          });

          this.eventsService.emitWorkflowEvent({
            batchId,
            taskId,
            type: 'step_updated',
            data: { stepName: stepDef.name, status: Status.FAILED, error: cleanMessage }
          });

          throw error; // Bubble up to fail the task
        }
      }

      // 5. Complete Task
      await this.prisma.jobTask.update({
        where: { id: taskId },
        data: { status: Status.COMPLETED },
      });

      this.eventsService.emitWorkflowEvent({
        batchId,
        taskId,
        type: 'task_updated',
        data: { status: Status.COMPLETED }
      });

      this.logger.log(`Successfully completed Task ${taskId}`);
      await this.updateBatchProgress(batchId);

    } catch (error: any) {
      if (error.name === 'DelayedError') return; // Do not fail the task if delayed

      const cleanTaskError = error.message || 'Task execution failed';
      
      // Handle DLQ for Infra Errors vs FAILED for Business Errors
      let finalStatus: Status = Status.FAILED;
      if (error.isRetryable || error.name === 'InfraWorkflowError' || error.name === 'TransientApiError') {
        finalStatus = Status.DLQ; // Recoverable terminal state
      }

      await this.prisma.jobTask.update({
        where: { id: taskId },
        data: {
          status: finalStatus,
          error: cleanTaskError,
        },
      });

      this.eventsService.emitWorkflowEvent({
        batchId,
        taskId,
        type: 'task_updated',
        data: { status: finalStatus, error: cleanTaskError }
      });

      this.logger.error(`Task ${taskId} ended with status ${finalStatus}: ${error.message}`, error.stack);
      await this.updateBatchProgress(batchId);
    }
  }

  /**
   * Helper to check cancellation status of a batch/task
   */
  private async checkCancellation(batchId: string, taskId: string): Promise<boolean> {
    const batch = await this.prisma.jobBatch.findUnique({
      where: { id: batchId },
      select: { status: true },
    });

    if (batch?.status === Status.CANCELLED || batch?.status === Status.CANCELLING) {
      await this.prisma.jobTask.update({
        where: { id: taskId },
        data: { status: Status.CANCELLED },
      });
      await this.prisma.jobStep.updateMany({
        where: { taskId, status: Status.RUNNING },
        data: { status: Status.CANCELLED, completedAt: new Date() },
      });
      await this.updateBatchProgress(batchId);
      return true;
    }
    return false;
  }

  /**
   * Executes a single step enforcing timeouts and retries with exponential backoff
   */
  private async executeStepWithRetries(
    context: WorkflowContext,
    stepDef: StepDefinition
  ): Promise<void> {
    const maxRetries = stepDef.retryPolicy?.maxRetries ?? 0;
    const baseDelay = stepDef.retryPolicy?.backoffMs ?? 1000;
    const isExponential = stepDef.retryPolicy?.exponential ?? true;
    const timeoutMs = stepDef.timeoutMs ?? this.defaultTimeoutMs;

    let attempt = 0;
    while (true) {
      try {
        await this.executeWithTimeout(stepDef.run(context), timeoutMs);
        return; // Success
      } catch (error: any) {
        
        if (error instanceof CircuitBreakerOpenException) {
          this.logger.warn(`Circuit Breaker OPEN. Delaying job by ${error.delayMs}ms`);
          if (context.bullJob && context.bullJob.moveToDelayed) {
             await context.bullJob.moveToDelayed(Date.now() + error.delayMs, context.bullJob.token);
             throw new DelayedError();
          } else {
             // Fallback if no job reference
             await new Promise(r => setTimeout(r, Math.min(error.delayMs, 10000)));
             throw error;
          }
        }

        if (error instanceof SecurityWorkflowError && context.targetId) {
          this.logger.error(`Security error encountered. Disabling account.`);
          // TargetID is domainId for deep sync, let's look up the account
          const domain = await this.prisma.domain.findUnique({ where: { id: context.targetId }, select: { accountId: true } });
          if (domain) {
            await this.prisma.account.update({
              where: { id: domain.accountId },
              data: { health: AccountHealth.INVALID_CREDENTIALS }
            });
          }
          throw error;
        }

        // If error is explicitly marked as non-retryable, fail immediately
        if (error instanceof BusinessWorkflowError || error.isRetryable === false) {
          this.logger.error(
            `Step ${stepDef.name} failed with a non-retryable error: ${error.message}. Aborting retries.`
          );
          throw error;
        }

        attempt++;
        if (attempt > maxRetries) {
          throw error; // No more retries left -> will lead to DLQ
        }

        // Check cancellation between retries
        const isCancelled = await this.checkCancellation(context.batchId, context.taskId);
        if (isCancelled) {
          throw new Error('Step execution cancelled');
        }

        // Calculate backoff delay
        const delay = isExponential
          ? baseDelay * Math.pow(2, attempt - 1)
          : baseDelay;

        const retryAt = new Date(Date.now() + delay);

        this.eventsService.emitWorkflowEvent({
          batchId: context.batchId,
          taskId: context.taskId,
          type: 'step_updated',
          data: {
            stepName: stepDef.name,
            status: 'RETRYING',
            attempt,
            maxRetries,
            retryAt: retryAt.toISOString(),
            error: error.message || 'Unknown step execution error'
          }
        });

        this.logger.warn(
          `Step ${stepDef.name} failed on attempt ${attempt}/${maxRetries + 1}. Retrying in ${delay}ms... Error: ${error.message}`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Enforces a hard timeout on a promise
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined = undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Step execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Recalculates batch statistics and updates the JobBatch status
   */
  async updateBatchProgress(batchId: string): Promise<void> {
    const stats = await this.prisma.jobTask.groupBy({
      by: ['status'],
      where: { batchId },
      _count: { id: true },
    });

    let completedJobs = 0;
    let failedJobs = 0;
    let cancelledJobs = 0;
    let runningJobs = 0;
    let pendingJobs = 0;

    for (const group of stats) {
      const count = group._count.id;
      switch (group.status) {
        case Status.COMPLETED:
          completedJobs = count;
          break;
        case Status.FAILED:
          failedJobs = count;
          break;
        case Status.CANCELLED:
          cancelledJobs = count;
          break;
        case Status.RUNNING:
          runningJobs = count;
          break;
        case Status.PENDING:
          pendingJobs = count;
          break;
      }
    }

    const batch = await this.prisma.jobBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) return;

    const totalJobs = batch.totalJobs;
    const processedJobs = completedJobs + failedJobs + cancelledJobs;

    let updatedStatus: Status = batch.status;

    if (processedJobs === totalJobs) {
      if (batch.status === Status.CANCELLING) {
        updatedStatus = Status.CANCELLED;
      } else if (failedJobs > 0) {
        updatedStatus = Status.FAILED;
      } else {
        updatedStatus = Status.COMPLETED;
      }
    } else if (runningJobs > 0 && batch.status === Status.PENDING) {
      updatedStatus = Status.RUNNING;
    }

    const updatedBatch = await this.prisma.jobBatch.update({
      where: { id: batchId },
      data: {
        completedJobs,
        failedJobs,
        status: updatedStatus,
        completedAt: processedJobs === totalJobs ? new Date() : null,
      },
    });

    this.eventsService.emitWorkflowEvent({
      batchId,
      type: 'batch_updated',
      data: {
        status: updatedBatch.status,
        completedJobs: updatedBatch.completedJobs,
        failedJobs: updatedBatch.failedJobs,
        completedAt: updatedBatch.completedAt,
      }
    });
  }
}
