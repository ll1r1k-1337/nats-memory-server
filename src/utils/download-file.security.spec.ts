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

  it(`should prevent path traversal by sanitizing filename`, async () => {
    const url = `http://example.com/evil.zip`;
    const dir = `/safe/downloads`;
    const maliciousFilename = `../../../../tmp/evil.exe`;

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

    const result = await downloadFile(url, dir);

    // The result should now be inside dir, with just the basename of the malicious filename
    const expectedFilename = path.basename(maliciousFilename);
    const expectedPath = path.resolve(dir, expectedFilename);

    expect(result).toBe(expectedPath);
    expect(result.startsWith(dir)).toBe(true);
    expect(mockCreateWriteStream).toHaveBeenCalledWith(expectedPath);
  });
});
