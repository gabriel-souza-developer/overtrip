import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdtempSync, writeFileSync, linkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function start(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ['--import', 'tsx', resolve('src/platformIndex.ts')], {
    env: { ...process.env, PLATFORM_DATABASE_URL: '', PLATFORM_JWT_SECRET: '', ...env },
    encoding: 'utf8', timeout: 10000,
  });
}

describe('inicialização isolada da plataforma', () => {
  it('recusa iniciar sem banco e segredo próprios', () => {
    const result = start({});
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PLATFORM_DATABASE_URL e PLATFORM_JWT_SECRET');
  });
  it('recusa banco ou segredo textualmente iguais ao turismo', () => {
    const result = start({ DATABASE_URL: 'file:legacy.db', JWT_SECRET: 'legacy-secret', PLATFORM_DATABASE_URL: 'file:legacy.db', PLATFORM_JWT_SECRET: 'separate-secret' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('devem ser diferentes');
    const sameSecret = start({ DATABASE_URL: 'file:legacy.db', JWT_SECRET: 'legacy-secret', PLATFORM_DATABASE_URL: 'file:other.db', PLATFORM_JWT_SECRET: 'legacy-secret' });
    expect(sameSecret.status).not.toBe(0);
    expect(sameSecret.stderr).toContain('devem ser diferentes');
  });
  it('recusa caminhos relativos e absolutos que apontam ao mesmo banco SQLite', () => {
    const result = start({ DATABASE_URL: 'file:./legacy-check.db', JWT_SECRET: 'legacy-secret', PLATFORM_DATABASE_URL: `file:${resolve('prisma/legacy-check.db')}`, PLATFORM_JWT_SECRET: 'separate-secret' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('devem ser diferentes');
  });
  it('recusa hard links para o mesmo banco', () => {
    const directory = mkdtempSync(join(tmpdir(), 'platform-links-'));
    try {
      const original = join(directory, 'legacy.db');
      const alias = join(directory, 'platform.db');
      writeFileSync(original, 'fixture');
      linkSync(original, alias);
      const result = start({ DATABASE_URL: `file:${original}`, JWT_SECRET: 'legacy-secret', PLATFORM_DATABASE_URL: `file:${alias}`, PLATFORM_JWT_SECRET: 'separate-secret' });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('devem ser diferentes');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
