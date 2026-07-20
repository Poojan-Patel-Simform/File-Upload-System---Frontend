import { RetryOptions } from "@/types/retry";
import {
  DEFAULT_RETRIES,
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_DELAY_MS,
} from "@/constants";

// Resolves early if `signal` fires so a paused upload doesn't sit out the
// rest of a backoff delay before the next attempt notices it was aborted.
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });

export const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

const isNonRetryable = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { nonRetryable?: boolean }).nonRetryable === true;

export const withRetry = async <T>(
  fn: () => Promise<T>,
  {
    retries = DEFAULT_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    onRetry,
    signal,
  }: RetryOptions = {},
): Promise<T> => {
  let attempt = 0;

  for (;;) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    try {
      return await fn();
    } catch (error) {
      // A user-triggered cancel or a terminal error (e.g. a 404/410
      // "session expired" response) should stop immediately, not consume a
      // retry attempt and wait out a backoff delay first.
      if (isAbortError(error) || isNonRetryable(error) || attempt >= retries)
        throw error;

      // Exponential backoff with full jitter (delay is uniform over
      // [0, cap]) so retries from many chunks/files don't all retry in lockstep.
      const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const delayMs = Math.random() * cap;

      attempt++;
      onRetry?.(attempt, delayMs, error);
      await sleep(delayMs, signal);

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    }
  }
};
