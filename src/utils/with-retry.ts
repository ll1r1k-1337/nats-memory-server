export interface WithRetryOptions {
  /** Number of retries after the first attempt. Total attempts = retries + 1. */
  retries?: number;
  /** Delay in milliseconds between attempts. */
  delay?: number;
  /** Called before each retry with the error and the 1-based retry number. */
  onRetry?: (error: unknown, attempt: number) => void;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_DELAY = 1000;

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: WithRetryOptions = {},
): Promise<T> {
  const { retries = DEFAULT_RETRIES, delay = DEFAULT_DELAY, onRetry } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        onRetry?.(error, attempt + 1);

        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  throw lastError;
}
