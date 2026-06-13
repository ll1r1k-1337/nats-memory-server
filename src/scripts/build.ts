import {
  buildNatsServerFromSource,
  getProjectConfig,
  getProjectPath,
} from '../utils';
import { runInstallStep } from './run-install-step';

async function buildNatsServer(): Promise<void> {
  const config = await getProjectConfig(getProjectPath());

  // buildNatsServerFromSource is a no-op unless buildFromSource is enabled and
  // the binary is not already present.
  await buildNatsServerFromSource(config);
}

runInstallStep(buildNatsServer, `Failed to build the NATS server from source`, {
  optional: true,
});
