import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { assertImageUpload, detectImageKind, MEDIA_MAX_DIMENSION, MediaUploadError } from '../src/services/mediaUpload.js';
import { MEDIA_MAIN_MAX_SIDE, MEDIA_VARIANT_WIDTHS, processImage } from '../src/services/mediaProcessing.js';

const solid = (width: number, height: number, channels: 3 | 4 = 3, alpha = 1) =>
  sharp({ create: { width, height, channels, background: { r: 226, g: 107, b: 27, alpha } } });

/** JPEG "de celular": 400×200 em pixels, orientação 6 (girar 90°), câmera e GPS no EXIF. */
const phoneJpeg = () => solid(400, 200).jpeg()
  .withMetadata({ orientation: 6 })
  .withExif({ IFD0: { Make: 'CameraDeTeste', Copyright: 'Fulano' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '7/1 15/1 0/1' } })
  .toBuffer();

const expectRejected = async (promise: Promise<unknown>, status: number) => {
  const error = await promise.then(() => null, (e) => e);
  expect(error).toBeInstanceOf(MediaUploadError);
  expect((error as MediaUploadError).status).toBe(status);
};

describe('detectImageKind', () => {
  it('reconhece JPEG, PNG e WebP pelos bytes, não pela extensão', async () => {
    expect(detectImageKind(await solid(4, 4).jpeg().toBuffer())).toBe('jpeg');
    expect(detectImageKind(await solid(4, 4).png().toBuffer())).toBe('png');
    expect(detectImageKind(await solid(4, 4).webp().toBuffer())).toBe('webp');
    expect(detectImageKind(await solid(4, 4).gif().toBuffer())).toBeNull();
    expect(detectImageKind(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageKind(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(detectImageKind(Buffer.from('RIFF0000WAVE'))).toBeNull();
  });
});

describe('assertImageUpload', () => {
  it('recusa Content-Type que não é de imagem aceita (415)', async () => {
    const jpeg = await solid(4, 4).jpeg().toBuffer();
    for (const type of ['text/html', 'image/svg+xml', 'image/gif', undefined]) {
      expect(() => assertImageUpload(type, jpeg)).toThrow(expect.objectContaining({ status: 415 }));
    }
    expect(assertImageUpload('image/png; charset=binary', jpeg).kind).toBe('jpeg');
  });

  it('recusa arquivo com tipo falso (HTML com Content-Type de imagem) com 415', () => {
    expect(() => assertImageUpload('image/jpeg', Buffer.from('<html><script>alert(1)</script>'))).toThrow(expect.objectContaining({ status: 415 }));
  });

  it('recusa vazio (400) e grande demais (413)', async () => {
    expect(() => assertImageUpload('image/jpeg', Buffer.alloc(0))).toThrow(expect.objectContaining({ status: 400 }));
    const jpeg = await solid(4, 4).jpeg().toBuffer();
    expect(() => assertImageUpload('image/jpeg', jpeg, jpeg.length - 1)).toThrow(expect.objectContaining({ status: 413 }));
  });
});

describe('processImage', () => {
  it('aplica a rotação do EXIF e remove todos os metadados (EXIF/GPS)', async () => {
    const input = await phoneJpeg();
    const before = await sharp(input).metadata();
    expect(before.orientation).toBe(6);
    expect(before.exif?.toString('latin1')).toContain('CameraDeTeste');

    const result = await processImage(input);
    expect(result).toMatchObject({ ext: 'jpg', mimeType: 'image/jpeg', width: 200, height: 400 });
    for (const buffer of [result.main, ...result.variants.map((v) => v.buffer)]) {
      const meta = await sharp(buffer).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
      expect(buffer.toString('latin1')).not.toContain('CameraDeTeste');
    }
    expect((await sharp(result.main).metadata()).format).toBe('jpeg');
  });

  it('gera WebP em 640/960/1280 sem ampliar e limita a versão principal', async () => {
    const result = await processImage(await solid(3000, 1500).jpeg().toBuffer());
    expect(Math.max(result.width, result.height)).toBe(MEDIA_MAIN_MAX_SIDE);
    expect(result.variants.map((v) => v.width)).toEqual([...MEDIA_VARIANT_WIDTHS]);
    for (const variant of result.variants) {
      const meta = await sharp(variant.buffer).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(variant.width);
    }

    const small = await processImage(await solid(500, 300).webp().toBuffer());
    expect(small.width).toBe(500);
    for (const variant of small.variants) expect((await sharp(variant.buffer).metadata()).width).toBe(500);
  });

  it('mantém PNG quando há transparência; PNG opaco vira JPEG', async () => {
    expect((await processImage(await solid(50, 50, 4, 0.5).png().toBuffer())).ext).toBe('png');
    expect((await processImage(await solid(50, 50, 4, 1).png().toBuffer())).ext).toBe('jpg');
  });

  it('recusa dimensões excessivas antes de decodificar (413)', async () => {
    // PNG pequeno em bytes, mas enorme em pixels: o padrão de uma decompression bomb.
    const bomb = await sharp({ create: { width: MEDIA_MAX_DIMENSION + 1, height: 10, channels: 3, background: '#000' } }).png().toBuffer();
    expect(bomb.length).toBeLessThan(200_000);
    await expectRejected(processImage(bomb), 413);
  });

  it('recusa bytes corrompidos com assinatura válida (400)', async () => {
    const jpeg = await solid(64, 64).jpeg().toBuffer();
    await expectRejected(processImage(Buffer.concat([jpeg.subarray(0, 20), Buffer.alloc(200, 7)])), 400);
  });
});
