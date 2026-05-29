export type RetryOptions = {
  retries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const retries = options.retries ?? 2;
  const initialDelayMs = options.initialDelayMs ?? 750;
  const maxDelayMs = options.maxDelayMs ?? 5_000;

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }

      const delay = Math.min(initialDelayMs * 2 ** attempt, maxDelayMs);
      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError;
}
