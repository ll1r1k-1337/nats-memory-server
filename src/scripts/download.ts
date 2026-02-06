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
    } = config;

    const filePath = await downloadFile(downloadUrl, os.tmpdir());

    console.log(`Downloaded was successful`);

    await decompress(filePath, downloadDir, { strip: 1 });

    console.log(`Decompress was successful sources`);
  }
});
