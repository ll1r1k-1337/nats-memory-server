import { getFreePort } from './get-free-port';

describe(`getFreePort`, () => {
  it(`returns a usable TCP port number`, async () => {
    const port = await getFreePort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });

  it(`never returns a port in the exclude set`, async () => {
    const first = await getFreePort();
    // first is released again here, so a naive allocator could hand it back;
    // the exclude set must prevent that.
    const second = await getFreePort(new Set([first]));
    expect(second).not.toBe(first);
  });

  it(`allocates distinct client and monitoring ports`, async () => {
    const client = await getFreePort();
    const monitor = await getFreePort(new Set([client]));
    expect(monitor).not.toBe(client);
  });
});
