import http from 'http';
import type { AddressInfo } from 'net';
import { waitForHealthz } from './wait-for-healthz';

async function startServer(
  handler: http.RequestListener,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, `127.0.0.1`, resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/healthz`,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
}

describe(`waitForHealthz`, () => {
  it(`resolves once the endpoint returns 200`, async () => {
    const { url, close } = await startServer((_req, res) => {
      res.writeHead(200);
      res.end(`{"status":"ok"}`);
    });
    try {
      await expect(
        waitForHealthz(url, { intervalMs: 10 }),
      ).resolves.toBeUndefined();
    } finally {
      await close();
    }
  });

  it(`retries through non-2xx responses until one succeeds`, async () => {
    let hits = 0;
    const { url, close } = await startServer((_req, res) => {
      hits += 1;
      if (hits < 3) {
        res.writeHead(503);
        res.end(`not ready`);
      } else {
        res.writeHead(200);
        res.end(`ok`);
      }
    });
    try {
      await expect(
        waitForHealthz(url, { intervalMs: 10 }),
      ).resolves.toBeUndefined();
      expect(hits).toBeGreaterThanOrEqual(3);
    } finally {
      await close();
    }
  });

  it(`rejects when the signal aborts`, async () => {
    const { url, close } = await startServer((_req, res) => {
      res.writeHead(503);
      res.end(`never ready`);
    });
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 50);
    try {
      await expect(
        waitForHealthz(url, { intervalMs: 10, signal: controller.signal }),
      ).rejects.toThrow(/aborted/);
    } finally {
      await close();
    }
  });
});
