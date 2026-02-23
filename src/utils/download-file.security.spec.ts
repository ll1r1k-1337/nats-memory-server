import { downloadFile } from './download-file';
import fetch from 'make-fetch-happen';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

// Mock make-fetch-happen and fs, but NOT path
jest.mock(`make-fetch-happen`);
jest.mock(`fs`);
jest.mock(`stream/promises`);

describe(`downloadFile Security`, () => {
  const mockFetch = fetch as unknown as jest.Mock;
  const mockPipeline = pipeline as unknown as jest.Mock;
  const mockCreateWriteStream = fs.createWriteStream as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(`should prevent path traversal in Content-Disposition filename`, async () => {
    const url = `http://example.com/malicious.zip`;
    const dir = `/tmp/downloads`;
    // Malicious filename attempting to traverse up
    const maliciousFilename = `../../etc/passwd`;

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

    const callArgs = mockCreateWriteStream.mock.calls[0];
    const destinationPath = callArgs[0];

    // We expect the function to strip the path traversal and just use the filename
    // So "passwd" instead of "../../etc/passwd"
    const expectedPath = path.resolve(dir, `passwd`);

    expect(destinationPath).toBe(expectedPath);
  });
});
