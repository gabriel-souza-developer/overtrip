import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm, chmod, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { sandboxArgs } from './mediaSandbox.js';
import { AppError } from '../middleware/errorHandler.js';
import { assertImageUpload, MEDIA_MAX_BYTES, MediaUploadError } from './mediaUpload.js';
import { processImage, type ProcessedImage } from './mediaProcessing.js';

const run = promisify(execFile);
type ProcessedVideo = Omit<ProcessedImage, 'ext' | 'mimeType'> & { ext: 'mp4'; mimeType: 'video/mp4' };
export type ProcessedTripMedia = ProcessedImage | ProcessedVideo;

export function assertTripUpload(contentType: string | undefined, body: unknown) {
  if (contentType?.split(';')[0].trim().toLowerCase() !== 'video/mp4') {
    return assertImageUpload(contentType, body);
  }
  if (!Buffer.isBuffer(body) || body.length < 16 || body.toString('latin1', 4, 8) !== 'ftyp') {
    throw new MediaUploadError(415, 'Envie um vídeo MP4 válido.');
  }
  if (body.length > MEDIA_MAX_BYTES) throw new MediaUploadError(413, 'O vídeo ultrapassa 15 MiB.');
  return { body, kind: 'mp4' as const };
}

let activeVideos = 0;
export async function processTripUpload(upload: ReturnType<typeof assertTripUpload>): Promise<ProcessedTripMedia> {
  if (upload.kind !== 'mp4') return processImage(upload.body);
  if (activeVideos >= 2) throw new AppError(429, 'Há vídeos em processamento. Tente novamente em instantes.');
  activeVideos++;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(path.join(tmpdir(), 'overtrip-video-'));
    const source = path.join(directory, 'input.mp4');
    await writeFile(source, upload.body, { mode: 0o600 });
    // The parent directory is private. Only the single file is bound read-only.
    await chmod(source, 0o444);
    const limits = { timeout: 15000, maxBuffer: 65536, killSignal: 'SIGKILL' as const, env: { PATH: '/usr/bin:/bin', OPENBLAS_NUM_THREADS: '1' } };
    const bwrap = '/usr/bin/bwrap';
    const limiter = '/usr/bin/prlimit';
    const sandbox = [...sandboxArgs(), '--ro-bind-try', '/etc/alternatives', '/etc/alternatives', '--setenv', 'OPENBLAS_NUM_THREADS', '1', '--ro-bind', source, '/input.mp4'];
    const restricted = ['--', limiter, '--as=1073741824', '--cpu=10', '--nofile=64', '--fsize=' + MEDIA_MAX_BYTES, '--'];
    try {
      await Promise.all(['/usr/bin/ffprobe', '/usr/bin/ffmpeg'].map(binary => access(binary, 1)));
      await Promise.all(['/usr/bin/ffprobe', '/usr/bin/ffmpeg'].map(binary => run(bwrap, [...sandbox, ...restricted, binary, '-version'], limits)));
    } catch {
      throw AppError.serviceUnavailable('Processamento isolado de vídeo indisponível.');
    }
    const input = ['-v', 'error', '-protocol_whitelist', 'file', '-f', 'mov', '-enable_drefs', '0', '-use_absolute_path', '0', '-i', '/input.mp4'];
    const { stdout } = await run(bwrap, [...sandbox, ...restricted, '/usr/bin/ffprobe', ...input, '-count_packets', '-show_entries', 'stream=codec_name,codec_type,width,height,nb_read_packets:format=duration', '-of', 'json'], limits);
    const info = JSON.parse(stdout);
    const video = info.streams?.find((stream: { codec_type: string }) => stream.codec_type === 'video');
    const duration = Number(info.format?.duration);
    if (video?.codec_name !== 'h264' || !(Number(video.nb_read_packets) > 0) ||
        !(video.width > 0 && video.width <= 4096 && video.height > 0 && video.height <= 4096) ||
        !(duration > 0 && duration <= 300) ||
        info.streams.some((stream: { codec_type: string; codec_name: string }) => stream.codec_type === 'audio' && stream.codec_name !== 'aac')) {
      throw new MediaUploadError(415, 'Use MP4 H.264 com áudio AAC opcional, até 5 minutos e 4096 px de lado.');
    }
    // Rebuild the container using only the selected video and optional audio.
    const command = 'umask 077; /usr/bin/ffmpeg "$@" /output/video.mp4 && /usr/bin/cat /output/video.mp4';
    const { stdout: main } = await run(bwrap, [...sandbox, '--size', String(MEDIA_MAX_BYTES + 65536), '--tmpfs', '/output',
      ...restricted, '/bin/sh', '-c', command, 'ffmpeg', '-nostdin', '-xerror', ...input, '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1',
      '-map_chapters', '-1', '-c', 'copy', '-movflags', '+faststart'], { ...limits, encoding: 'buffer', maxBuffer: MEDIA_MAX_BYTES });
    if (main.length === 0) throw new MediaUploadError(400, 'O vídeo processado está vazio.');
    return { ext: 'mp4', mimeType: 'video/mp4', width: video.width, height: video.height, main, variants: [] };
  } catch (error) {
    if (error instanceof MediaUploadError || error instanceof AppError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw AppError.serviceUnavailable('Processamento de vídeo indisponível.');
    throw new MediaUploadError(400, 'Não foi possível ler o vídeo MP4.');
  } finally {
    activeVideos--;
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
