export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
};
