// src/utils/async.ts
// Async utilities: timeout wrapper and safe executor.

/**
 * Wraps a promise with a timeout. Rejects with a TimeoutError if the
 * promise does not settle within `ms` milliseconds.
 */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });

  try {
    const result = await Promise.race([promise, timeout]);
    return result;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Wraps an async function so it never throws. Returns the result or a
 * fallback value on any error.
 */
export async function neverThrow<T>(
  fn: () => Promise<T>,
  fallback: T,
  onError?: (error: unknown) => void
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (onError) onError(error);
    return fallback;
  }
}
