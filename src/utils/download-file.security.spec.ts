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

  it('should prevent path traversal in filenames', async () => {
    const url = 'http://example.com/evil.zip';
    const dir = path.resolve('/tmp/safe');
    const maliciousFilename = '../evil.zip';

    const mockResponse = {
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue(`attachment; filename=${maliciousFilename}`),
      },
      body: 'mockBody',
    };

    mockFetch.mockResolvedValue(mockResponse);
    // return a dummy object for the write stream
    mockCreateWriteStream.mockReturnValue({
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
    });
    mockPipeline.mockResolvedValue(undefined);

    const result = await downloadFile(url, dir);

    // We expect the function to sanitize the filename (e.g. using path.basename)
    // transforming "../evil.zip" into "evil.zip"
    const expectedPath = path.join(dir, 'evil.zip');

    expect(result).toBe(expectedPath);
  });
});
