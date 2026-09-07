/** Error taxonomy the adapter uses to decide whether a failure is retryable. */

export class ConsignmentNotFoundError extends Error {
  constructor(public readonly consignmentReference: string) {
    super(`Consignment not found: ${consignmentReference}`);
    this.name = "ConsignmentNotFoundError";
  }
}

export class LineNotFoundError extends Error {
  constructor(
    public readonly consignmentReference: string,
    public readonly lineReference: string,
  ) {
    super(`Line not found: ${lineReference} in consignment ${consignmentReference}`);
    this.name = "LineNotFoundError";
  }
}

/** A business-rule rejection from the assignment screen itself — never retried. */
export class ValidationAutomationError extends Error {
  constructor(
    message: string,
    public readonly consignmentReference: string,
    public readonly lineReference: string,
    public readonly attemptedRate: number,
  ) {
    super(message);
    this.name = "ValidationAutomationError";
  }
}

//: Matched against thrown error messages to decide if a retry is worthwhile.
const TRANSIENT_PATTERN = /timeout|navigation|net::err|detached|not attached|target closed/i;

export function isTransientError(error: unknown): boolean {
  if (
    error instanceof ConsignmentNotFoundError ||
    error instanceof LineNotFoundError ||
    error instanceof ValidationAutomationError
  ) {
    return false;
  }
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_PATTERN.test(message);
}
