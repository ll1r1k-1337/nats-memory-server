import { downloadFile } from './download-file';
import fetch from 'make-fetch-happen';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

jest.mock('make-fetch-happen');
jest.mock('fs');
jest.mock('stream/promises');

describe('downloadFile Security', () => {
  const mockFetch = fetch as unknown as jest.Mock;
  const mockCreateWriteStream = fs.createWriteStream as unknown as jest.Mock;
  const mockPipeline = pipeline as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPipeline.mockResolvedValue(undefined);
    mockCreateWriteStream.mockReturnValue({});
  });

  it('should prevent path traversal in filename', async () => {
    const url = 'http://example.com/malicious.zip';
    const dir = path.resolve('/tmp/safe-dir');

    // Malicious filename attempting to traverse up
    const maliciousFilename = '../../../../etc/passwd';

    const mockResponse = {
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue(`attachment; filename=${maliciousFilename}`),
      },
      body: 'mockBody',
    };

    mockFetch.mockResolvedValue(mockResponse);

    await downloadFile(url, dir);

    // We expect the filename to be sanitized to just 'passwd'
    // So the full path should be /tmp/safe-dir/passwd
    const expectedPath = path.resolve(dir, 'passwd');

    expect(mockCreateWriteStream).toHaveBeenCalled();
    const actualPath = mockCreateWriteStream.mock.calls[0][0];

    // If the vulnerability exists, actualPath will resolve to /etc/passwd (or similar)
    // We assert that it matches the SAFE path
    expect(actualPath).toBe(expectedPath);
  });
});
