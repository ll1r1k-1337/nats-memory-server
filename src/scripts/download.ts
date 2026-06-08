import decompress from 'decompress';
import fs from 'fs';
import os from 'os';
import {
  downloadFile,
  getArch,
  getPlatform,
  getProjectConfig,
  getProjectPath,
  getUrl,
  withRetry,
} from '../utils';

process.nextTick(async function () {
  const projectPath = getProjectPath();
  const config = await getProjectConfig(projectPath);

  let { downloadDir, download } = config;

  const natsServerNotDownload = !fs.existsSync(downloadDir);

  if (natsServerNotDownload && download) {
    console.log(`NATS server start download!`);
    const {
      version,
      buildFromSource,
      downloadUrl = getUrl(version, getPlatform(), getArch(), buildFromSource),
      httpProxy,
      httpsProxy,
      noProxy,
    } = config;

    // The download can be truncated by transient CI network issues, leaving a
    // partial archive that fails to decompress ("end of central directory record
    // signature not found"). Wrapping both the download and the decompress in a
    // retry uses the decompress step itself as the integrity check: a corrupt or
    // incomplete archive throws and triggers a fresh download.
    await withRetry(
      async () => {
        // Clear any partial state left behind by a previous failed attempt
        // before downloading and extracting again.
        fs.rmSync(downloadDir, { recursive: true, force: true });

        const filePath = await downloadFile(downloadUrl, os.tmpdir(), {
          httpProxy,
          httpsProxy,
          noProxy,
        });

        console.log(`Downloaded was successful`);

        await decompress(filePath, downloadDir, { strip: 1 });

        console.log(`Decompress was successful sources`);
      },
      {
        onRetry: (error, attempt) => {
          console.log(
            `NATS server download/extract failed (${
              error instanceof Error ? error.message : String(error)
            }). Retrying (attempt ${attempt})...`,
          );
        },
      },
    );
  }
});
