import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import { mediaFilePath } from './mediaStorage.js';

/** Caller authorizes this exact MP4 before entering, including every range request. */
export async function serveVideoFromDisk(res: Response, directory: string, filename: string, cacheControl: string): Promise<void> {
  const handle = await open(mediaFilePath(directory, filename), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(error => {
    if (['ENOENT', 'ELOOP'].includes(error.code)) throw AppError.notFound('Vídeo não encontrado.');
    throw error;
  });
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || !stat.size) throw AppError.notFound('Vídeo não encontrado.');
    res.set({ 'Cache-Control': cacheControl, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    let start = 0;
    let end = stat.size - 1;
    const ranges = res.req.range(stat.size);
    if (ranges === -1) {
      res.set('Content-Range', 'bytes */' + stat.size).status(416).end();
      return;
    }
    if (Array.isArray(ranges) && ranges.type === 'bytes' && ranges.length === 1) {
      ({ start, end } = ranges[0]);
      res.status(206).set('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    }
    res.set('Content-Length', String(end - start + 1));
    if (res.req.method === 'HEAD') { res.end(); return; }
    await pipeline(handle.createReadStream({ start, end, autoClose: false }), res);
  } finally {
    await handle.close();
  }
}
