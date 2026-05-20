import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface WorkflowEventPayload {
  batchId: string;
  taskId?: string;
  type: 'batch_updated' | 'task_updated' | 'step_updated';
  data: any;
}

@Injectable()
export class WorkflowEventsService extends EventEmitter {
  emitWorkflowEvent(payload: WorkflowEventPayload) {
    this.emit(`batch:${payload.batchId}`, payload);
    this.emit('global', payload);
  }
}
