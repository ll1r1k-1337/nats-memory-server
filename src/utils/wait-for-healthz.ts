import http from 'http';

export interface WaitForHealthzOptions {
  /** Delay between poll attempts in milliseconds. Default: 50. */
  intervalMs?: number;
  /** Abort to stop polling; the returned promise rejects when aborted. */
  signal?: AbortSignal;
}

const DEFAULT_INTERVAL_MS = 50;

/** A single GET. Resolves true on a 2xx response, false on any error/non-2xx. */
async function probeOnce(url: string, signal?: AbortSignal): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const request = http.get(url, { signal }, (response) => {
      const status = response.statusCode ?? 0;
      response.resume(); // drain so the socket frees promptly
      resolve(status >= 200 && status < 300);
    });
    request.on(`error`, () => {
      resolve(false);
    });
  });
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error(`waitForHealthz aborted`));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener(`abort`, onAbort);
      resolve();
    }, ms);
    if (signal != null) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener(`abort`, onAbort, { once: true });
    }
  });
}

/**
 * Polls `GET <url>` until it returns a 2xx response, then resolves. Connection
 * errors and non-2xx responses (the server is still coming up) are retried
 * after `intervalMs`. Rejects only when `signal` aborts. Uses node:http — the
 * target is always local, so no proxy handling is needed.
 */
export async function waitForHealthz(
  url: string,
  options: WaitForHealthzOptions = {},
): Promise<void> {
  const { intervalMs = DEFAULT_INTERVAL_MS, signal } = options;

  for (;;) {
    if (signal?.aborted === true) {
      throw new Error(`waitForHealthz aborted`);
    }

    if (await probeOnce(url, signal)) {
      return;
    }

    await delay(intervalMs, signal);
  }
}
