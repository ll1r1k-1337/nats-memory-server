import fs from 'fs';
import child_process from 'child_process';
import { getProjectConfig, getProjectPath } from '../utils';
import { runInstallStep } from './run-install-step';

async function buildNatsServer(): Promise<void> {
  const projectPath = getProjectPath();
  const config = await getProjectConfig(projectPath);

  const { buildFromSource, downloadDir, binPath } = config;

  const natsServerNotBuilded = !fs.existsSync(binPath);

  if (!buildFromSource) {
    return;
  }

  if (natsServerNotBuilded) {
    console.log(`Build sources NATS server`);
    await new Promise<void>((resolve, reject) => {
      const goBuild = child_process.spawn(`go`, [`build`], {
        cwd: downloadDir,
        stdio: `pipe`,
      });

      goBuild.once(`error`, (err) => {
        goBuild.kill();
        reject(err);
      });

      goBuild.on(`spawn`, () => {
        console.log(`NATS server start building!`);
      });

      goBuild.stdout.on(`data`, (data) => console.log(data.toString()));

      goBuild.stderr.on(`data`, (data) => {
        console.log(data.toString());
      });

      goBuild.on(`close`, (code, signal) => {
        // Only report success once we know the build actually succeeded, and
        // reject with a real Error (a bare reject() surfaces as `undefined`,
        // which is useless when the install fails). `code` is null exactly
        // when the child was terminated by a signal, so name the signal then.
        if (code === 0) {
          console.log(`NATS server was builded successful!`);
          resolve();
        } else {
          reject(
            new Error(
              code === null
                ? `go build was terminated by signal ${signal ?? `unknown`}`
                : `go build exited with a non-zero code (${code})`,
            ),
          );
        }
      });
    });
  }
}

runInstallStep(buildNatsServer, `Failed to build the NATS server from source`);
