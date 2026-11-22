import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

// Apenas executáveis falsos: nenhuma unidade systemd é criada nem consultada.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(opts: { userManager?: boolean; uid?: number; e2eExit?: number; systemExit?: number; protectedPath?: boolean } = {}) {
  // /dev/shm não é oculto pelas diretivas ProtectHome/PrivateTmp verificadas.
  const root = mkdtempSync('/dev/shm/overtrip-shell-test-'); roots.push(root);
  for (const dir of ['scripts', 'node_modules/tsx/dist', 'bin']) mkdirSync(join(root, dir), { recursive: true });
  cpSync(resolve('scripts/check-sandbox-compat.sh'), join(root, 'scripts/check-sandbox-compat.sh'));
  writeFileSync(join(root, 'scripts/check-sandbox-compat.ts'), '');
  writeFileSync(join(root, 'node_modules/tsx/dist/cli.mjs'), '');
  const mock = (name: string, code: string) => { const p = join(root, 'bin', name); writeFileSync(p, `#!/bin/sh\n${code}\n`); chmodSync(p, 0o755); return p; };
  const log = join(root, 'calls');
  if (opts.protectedPath) mock('realpath', 'case "$1" in */check-sandbox-compat.ts) echo /home/exemplo/driver;; *) exec /usr/bin/realpath "$@";; esac');
  mock('id', `[ "$1" = -u ] && { echo ${opts.uid ?? 1000}; exit 0; }\nexec /usr/bin/id "$@"`);
  mock('systemctl', opts.userManager === false ? 'exit 1' : 'exit 0');
  mock('timeout', `echo "timeout $*" >> "$TEST_CALL_LOG"\n[ "$1" = --kill-after=5s ] && shift\nshift\nexec "$@"`);
  mock('node', `case "$1" in -e) grep -q '"ok":true' && exit 0; exit 1;; esac\nexit 1`);
  const systemd = mock('systemd-run', `echo "$*" >> "$TEST_CALL_LOG"\ncase "$*" in\n  *sandbox-check-e2e*) echo '{"ok":true}'; exit ${opts.e2eExit ?? 0};;\n  *sandbox-check-sys*) echo '{"ok":true}'; exit ${opts.systemExit ?? 0};;\n  *) exit 0;;\nesac`);
  const dummy = mock('dummy', 'exit 0');
  const result = spawnSync('bash', [join(root, 'scripts/check-sandbox-compat.sh')], {
    encoding: 'utf8', timeout: 10000,
    env: { ...process.env, PATH: `${join(root, 'bin')}:/usr/bin:/bin`, TEST_CALL_LOG: log,
      SANDBOX_CHECK_BWRAP_PATH: dummy, SANDBOX_CHECK_LIMITER_PATH: dummy,
      SANDBOX_CHECK_SYSTEMD_RUN_PATH: systemd, SANDBOX_CHECK_PDFIMAGES_PATH: dummy },
  });
  return { result, calls: readFileSync(log, 'utf8') };
}

describe.skipIf(process.platform !== 'linux' || !existsSync('/dev/shm'))('orquestração do diagnóstico de sandbox', () => {
  it('não considera sucesso se o processo falhar apesar do JSON ok', () => {
    const { result } = fixture({ e2eExit: 7 });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('INCOMPATÍVEL');
  });
  it('em root sem gerenciador de usuário tenta unidade de sistema', () => {
    const { result, calls } = fixture({ uid: 0, userManager: false });
    expect(result.status).toBe(0);
    expect(calls).toContain('sandbox-check-sys-');
    expect(result.stdout).toContain('unidade de SISTEMA transitória');
    expect(result.stdout).toContain('INCONCLUSIVO (aproximação --user)');
  });
  it('em root não aceita JSON positivo quando a unidade de sistema falha', () => {
    const { result } = fixture({ uid: 0, userManager: false, systemExit: 4 });
    expect(result.status).toBe(1);
  });
  it('reconhece caminho bloqueado e evita falso diagnóstico de sandbox', () => {
    const { result, calls } = fixture({ protectedPath: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('INCONCLUSIVO');
    expect(result.stdout).toContain('caminhos necessários ocultos');
    expect(calls).not.toContain('sandbox-check-e2e-');
  });
  it('em root deixa claro quando caminho protegido impediu a prova de sistema', () => {
    const { result } = fixture({ uid: 0, userManager: false, protectedPath: true });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('prova de sistema NÃO FOI EXECUTADA');
    expect(result.stdout).not.toContain('prova extra como unidade de SISTEMA transitória (acima) FALHOU');
  });
  it('aplica timeout aos processos e falha fechado em expiração', () => {
    const { result, calls } = fixture({ e2eExit: 124 });
    expect(result.status).toBe(1);
    expect(calls).toContain('timeout --kill-after=5s 40s');
  });
});
