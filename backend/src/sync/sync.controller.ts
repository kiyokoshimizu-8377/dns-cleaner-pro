import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Sse,
  MessageEvent,
  HttpStatus,
  HttpCode,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SyncService } from './sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowEventsService } from '../workflows/workflow-events.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Status, BatchType } from '@prisma/client';
import { Observable } from 'rxjs';

@Controller('sync')
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(
    private readonly syncService: SyncService,
    private readonly prisma: PrismaService,
    private readonly eventsService: WorkflowEventsService,
    @InjectQueue('sync-queue') private readonly syncQueue: Queue,
    @InjectQueue('api-queue') private readonly apiQueue: Queue,
  ) {}

  /**
   * Get the last 15 sync/cleanup batches.
   */
  @Get('batches')
  async getBatches() {
    const batches = await this.prisma.jobBatch.findMany({
      orderBy: { startedAt: 'desc' },
      take: 15,
    });

    // Enhance batches with calculated health states
    return Promise.all(
      batches.map(async (batch) => {
        const health = await this.calculateBatchHealth(batch.id, batch.status, batch.failedJobs);
        return {
          ...batch,
          health,
        };
      }),
    );
  }

  /**
   * Get active batches count for real-time sidebar notifications.
   */
  @Get('batches/active')
  async getActiveBatchesCount() {
    try {
      const count = await this.prisma.jobBatch.count({
        where: {
          status: {
            in: [Status.PENDING, Status.RUNNING],
          },
        },
      });
      return { count };
    } catch (error) {
      this.logger.warn(
        `Failed to query active sync batches count: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { count: 0 };
    }
  }

  /**
   * Get details of a single batch, with paginated tasks.
   */
  @Get('batches/:batchId')
  async getBatchDetails(
    @Param('batchId') batchId: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('status') statusFilter?: string,
    @Query('search') searchFilter?: string,
  ) {
    const batch = await this.prisma.jobBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    const page = Math.max(1, parseInt(pageRaw || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(limitRaw || '20', 10)));
    const skip = (page - 1) * limit;

    // Build task query options
    const whereClause: any = { batchId };

    if (statusFilter && Object.values(Status).includes(statusFilter as Status)) {
      whereClause.status = statusFilter as Status;
    }

    // Fetch matching tasks count and page of tasks
    const [tasks, totalTasksCount] = await Promise.all([
      this.prisma.jobTask.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.jobTask.count({ where: whereClause }),
    ]);

    // Gather names for targetIds (can be domainIds or accountIds)
    const targetIds = tasks.map((t) => t.targetId).filter(Boolean) as string[];

    let targetNamesMap = new Map<string, string>();
    if (targetIds.length > 0) {
      const [domains, accounts] = await Promise.all([
        this.prisma.domain.findMany({
          where: { id: { in: targetIds } },
          select: { id: true, domainName: true },
        }),
        this.prisma.account.findMany({
          where: { id: { in: targetIds } },
          select: { id: true, email: true, providerName: true },
        }),
      ]);

      domains.forEach((d) => targetNamesMap.set(d.id, d.domainName));
      accounts.forEach((a) => targetNamesMap.set(a.id, `${a.providerName} (${a.email})`));
    }

    // Search filter applied in-memory if query is specified
    let filteredTasks = tasks.map((t) => {
      const targetName = targetNamesMap.get(t.targetId || '') || 'System Task';
      return {
        ...t,
        targetName,
      };
    });

    if (searchFilter) {
      const searchLower = searchFilter.toLowerCase();
      filteredTasks = filteredTasks.filter(
        (t) =>
          t.id.toLowerCase().includes(searchLower) ||
          t.targetName.toLowerCase().includes(searchLower) ||
          (t.error && t.error.toLowerCase().includes(searchLower)),
      );
    }

    const health = await this.calculateBatchHealth(batch.id, batch.status, batch.failedJobs);

    return {
      batch: {
        ...batch,
        health,
      },
      tasks: filteredTasks,
      pagination: {
        page,
        limit,
        totalTasks: totalTasksCount,
        totalPages: Math.ceil(totalTasksCount / limit),
      },
    };
  }

  /**
   * Get the steps (JIT lazy loading) of a specific task.
   */
  @Get('tasks/:taskId')
  async getTaskSteps(@Param('taskId') taskId: string) {
    const task = await this.prisma.jobTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const steps = await this.prisma.jobStep.findMany({
      where: { taskId },
      orderBy: { startedAt: 'asc' },
    });

    return {
      task,
      steps,
    };
  }

  /**
   * Cancel a running batch gracefully.
   */
  @Post('batches/:batchId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelBatch(@Param('batchId') batchId: string) {
    const batch = await this.prisma.jobBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    if (batch.status !== Status.PENDING && batch.status !== Status.RUNNING) {
      throw new BadRequestException('Batch is not active');
    }

    // Update batch to CANCELLING state
    await this.prisma.jobBatch.update({
      where: { id: batchId },
      data: { status: Status.CANCELLING },
    });

    // Fetch and remove waiting sync-queue jobs
    const syncWaitingJobs = await this.syncQueue.getWaiting();
    let removedCount = 0;
    for (const job of syncWaitingJobs) {
      if (job.data?.batchId === batchId) {
        await job.remove().catch(() => {});
        removedCount++;
      }
    }

    // Fetch and remove waiting api-queue jobs
    const apiWaitingJobs = await this.apiQueue.getWaiting();
    for (const job of apiWaitingJobs) {
      if (job.data?.batchId === batchId) {
        await job.remove().catch(() => {});
        removedCount++;
      }
    }

    // Mark pending tasks as CANCELLED in DB
    await this.prisma.jobTask.updateMany({
      where: {
        batchId,
        status: { in: [Status.PENDING, Status.RUNNING] },
      },
      data: { status: Status.CANCELLED },
    });

    // Mark running steps as CANCELLED in DB
    await this.prisma.jobStep.updateMany({
      where: {
        task: { batchId },
        status: { in: [Status.PENDING, Status.RUNNING] },
      },
      data: { status: Status.CANCELLED, completedAt: new Date() },
    });

    // Update batch status to CANCELLED
    const updatedBatch = await this.prisma.jobBatch.update({
      where: { id: batchId },
      data: {
        status: Status.CANCELLED,
        completedAt: new Date(),
        cancelReason: 'USER_CANCELLED',
      },
    });

    // Emit cancellation event
    this.eventsService.emitWorkflowEvent({
      batchId,
      type: 'batch_updated',
      data: {
        status: Status.CANCELLED,
        completedAt: updatedBatch.completedAt,
      },
    });

    return {
      message: `Batch cancelled successfully. ${removedCount} waiting queue jobs removed.`,
      batchId,
    };
  }

  /**
   * Resumes a specific task that is in DLQ state.
   */
  @Post('tasks/:taskId/resume')
  async resumeTask(@Param('taskId') taskId: string) {
    const task = await this.prisma.jobTask.findUnique({
      where: { id: taskId },
      include: { batch: true }
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    if (task.status !== Status.DLQ) {
      throw new BadRequestException(`Only tasks in DLQ state can be resumed. Task is currently: ${task.status}`);
    }

    // Reset task to PENDING
    await this.prisma.jobTask.update({
      where: { id: taskId },
      data: { status: Status.PENDING, error: null }
    });

    // Re-queue the task into sync-queue
    await this.syncQueue.add('sync-workflow', {
      taskId: task.id,
      batchId: task.batchId,
      targetId: task.targetId,
      taskType: task.batch.type === BatchType.DEEP_SYNC ? 'sync-domain' : 'sync-account',
    }, {
      jobId: `resume-${task.id}-${Date.now()}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });

    return { message: `Task ${taskId} successfully resumed and queued for execution.` };
  }

  /**
   * SSE endpoint to stream real-time updates for a single batch.
   * Cleans up listeners automatically when the connection is closed.
   */
  @Sse('batches/:batchId/sse')
  sse(@Param('batchId') batchId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      const handler = (event: any) => {
        observer.next({ data: event } as MessageEvent);
      };

      this.eventsService.on(`batch:${batchId}`, handler);

      // Clean up event listener when connection closes
      return () => {
        this.eventsService.off(`batch:${batchId}`, handler);
      };
    });
  }

  /**
   * Calculates derived batch health status.
   * Heartbeat based Stalled status checks:
   * Stale heartbeat: if any task is RUNNING and updatedAt is older than 2 minutes ago, it is STALLED.
   */
  private async calculateBatchHealth(
    batchId: string,
    status: Status,
    failedJobs: number,
  ): Promise<'HEALTHY' | 'DEGRADED' | 'STALLED' | 'PARTIAL_FAILURE' | 'COMPLETED' | 'CANCELLED' | 'FAILED'> {
    if (status === Status.CANCELLED) return 'CANCELLED';
    if (status === Status.FAILED) return 'FAILED';

    if (status === Status.COMPLETED) {
      return failedJobs > 0 ? 'PARTIAL_FAILURE' : 'COMPLETED';
    }

    // For RUNNING/PENDING status, check for stalled heartbeats
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const runningStalledTasksCount = await this.prisma.jobTask.count({
      where: {
        batchId,
        status: Status.RUNNING,
        updatedAt: { lt: twoMinutesAgo },
      },
    });

    if (runningStalledTasksCount > 0) {
      return 'STALLED';
    }

    if (failedJobs > 0) {
      return 'DEGRADED';
    }

    return 'HEALTHY';
  }
}
