// AI Summary: Generic retry helper with exponential backoff and jitter.
// Works on RETURNED values (genai-lite adapters never throw), honors Retry-After
// hints and AbortSignals. Used by LLMService's unified retry layer.

import type { Logger } from "../../logging/types";

/**
 * Retry policy configuration.
 */
export interface RetryPolicy {
  /** Maximum number of retries after the initial attempt (default 2 → up to 3 attempts) */
  maxRetries: number;
  /** Base delay before the first retry, in ms (default 500) */
  initialDelayMs: number;
  /** Upper bound for any single delay, in ms (default 10000) */
  maxDelayMs: number;
  /** Exponential growth factor per attempt (default 2) */
  backoffFactor: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  backoffFactor: 2,
};

/**
 * Verdict returned by the caller's shouldRetry callback.
 */
export interface RetryVerdict {
  /** Whether the operation should be retried */
  retry: boolean;
  /** Provider-suggested wait (e.g. from a Retry-After header); used when larger than the computed backoff */
  retryAfterMs?: number;
}

export interface WithRetryOptions extends Partial<RetryPolicy> {
  /** Abort signal — no further retries (or waits) once aborted */
  signal?: AbortSignal;
  /** Logger for retry warnings */
  logger?: Logger;
  /** Label used in log messages (e.g. "openai/gpt-4.1") */
  label?: string;
}

/**
 * Runs an async operation with retries and exponential backoff.
 *
 * Unlike typical retry helpers, this operates on RETURNED values rather than
 * exceptions: the caller's `shouldRetry` inspects each result (genai-lite
 * adapters return failure responses instead of throwing) and decides whether
 * to retry. The last result is always returned — never thrown.
 *
 * Delay per retry: `min(maxDelayMs, initialDelayMs * backoffFactor^attempt)`
 * with ±20% jitter; a provider-supplied `retryAfterMs` is honored when larger
 * (still capped at `maxDelayMs`).
 *
 * @param operation - The operation to run; receives the 0-based attempt index
 * @param shouldRetry - Inspects a result and decides whether to retry
 * @param options - Policy overrides, abort signal, logger
 * @returns The final result (successful, non-retryable, or last exhausted attempt)
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  shouldRetry: (result: T) => RetryVerdict,
  options?: WithRetryOptions
): Promise<T> {
  const policy: RetryPolicy = {
    maxRetries: options?.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries,
    initialDelayMs: options?.initialDelayMs ?? DEFAULT_RETRY_POLICY.initialDelayMs,
    maxDelayMs: options?.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs,
    backoffFactor: options?.backoffFactor ?? DEFAULT_RETRY_POLICY.backoffFactor,
  };

  let result = await operation(0);

  for (let attempt = 0; attempt < policy.maxRetries; attempt++) {
    const verdict = shouldRetry(result);
    if (!verdict.retry || options?.signal?.aborted) {
      return result;
    }

    // Exponential backoff with ±20% jitter; honor Retry-After when larger
    const baseDelay = Math.min(
      policy.maxDelayMs,
      policy.initialDelayMs * Math.pow(policy.backoffFactor, attempt)
    );
    const jittered = baseDelay * (0.8 + Math.random() * 0.4);
    const delayMs = Math.min(
      policy.maxDelayMs,
      Math.max(jittered, verdict.retryAfterMs ?? 0)
    );

    options?.logger?.warn(
      `Retrying${options.label ? ` ${options.label}` : ''} after failure ` +
        `(attempt ${attempt + 2}/${policy.maxRetries + 1}, waiting ${Math.round(delayMs)}ms)`
    );

    const aborted = await sleepUnlessAborted(delayMs, options?.signal);
    if (aborted) {
      return result;
    }

    result = await operation(attempt + 1);
  }

  return result;
}

/**
 * Sleeps for the given duration unless the signal aborts first.
 *
 * @returns true when the wait was cut short by an abort
 */
function sleepUnlessAborted(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(false);
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
