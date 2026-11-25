import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaWriteCleanupError, writeImageFiles } from '../src/services/mediaStorage';
import type { ProcessedImage } from '../src/services/mediaProcessing';

// Auditoria: writeImageFiles apagava o que tinha gravado com
// .catch(() => {}) e sempre relançava o erro original, escondendo quando a
// própria limpeza também falhava — o chamador (mediaRoutes.ts) não tinha
// como saber que podia ter sobrado arquivo parcial, e apagava o registro
// pendente mesmo assim. Agora, se a limpeza falhar de verdade, o erro vira
// MediaWriteCleanupError, para que o chamador NUNCA apague o registro
// correspondente nesse caso.

let directory: string;

beforeAll(() => { directory = mkdtempSync(join(tmpdir(), 'overtrip-media-storage-')); vi.stubEnv('UPLOADS_DIR', directory); });
afterAll(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

const image = (key: string): { image: ProcessedImage; collidingPath: string } => ({
  image: {
    ext: 'jpg', mimeType: 'image/jpeg', width: 10, height: 10,
    main: Buffer.from('principal'),
    variants: [{ width: 640, buffer: Buffer.from('v640') }, { width: 960, buffer: Buffer.from('v960') }, { width: 1280, buffer: Buffer.from('v1280') }],
  },
  collidingPath: join(directory, `${key}-w960.webp`),
});

describe('writeImageFiles: limpeza em falha', () => {
  it('se a própria escrita falhar e a limpeza do que já tinha sido gravado também falhar, lança MediaWriteCleanupError e preserva o que não pôde remover', async () => {
    const key = 'bb000000000000000000000000000000'.slice(0, 32);
    const { image: img, collidingPath } = image(key);
    // Ocupa o caminho da variante w960 com um DIRETÓRIO: a escrita ('wx') falha
    // ali (já existe), E a limpeza (unlink) também falha para o mesmo caminho
    // (não dá para remover diretório com unlink) — falha real, não ENOENT.
    mkdirSync(collidingPath);

    await expect(writeImageFiles(img, key)).rejects.toThrow(MediaWriteCleanupError);
    // A limpeza ainda remove o que PODE: principal e w640, gravados com sucesso antes da colisão.
    expect(existsSync(join(directory, `${key}.jpg`))).toBe(false);
    expect(existsSync(join(directory, `${key}-w640.webp`))).toBe(false);
    // O que não pôde ser removido continua lá — nada foi varrido para debaixo do tapete.
    expect(existsSync(collidingPath)).toBe(true);

    rmSync(collidingPath, { recursive: true, force: true });
  });

  it('se a escrita falhar mas a limpeza do que já tinha sido gravado suceder inteiramente, lança o erro original (não MediaWriteCleanupError)', async () => {
    const key = 'cc000000000000000000000000000000'.slice(0, 32);
    const { image: img, collidingPath } = image(key);
    // Mesma colisão, mas como arquivo comum: a escrita falha (já existe), e a
    // limpeza consegue remover tudo, incluindo esse arquivo.
    mkdirSync(collidingPath, { recursive: true });
    rmSync(collidingPath, { recursive: true, force: true });
    const fs = await import('node:fs');
    fs.writeFileSync(collidingPath, 'colisao-arquivo-comum');

    let caught: unknown;
    try { await writeImageFiles(img, key); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(MediaWriteCleanupError);
    expect(existsSync(join(directory, `${key}.jpg`))).toBe(false);
    expect(existsSync(collidingPath)).toBe(false);
  });
});
