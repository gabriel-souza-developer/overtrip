import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

export default async function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'overtrip-e2e-real-'));
  const child = spawn(process.execPath, ['--import', 'tsx', resolve('e2e-real/support/stack.ts')], {
    env: { ...process.env, OVERTRIP_E2E_TEMP_DIR: directory }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const cleanup = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>(done => child.once('exit', () => done()));
      child.kill('SIGTERM');
      const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(timeout);
    }
    rmSync(directory, { recursive: true, force: true });
  };
  try {
    await new Promise<void>((resolveReady, reject) => {
      const timeout = setTimeout(() => reject(new Error('Tempo esgotado ao iniciar ambiente E2E')), 60_000);
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk.toString();
        if (output.includes('E2E_REAL_READY')) { clearTimeout(timeout); resolveReady(); }
      });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Ambiente E2E encerrou antes de ficar pronto (${code})`)); });
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
  return cleanup;
}
