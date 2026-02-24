import { downloadFile } from './download-file';
import fetch from 'make-fetch-happen';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

jest.mock(`make-fetch-happen`);
jest.mock(`fs`);
jest.mock(`stream/promises`);

describe(`downloadFile security`, () => {
  const mockFetch = fetch as unknown as jest.Mock;
  const mockPipeline = pipeline as unknown as jest.Mock;
  const mockCreateWriteStream = fs.createWriteStream as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(`should prevent path traversal via Content-Disposition filename`, async () => {
    const url = `http://example.com/malicious.zip`;
    const dir = `/tmp/safe-dir`;
    const maliciousFilename = `../../../etc/passwd`;

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

    await downloadFile(url, dir);

    // The file should be written to the safe directory, with just the basename
    const expectedSafePath = path.resolve(dir, `passwd`);
    expect(mockCreateWriteStream).toHaveBeenCalledWith(expectedSafePath);

    // Ensure it's inside the dir
    expect(expectedSafePath.startsWith(path.resolve(dir))).toBe(true);
  });

  it(`should handle quoted filenames correctly`, async () => {
    const url = `http://example.com/file.zip`;
    const dir = `/tmp/safe-dir`;
    const filename = `"my file.zip"`;

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

    await downloadFile(url, dir);

    const expectedPath = path.resolve(dir, `my file.zip`);
    expect(mockCreateWriteStream).toHaveBeenCalledWith(expectedPath);
  });
});
