import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve(__dirname, '../deploy/backup-uploads.sh');
const key = '0123456789abcdef0123456789abcdef';

describe('backup-uploads.sh', () => {
  it('copia só imagens geradas pelo servidor, de forma incremental e sem apagar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-up-'));
    const src = join(dir, 'uploads');
    const dest = join(dir, 'backup');
    mkdirSync(src);
    for (const name of [`${key}.jpg`, `${key}-w640.webp`, `${key}-w960.webp`, `${key}-w1280.webp`]) writeFileSync(join(src, name), name);
    writeFileSync(join(src, '.env'), 'segredo');
    writeFileSync(join(src, 'qualquer.jpg'), 'x');

    const first = spawnSync('bash', [script, src, dest], { encoding: 'utf8' });
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('Imagens copiadas: 4');
    expect(readdirSync(dest).sort()).toEqual([`${key}-w1280.webp`, `${key}-w640.webp`, `${key}-w960.webp`, `${key}.jpg`]);
    expect(readFileSync(join(dest, `${key}.jpg`), 'utf8')).toBe(`${key}.jpg`);
    expect(statSync(join(dest, `${key}.jpg`)).mode & 0o077).toBe(0);

    // Uma imagem apagada da origem continua no backup; a segunda execução não recopia.
    spawnSync('rm', [join(src, `${key}.jpg`)]);
    const second = spawnSync('bash', [script, src, dest], { encoding: 'utf8' });
    expect(second.stdout).toContain('Imagens copiadas: 0');
    expect(readdirSync(dest)).toContain(`${key}.jpg`);
  });

  it('não falha quando a pasta de uploads ainda não existe', () => {
    const r = spawnSync('bash', [script, '/nao/existe/uploads', join(tmpdir(), 'bk-up-vazio')], { encoding: 'utf8' });
    expect(r.status).toBe(0);
  });
});
