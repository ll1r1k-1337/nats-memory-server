import fs from 'fs';
import child_process from 'child_process';
import { getProjectConfig, getProjectPath } from '../utils';

process.nextTick(async function () {
  const projectPath = getProjectPath();
  const config = await getProjectConfig(projectPath);

  const { buildFromSource } = config;

  let { downloadDir, binPath } = config;

  const natsServerNotBuilded = !fs.existsSync(binPath);

  if (!buildFromSource) {
    return;
  }

  if (natsServerNotBuilded) {
    console.log(`Build sources NATS server`);
    return new Promise<void>((resolve, reject) => {
      const goBuild = child_process.spawn(`go`, [`build`], {
        cwd: downloadDir,
        stdio: `pipe`,
      });

      goBuild.unref();

      goBuild.once(`error`, (err) => {
        console.log(err);
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
        console.log(`NATS server was builded successful!`);

        if (code === 0) {
          resolve();
        } else {
          reject();
        }
      });
    });
  }
});
