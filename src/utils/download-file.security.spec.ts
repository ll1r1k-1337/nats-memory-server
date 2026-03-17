import { downloadFile } from './download-file';
import fetch from 'make-fetch-happen';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

jest.mock(`make-fetch-happen`);

describe(`downloadFile security`, () => {
  const mockFetch = fetch as unknown as jest.Mock;
  const testDir = path.resolve(__dirname, `../../test-downloads`);

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it(`should prevent path traversal via content-disposition header`, async () => {
    const url = `http://example.com/malicious.zip`;
    const mockResponse = {
      ok: true,
      headers: {
        get: jest
          .fn()
          .mockReturnValue(`attachment; filename="../../../etc/passwd"`),
      },
      body: Readable.from([Buffer.from(`mock`)]),
    };
    mockFetch.mockResolvedValue(mockResponse);

    const result = await downloadFile(url, testDir);

    expect(result).toBe(path.resolve(testDir, `passwd`));
    expect(result.includes(`etc`)).toBe(false);
  });
});
