import { downloadFile } from './download-file';
import fetch from 'make-fetch-happen';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

// Mock make-fetch-happen
jest.mock(`make-fetch-happen`);
jest.mock(`stream/promises`);

describe(`downloadFile Security`, () => {
  const mockFetch = fetch as unknown as jest.Mock;
  const mockPipeline = pipeline as unknown as jest.Mock;
  let createWriteStreamSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Spy on createWriteStream and prevent actual file creation
    createWriteStreamSpy = jest
      .spyOn(fs, `createWriteStream`)
      .mockImplementation(() => {
        return {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(),
          emit: jest.fn(),
        } as unknown as fs.WriteStream;
      });
  });

  afterEach(() => {
    createWriteStreamSpy.mockRestore();
  });

  it(`should prevent path traversal attacks via Content-Disposition filename`, async () => {
    const url = `http://example.com/malicious.zip`;
    const downloadDir = path.resolve(`/tmp/nats-download`);
    // Malicious filename attempting to traverse up
    const maliciousFilename = `../../../../etc/passwd`;

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
    mockPipeline.mockResolvedValue(undefined);

    // This is expected to succeed in the vulnerable version, but write to a dangerous location
    await downloadFile(url, downloadDir);

    const callArgs = createWriteStreamSpy.mock.calls[0];
    const destinationPath = callArgs[0] as string;

    console.log(`Destination Path:`, destinationPath);

    // Assert that the destination path is effectively outside the download directory
    // We expect this to FAIL once we fix the vulnerability (i.e., we want it to be safe)
    // But for now, to demonstrate the vulnerability, we verify that it IS dangerous.

    // Using path.relative to see where it lands.
    // If destinationPath resolves to /etc/passwd, and downloadDir is /tmp/nats-download
    // relative path will be something like ../../etc/passwd

    const resolvedDest = path.resolve(destinationPath);
    const isSafe = resolvedDest.startsWith(downloadDir);

    // In vulnerable code, isSafe should be FALSE.
    // We want the test to fail if it is unsafe, so that passing the test means we are secure.
    // So:
    expect(isSafe).toBe(true);

    // Also assert the filename is correct (sanitized)
    expect(path.basename(destinationPath)).toBe(`passwd`);
  });
});
