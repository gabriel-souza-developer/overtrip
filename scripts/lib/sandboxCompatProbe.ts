import sharp from 'sharp';
import { PdfImagesError, extractEmbeddedImages, processPdfCandidateSandboxed } from '../../src/services/pdfEmbeddedImages';

/**
 * Pure, testable half of scripts/check-sandbox-compat.sh: exercises the REAL
 * extraction + variant-generation chain (src/services/pdfEmbeddedImages.ts)
 * against a synthetic, non-sensitive PDF built fresh in memory — never a
 * real document, never anything read from disk or a database. The shell
 * script supplies the sandbox binary paths and wraps the CLI entrypoint
 * (scripts/check-sandbox-compat.ts) inside the systemd-run/bwrap probes that
 * emulate the deployed unit's restrictions; this module only proves whether
 * the application code itself completes successfully GIVEN whatever
 * environment it is invoked in — it never loosens, retries with weaker
 * flags, or falls back: extractEmbeddedImages/processPdfCandidateSandboxed
 * already fail closed on their own (SANDBOX_UNAVAILABLE,
 * MEMORY_ISOLATION_UNAVAILABLE, ...), and this module only reports that.
 */

export interface SandboxPaths {
  bwrapPath: string;
  limiterPath: string;
  systemdRunPath: string;
  pdfimagesPath: string;
  timeoutMs?: number;
}

export interface ProbeOk {
  ok: true;
  stage: 'done';
  candidates: number;
  width: number;
  height: number;
  variants: number;
}

export interface ProbeFail {
  ok: false;
  // Which half of the real pipeline rejected it: 'extract' is the
  // pdfimages/bwrap half (SANDBOX_UNAVAILABLE lives here), 'process' is the
  // sharp/systemd-run decode+variant half (MEMORY_ISOLATION_UNAVAILABLE
  // lives here) — the two mechanisms the independent analysis found behave
  // differently under systemd sandboxing, so collapsing them into one stage
  // would hide which one actually broke.
  stage: 'extract' | 'process' | 'unexpected';
  code: string;
  message: string;
}

export type ProbeResult = ProbeOk | ProbeFail;

/**
 * One tiny embedded JPEG inside a hand-built, minimal PDF — the same shape
 * tests/pdf-embedded-images.test.ts already uses for its own synthetic
 * fixture, kept as a small local duplicate rather than a shared import: this
 * file is an operator-facing script dependency (scripts/ is excluded from
 * the tsc build and never ships with dist/), and must not create a runtime
 * dependency from the app's compiled output back onto test-only code, or
 * vice versa. 64×48 keeps the real sandboxed decode step fast (seconds, not
 * a real-document-sized wait) while still exercising every stage: list,
 * export, decode, resize, re-encode to the three stored variants.
 */
export async function buildSyntheticPdfFixture(): Promise<{ pdf: Buffer; width: number; height: number }> {
  const width = 64;
  const height = 48;
  const jpeg = await sharp({ create: { width, height, channels: 3, background: '#4477aa' } }).jpeg().toBuffer();
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [0];
  let size = chunks[0].length;
  const add = (value: Buffer | string) => {
    const part = Buffer.isBuffer(value) ? value : Buffer.from(value);
    chunks.push(part);
    size += part.length;
  };
  const object = (index: number, content: Buffer | string) => {
    offsets[index] = size;
    add(`${index} 0 obj\n`);
    add(content);
    add('\nendobj\n');
  };
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  object(4, Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
    jpeg,
    Buffer.from('\nendstream'),
  ]));
  const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
  object(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = size;
  add('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i += 1) add(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return { pdf: Buffer.concat(chunks), width, height };
}

/**
 * Runs the real chain end to end: list+export+decode one embedded image
 * (extractEmbeddedImages — bwrap sandbox, both phases), then generate the
 * three stored variants (processPdfCandidateSandboxed — its own bwrap
 * sandbox plus the systemd-run --user --scope cgroup memory cap). Never
 * persists, imports or exposes anything: the result is discarded by every
 * caller once it reports ok/not-ok. Every PdfImagesError is reported by its
 * own `code`, never swallowed into a generic failure — that code is exactly
 * what SANDBOX_UNAVAILABLE / MEMORY_ISOLATION_UNAVAILABLE / CONCURRENCY_LIMIT
 * etc. already mean in src/services/pdfEmbeddedImages.ts.
 */
export async function runExtractionProbe(sandbox: SandboxPaths): Promise<ProbeResult> {
  try {
    const fixture = await buildSyntheticPdfFixture();
    const extractSandbox = { bwrapPath: sandbox.bwrapPath, limiterPath: sandbox.limiterPath, systemdRunPath: sandbox.systemdRunPath, timeoutMs: sandbox.timeoutMs };
    let candidates;
    try {
      candidates = await extractEmbeddedImages(fixture.pdf, sandbox.pdfimagesPath, extractSandbox);
    } catch (error) {
      if (error instanceof PdfImagesError) return { ok: false, stage: 'extract', code: error.code, message: error.message };
      throw error;
    }
    if (candidates.length !== 1) {
      return { ok: false, stage: 'extract', code: 'EXTRACTION_FAILED', message: `esperava exatamente 1 imagem sintética da lista fixa, recebeu ${candidates.length}` };
    }
    try {
      const processed = await processPdfCandidateSandboxed(candidates[0], extractSandbox);
      return { ok: true, stage: 'done', candidates: candidates.length, width: processed.width, height: processed.height, variants: processed.variants.length };
    } catch (error) {
      if (error instanceof PdfImagesError) return { ok: false, stage: 'process', code: error.code, message: error.message };
      throw error;
    }
  } catch (error) {
    return { ok: false, stage: 'unexpected', code: error instanceof PdfImagesError ? error.code : 'UNEXPECTED', message: error instanceof Error ? error.message : String(error) };
  }
}
