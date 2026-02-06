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
  const mockCreateWriteStream = fs.createWriteStream as unknown as jest.Mock;
  const mockPipeline = pipeline as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(`should prevent path traversal and sanitize filename`, async () => {
    const url = `http://example.com/evil.zip`;
    const dir = `/tmp/safe_dir`;
    const evilFileName = `../../../../etc/passwd`;

    const mockResponse = {
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue(`attachment; filename=${evilFileName}`),
      },
      body: `evil content`,
    };

    mockFetch.mockResolvedValue(mockResponse);
    mockPipeline.mockResolvedValue(undefined);

    await downloadFile(url, dir);

    // Expect it to strip path components and just use 'passwd'
    const expectedPath = path.resolve(dir, `passwd`);
    expect(mockCreateWriteStream).toHaveBeenCalledWith(expectedPath);
  });

  it(`should handle quoted filenames`, async () => {
    const url = `http://example.com/file.zip`;
    const dir = `/tmp/safe_dir`;
    const quotedFileName = `"test.zip"`;

    const mockResponse = {
      ok: true,
      headers: {
        get: jest
          .fn()
          .mockReturnValue(`attachment; filename=${quotedFileName}`),
      },
      body: `content`,
    };

    mockFetch.mockResolvedValue(mockResponse);
    mockPipeline.mockResolvedValue(undefined);

    await downloadFile(url, dir);

    const expectedPath = path.resolve(dir, `test.zip`);
    expect(mockCreateWriteStream).toHaveBeenCalledWith(expectedPath);
  });
});
