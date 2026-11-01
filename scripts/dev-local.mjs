import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const services = [
  ['API', 'dev'],
  ['Painel', 'dev:frontend'],
  ['Site público', 'dev:site'],
];

let stopping = false;
const children = services.map(([name, script]) => {
  const child = spawn(npm, ['run', script], { stdio: 'inherit' });
  child.on('error', (error) => {
    console.error(`[${name}] não iniciou: ${error.message}`);
    shutdown(1);
  });
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`[${name}] encerrou (${code ?? 'sem código'}); encerrando os outros serviços.`);
      shutdown(code || 1);
    }
  });
  return child;
});

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGINT');
  }
  process.exitCode = code;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('\nOVERTRIP em desenvolvimento');
console.log('Painel:       http://localhost:3100/');
console.log('Site público: http://localhost:3200/');
console.log('API:          http://localhost:3001/health\n');
