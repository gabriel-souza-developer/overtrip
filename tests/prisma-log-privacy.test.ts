import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('logs do cliente Prisma', () => {
  it('não imprime argumentos privados em erros de validação', () => {
    const script = `import { prisma } from './src/lib/prisma.ts';
      try { await prisma.user.create({ data: { email: 'private-fixture@example.test', passwordHash: 'x', invalidField: 'private-fixture-value' } }); }
      catch {} finally { await prisma.$disconnect(); }`;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      env: { ...process.env, NODE_ENV: 'test' }, encoding: 'utf8', timeout: 10000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).not.toContain('private-fixture');
  });
});
