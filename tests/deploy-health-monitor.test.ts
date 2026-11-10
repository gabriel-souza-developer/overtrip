import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const script = readFileSync('deploy/monitor-health.sh', 'utf8');
const service = readFileSync('deploy/overtrip-health.service', 'utf8');

describe('monitor de saúde da Oracle', () => {
  it('tem sintaxe bash válida', () => {
    expect(() => execFileSync('bash', ['-n', 'deploy/monitor-health.sh'])).not.toThrow();
  });

  it('roda sem root e com sistema de arquivos protegido', () => {
    expect(service).toMatch(/^User=overtrip$/m);
    expect(service).toMatch(/^NoNewPrivileges=true$/m);
    expect(service).toMatch(/^ProtectSystem=strict$/m);
    expect(service).not.toMatch(/^User=root$/m);
  });

  it('não lê banco, ambiente nem credenciais', () => {
    expect(script).not.toMatch(/\/etc\/overtrip\/env|overtrip\.db\b|sqlite3|DATABASE_URL|JWT_SECRET/);
  });

  it('não fixa o IP privado da VM', () => {
    expect(script).not.toMatch(/\b10\.0\.0\.\d+\b/);
  });
});
