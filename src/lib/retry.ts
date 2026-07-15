export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

export const withRetry = async <T>(
  fn: () => Promise<T>,
  { retries = 3, baseDelayMs = 500, maxDelayMs = 8000, onRetry }: RetryOptions = {},
): Promise<T> => {
  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (error) {
      // A user-triggered cancel should stop immediately, not consume a retry
      // attempt and wait out a backoff delay first.
      if (isAbortError(error) || attempt >= retries) throw error;

      // Exponential backoff with full jitter (delay is uniform over
      // [0, cap]) so retries from many chunks/files don't all retry in lockstep.
      const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const delayMs = Math.random() * cap;

      attempt++;
      onRetry?.(attempt, delayMs, error);
      await sleep(delayMs);
    }
  }
};
