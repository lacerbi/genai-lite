import { withRetry, DEFAULT_RETRY_POLICY } from './withRetry';

type Result = { ok: boolean; retryAfterMs?: number };

const retryOnFailure = (r: Result) => ({ retry: !r.ok, retryAfterMs: r.retryAfterMs });

describe('withRetry', () => {
  let randomSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    // Pin jitter to exactly 1.0x (0.8 + 0.5 * 0.4)
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    randomSpy.mockRestore();
    jest.useRealTimers();
  });

  it('returns the first success without any delay', async () => {
    const op = jest.fn().mockResolvedValue({ ok: true });

    const result = await withRetry<Result>(op, retryOnFailure);

    expect(result.ok).toBe(true);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries until success', async () => {
    const op = jest
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });

    const promise = withRetry<Result>(op, retryOnFailure, {
      maxRetries: 3,
      initialDelayMs: 100,
      backoffFactor: 2,
    });

    await jest.advanceTimersByTimeAsync(100); // first backoff
    await jest.advanceTimersByTimeAsync(200); // second backoff
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('makes exactly maxRetries + 1 attempts and returns the last failure', async () => {
    const op = jest.fn().mockResolvedValue({ ok: false });

    const promise = withRetry<Result>(op, retryOnFailure, {
      maxRetries: 2,
      initialDelayMs: 10,
    });

    await jest.advanceTimersByTimeAsync(10);
    await jest.advanceTimersByTimeAsync(20);
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(op).toHaveBeenCalledTimes(3); // 1 initial + 2 retries, no SDK double-retry
  });

  it('does not retry non-retryable results', async () => {
    const op = jest.fn().mockResolvedValue({ ok: false });

    const result = await withRetry<Result>(op, () => ({ retry: false }));

    expect(result.ok).toBe(false);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('honors retryAfterMs when larger than the computed backoff', async () => {
    const op = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, retryAfterMs: 5000 })
      .mockResolvedValueOnce({ ok: true });

    const promise = withRetry<Result>(op, retryOnFailure, {
      maxRetries: 1,
      initialDelayMs: 100,
    });

    await jest.advanceTimersByTimeAsync(4999);
    expect(op).toHaveBeenCalledTimes(1); // still waiting on Retry-After

    await jest.advanceTimersByTimeAsync(1);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('caps delays (including retryAfterMs) at maxDelayMs', async () => {
    const op = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, retryAfterMs: 60000 })
      .mockResolvedValueOnce({ ok: true });

    const promise = withRetry<Result>(op, retryOnFailure, {
      maxRetries: 1,
      initialDelayMs: 100,
      maxDelayMs: 1000,
    });

    await jest.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('stops retrying when the signal aborts mid-backoff', async () => {
    const op = jest.fn().mockResolvedValue({ ok: false });
    const controller = new AbortController();

    const promise = withRetry<Result>(op, retryOnFailure, {
      maxRetries: 3,
      initialDelayMs: 1000,
      signal: controller.signal,
    });

    await jest.advanceTimersByTimeAsync(100);
    controller.abort();
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(op).toHaveBeenCalledTimes(1); // no attempt after the abort
  });

  it('does not retry at all when the signal is already aborted', async () => {
    const op = jest.fn().mockResolvedValue({ ok: false });
    const controller = new AbortController();
    controller.abort();

    const result = await withRetry<Result>(op, retryOnFailure, {
      maxRetries: 3,
      initialDelayMs: 10,
      signal: controller.signal,
    });

    expect(result.ok).toBe(false);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('passes the attempt index to the operation', async () => {
    const attempts: number[] = [];
    const op = jest.fn().mockImplementation(async (attempt: number) => {
      attempts.push(attempt);
      return { ok: attempt >= 2 };
    });

    const promise = withRetry<Result>(op, retryOnFailure, {
      maxRetries: 2,
      initialDelayMs: 1,
    });

    await jest.advanceTimersByTimeAsync(1);
    await jest.advanceTimersByTimeAsync(2);
    await promise;

    expect(attempts).toEqual([0, 1, 2]);
  });

  it('uses sensible defaults', () => {
    expect(DEFAULT_RETRY_POLICY).toEqual({
      maxRetries: 2,
      initialDelayMs: 500,
      maxDelayMs: 10000,
      backoffFactor: 2,
    });
  });
});
