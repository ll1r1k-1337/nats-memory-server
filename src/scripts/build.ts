import fs from 'fs';
import child_process from 'child_process';
import { getProjectConfig, getProjectPath } from '../utils';

async function buildNatsServer(): Promise<void> {
  const projectPath = getProjectPath();
  const config = await getProjectConfig(projectPath);

  const { buildFromSource } = config;

  const { downloadDir, binPath } = config;

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

      goBuild.on(`close`, (code) => {
        // Only report success once we know the build actually succeeded, and
        // reject with a real Error (a bare reject() surfaces as `undefined`,
        // which is useless when the install fails).
        if (code === 0) {
          console.log(`NATS server was builded successful!`);
          resolve();
        } else {
          reject(
            new Error(
              `go build exited with a non-zero code (${code ?? `null`})`,
            ),
          );
        }
      });
    });
  }
}

process.nextTick(() => {
  buildNatsServer().catch((error: unknown) => {
    // Surface a clean message and a deterministic non-zero exit so a failed
    // build fails `npm install` loudly instead of as an unhandled rejection.
    console.error(
      `Failed to build the NATS server from source:`,
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
});
