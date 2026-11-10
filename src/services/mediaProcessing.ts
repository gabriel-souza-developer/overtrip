import sharp from 'sharp';
import { MEDIA_MAX_DIMENSION, MEDIA_MAX_PIXELS, MediaUploadError } from './mediaUpload.js';

/** Mesmas larguras do site (js/render.js e tools/gerar-imagens-hero.py). */
export const MEDIA_VARIANT_WIDTHS = [640, 960, 1280] as const;
/** Lado maior da versão principal (src) guardada. */
export const MEDIA_MAIN_MAX_SIDE = 2560;

export interface ProcessedImage {
  ext: 'jpg' | 'png';
  mimeType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  main: Buffer;
  variants: { width: number; buffer: Buffer }[];
}

const inputOptions = { limitInputPixels: MEDIA_MAX_PIXELS, failOn: 'error' as const, animated: false };

/**
 * Decodifica e reescreve a imagem: aplica a rotação do EXIF e grava arquivos
 * novos sem metadados (o sharp só copia EXIF/GPS/XMP com keepMetadata, que não
 * usamos). Imagens com transparência continuam PNG; as demais viram JPEG.
 */
export async function processImage(body: Buffer): Promise<ProcessedImage> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(body, inputOptions).metadata();
  } catch {
    throw new MediaUploadError(400, 'Não foi possível ler a imagem. O arquivo pode estar corrompido.');
  }
  const { width = 0, height = 0 } = meta;
  if (!width || !height) throw new MediaUploadError(400, 'Não foi possível ler as dimensões da imagem.');
  if (width > MEDIA_MAX_DIMENSION || height > MEDIA_MAX_DIMENSION || width * height > MEDIA_MAX_PIXELS) {
    throw new MediaUploadError(413, `A imagem é grande demais (${width}×${height}). Use até ${MEDIA_MAX_DIMENSION} px de lado.`);
  }

  try {
    // Uma decodificação só; cada saída parte do bitmap já girado.
    const { data, info } = await sharp(body, inputOptions)
      .rotate()
      .resize({ width: MEDIA_MAIN_MAX_SIDE, height: MEDIA_MAIN_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };
    const hasAlpha = info.channels === 4 && hasTransparency(data, info.channels);
    const fromRaw = () => sharp(data, raw);

    const main = hasAlpha
      ? await fromRaw().png({ compressionLevel: 9, palette: false }).toBuffer()
      : await fromRaw().removeAlpha().jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    const variants = await Promise.all(MEDIA_VARIANT_WIDTHS.map(async (variantWidth) => ({
      width: variantWidth,
      buffer: await fromRaw().resize({ width: variantWidth, withoutEnlargement: true }).webp({ quality: 76 }).toBuffer(),
    })));
    return {
      ext: hasAlpha ? 'png' : 'jpg',
      mimeType: hasAlpha ? 'image/png' : 'image/jpeg',
      width: info.width,
      height: info.height,
      main,
      variants,
    };
  } catch {
    throw new MediaUploadError(400, 'Não foi possível processar a imagem. O arquivo pode estar corrompido.');
  }
}

function hasTransparency(data: Buffer, channels: number): boolean {
  for (let i = channels - 1; i < data.length; i += channels) {
    if (data[i] !== 255) return true;
  }
  return false;
}
