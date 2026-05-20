export class WorkflowError extends Error {
  public readonly isRetryable: boolean;

  constructor(message: string, isRetryable = true) {
    super(message);
    this.name = this.constructor.name;
    this.isRetryable = isRetryable;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ----------------------------------------
// ENTERPRISE ERROR TAXONOMY
// ----------------------------------------

export class BusinessWorkflowError extends WorkflowError {
  constructor(message: string) {
    super(message, false); // Fail-fast: Invalid domain, duplicate zone
  }
}

export class InfraWorkflowError extends WorkflowError {
  constructor(message: string) {
    super(message, true); // Recoverable: ECONNRESET, timeout, 429, 5xx
  }
}

export class SecurityWorkflowError extends WorkflowError {
  constructor(message: string) {
    super(message, false); // Fail-fast and disable: Invalid credentials, revoked token
  }
}

// ----------------------------------------
// SPECIFIC EXCEPTIONS
// ----------------------------------------

export class CircuitBreakerOpenException extends InfraWorkflowError {
  public readonly delayMs: number;

  constructor(provider: string, delayMs: number) {
    super(`Circuit breaker is OPEN for provider: ${provider}. Delaying job execution.`);
    this.delayMs = delayMs;
  }
}

export class ValidationError extends BusinessWorkflowError {
  constructor(message: string) {
    super(message); 
  }
}

export class ProviderNotFoundError extends BusinessWorkflowError {
  constructor(message: string) {
    super(message); 
  }
}

export class TransientApiError extends InfraWorkflowError {
  constructor(message: string) {
    super(message); 
  }
}

export class NonRetryableWorkflowError extends WorkflowError {
  constructor(message: string) {
    super(message, false); 
  }
}
