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
      if (isAbortError(error) || attempt >= retries) throw error;

      const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const delayMs = Math.random() * cap;

      attempt++;
      onRetry?.(attempt, delayMs, error);
      await sleep(delayMs);
    }
  }
};
