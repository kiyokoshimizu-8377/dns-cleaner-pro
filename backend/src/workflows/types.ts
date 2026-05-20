export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number; // base delay in ms
  exponential?: boolean;
}

export interface StepDefinition<TContext = any> {
  name: string;
  run: (context: TContext) => Promise<void>;
  timeoutMs?: number; // optional override for step timeout
  retryPolicy?: RetryPolicy;
}

export interface WorkflowContext {
  batchId: string;
  taskId: string;
  targetId?: string;
  heartbeat?: () => Promise<void>;
  [key: string]: any;
}
