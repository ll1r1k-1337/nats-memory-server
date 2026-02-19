import path from 'path';
import { downloadFile } from './download-file';
import fetch from 'make-fetch-happen';

// Mock make-fetch-happen
jest.mock(`make-fetch-happen`);
const mockFetch = fetch as unknown as jest.Mock;

// Mock fs partially
const mockCreateWriteStream = jest.fn();
jest.mock(`fs`, () => {
  const actualFs = jest.requireActual(`fs`);
  return {
    ...actualFs,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createWriteStream: (path: any) => mockCreateWriteStream(path),
  };
});

// Mock pipeline
jest.mock(`stream/promises`, () => ({
  pipeline: jest.fn().mockResolvedValue(undefined),
}));

describe(`downloadFile Security Check`, () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(`should sanitize filename to prevent path traversal via Content-Disposition`, async () => {
    const maliciousFilename = `../../../../tmp/hacked.txt`;
    const targetDir = path.resolve(`/safe/dir`);

    mockFetch.mockResolvedValue({
      ok: true,
      headers: {
        get: (key: string) => {
          if (key.toLowerCase() === `content-disposition`) {
            return `attachment; filename=${maliciousFilename}`;
          }
          return null;
        },
      },
      body: `mock-body`,
    });

    try {
      await downloadFile(`http://example.com/file`, targetDir);
    } catch (e) {
      console.error(e);
    }

    // Check what path createWriteStream was called with
    const calls = mockCreateWriteStream.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const writePath = calls[0][0];

    // Verify fix: the path should be sanitized and inside targetDir
    const safeFilename = path.basename(maliciousFilename);
    const expectedSafePath = path.resolve(targetDir, safeFilename);

    expect(writePath).toBe(expectedSafePath);
    expect(writePath.startsWith(targetDir)).toBe(true);
  });

  it(`should handle quoted filenames correctly`, async () => {
    const quotedFilename = `"safe-file.txt"`;
    const targetDir = path.resolve(`/safe/dir`);

    mockFetch.mockResolvedValue({
      ok: true,
      headers: {
        get: (key: string) => {
          if (key.toLowerCase() === `content-disposition`) {
            return `attachment; filename=${quotedFilename}`;
          }
          return null;
        },
      },
      body: `mock-body`,
    });

    await downloadFile(`http://example.com/file`, targetDir);

    const calls = mockCreateWriteStream.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const writePath = calls[0][0];

    const expectedSafePath = path.resolve(targetDir, `safe-file.txt`);
    expect(writePath).toBe(expectedSafePath);
  });
});
