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
  const mockPipeline = pipeline as unknown as jest.Mock;
  const mockCreateWriteStream = fs.createWriteStream as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should sanitize path traversal in Content-Disposition filename', async () => {
    const url = 'http://example.com/malicious.zip';
    const dir = '/safe/download/dir';
    const mockResponse = {
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue('attachment; filename=../../../etc/passwd'),
      },
      body: 'malicious-payload',
    };

    mockFetch.mockResolvedValue(mockResponse);
    mockCreateWriteStream.mockReturnValue('mockWriteStream');
    mockPipeline.mockResolvedValue(undefined);

    const result = await downloadFile(url, dir);

    // The filename should be sanitized to 'passwd' by path.basename
    const expectedPath = path.resolve(dir, 'passwd');
    expect(result).toBe(expectedPath);

    // Verify createWriteStream was called with the sanitized path
    expect(mockCreateWriteStream).toHaveBeenCalledWith(expectedPath);
  });

  it('should throw error for invalid filename ".." which escapes directory', async () => {
    const url = 'http://example.com/dot.zip';
    const dir = '/safe/download/dir';
    const mockResponse = {
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue('attachment; filename=..'),
      },
      body: 'malicious-payload',
    };

    mockFetch.mockResolvedValue(mockResponse);
    mockCreateWriteStream.mockReturnValue('mockWriteStream');
    mockPipeline.mockResolvedValue(undefined);

    // Should throw because resolving ".." escapes the directory
    await expect(downloadFile(url, dir)).rejects.toThrow();
  });
});
