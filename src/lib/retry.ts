import { RetryOptions } from "@/types/retry";
import {
  DEFAULT_RETRIES,
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_DELAY_MS,
} from "@/constants/retry";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

export const withRetry = async <T>(
  fn: () => Promise<T>,
  {
    retries = DEFAULT_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    onRetry,
  }: RetryOptions = {},
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
