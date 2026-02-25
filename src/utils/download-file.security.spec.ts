import { downloadFile } from './download-file';
import fetch from 'make-fetch-happen';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

jest.mock(`make-fetch-happen`);
jest.mock(`fs`, () => {
  const originalFs = jest.requireActual(`fs`);
  return {
    ...originalFs,
    createWriteStream: jest.fn(),
  };
});
jest.mock(`stream/promises`);

describe(`downloadFile Security`, () => {
  const mockFetch = fetch as unknown as jest.Mock;
  const mockCreateWriteStream = fs.createWriteStream as unknown as jest.Mock;
  const mockPipeline = pipeline as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(`should prevent path traversal in Content-Disposition header`, async () => {
    const url = `http://example.com/malicious.zip`;
    const dir = `/tmp/safe-dir`;
    const maliciousFilename = `../../../../etc/passwd`;

    // Unquoted filename triggers direct path traversal
    const headerValue = `attachment; filename=${maliciousFilename}`;

    const mockResponse = {
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue(headerValue),
      },
      body: `mockBody`,
    };

    mockFetch.mockResolvedValue(mockResponse);
    mockPipeline.mockResolvedValue(undefined);

    await downloadFile(url, dir);

    const writtenPath = mockCreateWriteStream.mock.calls[0][0];

    // Expect the path to be sanitized to just 'passwd' inside the dir
    // This assertion should FAIL before the fix
    const safePath = path.resolve(dir, `passwd`);
    expect(writtenPath).toBe(safePath);
  });
});
