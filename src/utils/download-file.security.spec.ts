import { downloadFile } from './download-file';
import fetch from 'make-fetch-happen';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';

jest.mock(`make-fetch-happen`);
jest.mock(`fs`);
jest.mock(`stream/promises`);

describe(`downloadFile security`, () => {
  const mockFetch = fetch as unknown as jest.Mock;
  const mockCreateWriteStream = fs.createWriteStream as unknown as jest.Mock;
  const mockPipeline = pipeline as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(`should prevent path traversal in filename`, async () => {
    const url = `http://example.com/malicious.zip`;
    const dir = `/tmp`;
    // The vulnerability allows this filename to be resolved outside of dir
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
    mockCreateWriteStream.mockReturnValue(`mockWriteStream`);
    mockPipeline.mockResolvedValue(undefined);

    // We expect the current implementation to resolve to the malicious path
    // The fix should make this throw an error or sanitize the path
    const resolvedPath = await downloadFile(url, dir);

    // Check if path traversal occurred
    // If resolvedPath is effectively '/etc/passwd' (or relative equivalent), it's vulnerable.
    // path.resolve('/tmp', '../../../../etc/passwd') -> '/etc/passwd' (on POSIX)

    const expectedSafePath = path.resolve(
      dir,
      path.basename(maliciousFilename),
    );
    expect(resolvedPath).toBe(expectedSafePath);

    // Check that it IS contained in the intended directory
    expect(resolvedPath.startsWith(path.resolve(dir))).toBe(true);
  });

  it(`should handle normal filenames correctly`, async () => {
    const url = `http://example.com/file.zip`;
    const dir = `/tmp`;
    const filename = `file.zip`;

    const mockResponse = {
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue(`attachment; filename=${filename}`),
      },
      body: `mockBody`,
    };

    mockFetch.mockResolvedValue(mockResponse);
    mockCreateWriteStream.mockReturnValue(`mockWriteStream`);
    mockPipeline.mockResolvedValue(undefined);

    const resolvedPath = await downloadFile(url, dir);

    expect(resolvedPath).toBe(path.resolve(dir, filename));
  });
});
