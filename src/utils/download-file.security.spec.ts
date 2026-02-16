import { downloadFile } from './download-file';
import fetch from 'make-fetch-happen';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

jest.mock('make-fetch-happen');
jest.mock('fs');
jest.mock('stream/promises');

// We want to test path resolution, so we DON'T mock path completely
// but we might want to spy on it if needed. For now, using actual path is better.

describe('downloadFile Security', () => {
  const mockFetch = fetch as unknown as jest.Mock;
  const mockPipeline = pipeline as unknown as jest.Mock;
  const mockCreateWriteStream = fs.createWriteStream as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should prevent path traversal in filename', async () => {
    const url = 'http://example.com/malicious.zip';
    const dir = './downloads';
    const maliciousFilename = '../../etc/passwd';

    const mockResponse = {
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue(`attachment; filename=${maliciousFilename}`),
      },
      body: 'mockBody',
    };

    mockFetch.mockResolvedValue(mockResponse);
    mockCreateWriteStream.mockReturnValue('mockWriteStream');
    mockPipeline.mockResolvedValue(undefined);

    await downloadFile(url, dir);

    const calledPath = mockCreateWriteStream.mock.calls[0][0];
    const resolvedDir = path.resolve(dir);

    // If vulnerability is fixed, calledPath should be inside resolvedDir
    // If not fixed, it will be outside.
    // We assert that it MUST be inside to consider it secure.

    // Check if calledPath starts with resolvedDir
    // Note: path.resolve removes trailing slashes, so we append sep to be sure
    const isSafe = calledPath.startsWith(resolvedDir + path.sep);

    // This expectation will fail if the code is vulnerable
    expect(isSafe).toBe(true);
  });
});
