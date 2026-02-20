import { downloadFile } from './download-file';
import fetch from 'make-fetch-happen';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

jest.mock(`make-fetch-happen`);
jest.mock(`fs`);
jest.mock(`stream/promises`);

describe(`downloadFile Security`, () => {
  const mockFetch = fetch as unknown as jest.Mock;
  const mockCreateWriteStream = fs.createWriteStream as unknown as jest.Mock;
  const mockPipeline = pipeline as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(`should sanitize filename to prevent path traversal`, async () => {
    const url = `http://example.com/evil.zip`;
    const safeDir = path.resolve(`/safe/dir`);
    const evilFilename = `../../evil.txt`;
    const safeFilename = `evil.txt`;

    // The expected safe path
    const expectedSafePath = path.resolve(safeDir, safeFilename);

    const mockResponse = {
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue(`attachment; filename=${evilFilename}`),
      },
      body: `mockBody`,
    };

    mockFetch.mockResolvedValue(mockResponse);
    mockCreateWriteStream.mockReturnValue(`mockWriteStream`);
    mockPipeline.mockResolvedValue(undefined);

    const result = await downloadFile(url, safeDir);

    expect(result).toBe(expectedSafePath);
    expect(mockCreateWriteStream).toHaveBeenCalledWith(expectedSafePath);

    // Verify that the path is inside the safe directory
    expect(result.startsWith(safeDir)).toBe(true);
  });
});
