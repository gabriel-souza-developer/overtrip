import { describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import app from '../src/app.js';

const script = resolve(__dirname, '../deploy/backup-uploads.sh');
const key = '0123456789abcdef0123456789abcdef';

describe('backup-uploads.sh', () => {
  it('copia mídia gerada pelo servidor, inclusive vídeo, de forma incremental e sem apagar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-up-'));
    const src = join(dir, 'uploads');
    const dest = join(dir, 'backup');
    mkdirSync(src);
    for (const name of [`${key}.jpg`, `${key}.mp4`, `${key}-w640.webp`, `${key}-w960.webp`, `${key}-w1280.webp`]) writeFileSync(join(src, name), name);
    writeFileSync(join(src, '.env'), 'segredo');
    writeFileSync(join(src, 'qualquer.jpg'), 'x');

    const first = spawnSync('bash', [script, src, dest], { encoding: 'utf8' });
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('Arquivos de mídia copiados: 5');
    expect(readdirSync(dest).sort()).toEqual([`${key}-w1280.webp`, `${key}-w640.webp`, `${key}-w960.webp`, `${key}.jpg`, `${key}.mp4`]);
    expect(readFileSync(join(dest, `${key}.mp4`), 'utf8')).toBe(`${key}.mp4`);
    expect(statSync(join(dest, `${key}.mp4`)).mode & 0o077).toBe(0);
    expect(readFileSync(join(dest, `${key}.jpg`), 'utf8')).toBe(`${key}.jpg`);
    expect(statSync(join(dest, `${key}.jpg`)).mode & 0o077).toBe(0);

    // Uma imagem apagada da origem continua no backup; a segunda execução não recopia.
    spawnSync('rm', [join(src, `${key}.jpg`)]);
    const second = spawnSync('bash', [script, src, dest], { encoding: 'utf8' });
    expect(second.stdout).toContain('Arquivos de mídia copiados: 0');
    expect(readdirSync(dest)).toContain(`${key}.jpg`);
  });

  it('não falha quando a pasta de uploads ainda não existe', () => {
    const r = spawnSync('bash', [script, '/nao/existe/uploads', join(tmpdir(), 'bk-up-vazio')], { encoding: 'utf8' });
    expect(r.status).toBe(0);
  });

  it('restaura imagens legadas aprovadas, acompanha alterações e falha fechado sem manifesto válido', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-up-restore-'));
    const src = join(dir, 'uploads');
    const dest = join(dir, 'backup');
    const restored = join(dir, 'restored');
    const filename = `${key}.jpg`;
    const contents = Buffer.from('imagem legada fictícia');
    const manifest = JSON.stringify({ entries: [{ filename, sizeBytes: contents.length, sha256: createHash('sha256').update(contents).digest('hex') }] });
    mkdirSync(src);
    writeFileSync(join(src, filename), contents);
    writeFileSync(join(src, '.legacy-media-allowlist.json'), manifest);
    const server = app.listen(0);
    try {
      expect(spawnSync('bash', [script, src, dest]).status).toBe(0);
      expect(statSync(join(dest, '.legacy-media-allowlist.json')).mode & 0o077).toBe(0);
      cpSync(dest, restored, { recursive: true });
      vi.stubEnv('UPLOADS_DIR', restored);
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/public/media/${filename}`;
      const approved = await fetch(url);
      expect(approved.status).toBe(200);
      expect(Buffer.from(await approved.arrayBuffer())).toEqual(contents);

      // Uma lista malformada não aprova nada, inclusive após restauração.
      writeFileSync(join(src, '.legacy-media-allowlist.json'), '{');
      expect(spawnSync('bash', [script, src, dest]).status).toBe(0);
      expect(readFileSync(join(dest, '.legacy-media-allowlist.json'), 'utf8')).toBe('{');
      cpSync(join(dest, '.legacy-media-allowlist.json'), join(restored, '.legacy-media-allowlist.json'));
      expect((await fetch(url)).status).toBe(404);

      // Remover a lista da origem também impede restaurar aprovação antiga.
      rmSync(join(src, '.legacy-media-allowlist.json'));
      expect(spawnSync('bash', [script, src, dest]).status).toBe(0);
      expect(readdirSync(dest)).not.toContain('.legacy-media-allowlist.json');
      rmSync(join(restored, '.legacy-media-allowlist.json'));
      expect((await fetch(url)).status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
      await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('recusa manifesto que seja link simbólico sem preservar cópia antiga autorizada', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-up-link-'));
    try {
      const src = join(dir, 'uploads'); const dest = join(dir, 'backup');
      mkdirSync(src); mkdirSync(dest);
      writeFileSync(join(dest, '.legacy-media-allowlist.json'), 'antigo');
      writeFileSync(join(dir, 'outside'), 'conteúdo externo');
      symlinkSync(join(dir, 'outside'), join(src, '.legacy-media-allowlist.json'));
      expect(spawnSync('bash', [script, src, dest]).status).not.toBe(0);
      expect(readdirSync(dest)).not.toContain('.legacy-media-allowlist.json');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
