import { withRetry } from './with-retry';

describe(`withRetry`, () => {
  it(`returns the result when the operation succeeds on the first attempt`, async () => {
    let calls = 0;

    const result = await withRetry(
      async () => {
        calls++;
        return `ok`;
      },
      { delay: 0 },
    );

    expect(result).toBe(`ok`);
    expect(calls).toBe(1);
  });

  it(`retries and resolves when the operation fails before succeeding`, async () => {
    let calls = 0;

    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) {
          throw new Error(`transient failure`);
        }
        return `ok`;
      },
      { retries: 5, delay: 0 },
    );

    expect(result).toBe(`ok`);
    expect(calls).toBe(3);
  });

  it(`throws the last error after exhausting all retries`, async () => {
    let calls = 0;

    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error(`failure ${calls}`);
        },
        { retries: 2, delay: 0 },
      ),
    ).rejects.toThrow(`failure 3`);

    expect(calls).toBe(3);
  });

  it(`invokes onRetry before each retry with the error and the retry number`, async () => {
    const onRetry = jest.fn();
    let calls = 0;

    await withRetry(
      async () => {
        calls++;
        if (calls < 3) {
          throw new Error(`boom ${calls}`);
        }
        return `done`;
      },
      { retries: 5, delay: 0, onRetry },
    );

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1);
    expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2);
  });

  it(`does not retry when retries is set to zero`, async () => {
    let calls = 0;

    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error(`single failure`);
        },
        { retries: 0, delay: 0 },
      ),
    ).rejects.toThrow(`single failure`);

    expect(calls).toBe(1);
  });
});
