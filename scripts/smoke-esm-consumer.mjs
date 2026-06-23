import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const repoDir = resolve(new URL('..', import.meta.url).pathname);
const tempDir = await mkdtemp(join(tmpdir(), 'ica-client-sdk-esm-'));
let tarballPath;

async function main() {
  try {
    const consumerDir = join(tempDir, 'consumer');
    await mkdir(join(consumerDir, 'node_modules'), { recursive: true });
    await execFileAsync('npm', ['pack', '--quiet'], { cwd: repoDir });

    const packageJson = JSON.parse(await readFile(join(repoDir, 'package.json'), 'utf8'));
    const tarballName = `${packageJson.name}-${packageJson.version}.tgz`;
    tarballPath = join(repoDir, tarballName);
    const installDir = join(consumerDir, 'node_modules', packageJson.name);

    await mkdir(installDir, { recursive: true });
    for (const dependencyName of Object.keys(packageJson.dependencies || {})) {
      await symlink(
        join(repoDir, 'node_modules', dependencyName),
        join(consumerDir, 'node_modules', dependencyName),
        'junction',
      );
    }
    await execFileAsync('tar', ['-xzf', tarballPath, '-C', installDir, '--strip-components=1']);
    await writeFile(
      join(consumerDir, 'package.json'),
      JSON.stringify({ name: 'esm-smoke-consumer', private: true, type: 'module' }, null, 2),
    );
    await writeFile(
      join(consumerDir, 'index.mjs'),
      [
        `import { IcaClient, Sector } from '${packageJson.name}';`,
        `const client = new IcaClient({ sector: Sector.HealthCare, didWeb: 'did:web:ica', baseUrl: 'http://localhost:3310' });`,
        `if (!client || typeof client.verifyTerms !== 'function') throw new Error('IcaClient export is unusable');`,
        `if (Sector.HealthCare !== 'health-care') throw new Error('Sector export is unusable');`,
        `console.log('esm smoke ok');`,
      ].join('\n'),
    );

    const { stdout } = await execFileAsync('node', ['index.mjs'], { cwd: consumerDir });
    if (!stdout.includes('esm smoke ok')) {
      throw new Error(`Unexpected ESM smoke output: ${stdout}`);
    }
  } finally {
    if (tarballPath) {
      await rm(tarballPath, { force: true });
    }
    await rm(tempDir, { recursive: true, force: true });
  }
}

await main();
