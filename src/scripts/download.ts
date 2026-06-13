import fs from 'fs';
import {
  downloadNatsServerBinary,
  getProjectConfig,
  getProjectPath,
} from '../utils';
import { runInstallStep } from './run-install-step';

async function downloadNatsServer(): Promise<void> {
  const config = await getProjectConfig(getProjectPath());

  // Prefetch only: skip when the download directory is already populated or
  // downloads are disabled. The lazy path in NatsServer.start() handles the
  // case where this step is skipped entirely (e.g. `--ignore-scripts`).
  const natsServerNotDownload = !fs.existsSync(config.downloadDir);

  if (natsServerNotDownload && config.download) {
    await downloadNatsServerBinary(config);
  }
}

runInstallStep(
  downloadNatsServer,
  `Failed to download the NATS server binary`,
  {
    optional: true,
  },
);
