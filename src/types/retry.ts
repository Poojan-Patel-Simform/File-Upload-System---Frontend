export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  // A paused upload aborts this signal — withRetry stops immediately
  // (including mid-backoff) rather than sleeping out the delay first.
  signal?: AbortSignal;
};

// A generic escape hatch so any caller can mark an error as terminal
// (e.g. a 404/410 "session expired" response) without withRetry needing to
// know about HTTP status codes.
export type NonRetryableError = Error & { nonRetryable: true };
