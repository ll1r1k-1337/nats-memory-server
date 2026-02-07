import { downloadFile } from './download-file';
import fetch from 'make-fetch-happen';
import fs from 'fs';
import path from 'path';

jest.mock(`make-fetch-happen`);
jest.mock(`fs`, () => {
  const originalFs = jest.requireActual(`fs`);
  return {
    ...originalFs,
    createWriteStream: jest.fn(),
  };
});

jest.mock(`stream/promises`, () => ({
  pipeline: jest.fn().mockResolvedValue(undefined),
}));

describe(`downloadFile Security`, () => {
  it(`should sanitize filename to prevent path traversal`, async () => {
    (fetch as unknown as jest.Mock).mockResolvedValue({
      ok: true,
      headers: {
        get: jest
          .fn()
          .mockReturnValue(`attachment; filename=../../../etc/passwd`),
      },
      body: `mock body`,
    });

    const mockCreateWriteStream = fs.createWriteStream as jest.Mock;
    const downloadDir = path.resolve(`/tmp/downloads`);

    await downloadFile(`http://example.com/file`, downloadDir);

    expect(mockCreateWriteStream).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const destination = mockCreateWriteStream.mock.calls[0][0] as string;

    console.log(`Destination:`, destination);

    // The destination MUST start with the download directory
    expect(destination.startsWith(downloadDir)).toBe(true);
  });
});
