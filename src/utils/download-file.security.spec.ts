import { downloadFile } from './download-file';
import fetch from 'make-fetch-happen';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

jest.mock(`make-fetch-happen`);
jest.mock(`stream/promises`);

describe(`downloadFile Security`, () => {
  const mockFetch = fetch as unknown as jest.Mock;
  const mockPipeline = pipeline as unknown as jest.Mock;
  let createWriteStreamSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    createWriteStreamSpy = jest
      .spyOn(fs, `createWriteStream`)
      .mockImplementation(() => {
        return {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      });
    mockPipeline.mockResolvedValue(undefined);
  });

  afterEach(() => {
    createWriteStreamSpy.mockRestore();
  });

  it(`should sanitize filename to prevent path traversal`, async () => {
    const url = `http://example.com/malicious.zip`;
    const dir = path.resolve(`/tmp/safe-dir`);
    const maliciousFilename = `../../etc/passwd`;

    const mockResponse = {
      ok: true,
      headers: {
        get: jest
          .fn()
          .mockReturnValue(`attachment; filename=${maliciousFilename}`),
      },
      body: `mockBody`,
    };

    mockFetch.mockResolvedValue(mockResponse);

    await downloadFile(url, dir);

    const calledPath = createWriteStreamSpy.mock.calls[0][0] as string;

    // If properly sanitized, it should be /tmp/safe-dir/passwd
    // If vulnerable, it will be /etc/passwd (or similar depending on cwd)

    const expectedPath = path.resolve(dir, `passwd`);
    expect(calledPath).toBe(expectedPath);
  });
});
