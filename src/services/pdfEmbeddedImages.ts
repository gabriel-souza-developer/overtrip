import { sandboxArgs } from './mediaSandbox.js';
import { execFile } from 'node:child_process';
import { access, chmod, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ProcessedImage } from './mediaProcessing.js';

// These limits apply before importing anything into a trip or making it public.
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 30;
const MAX_IMAGES = 20;
const MAX_PIXELS_PER_IMAGE = 4_000_000;
const MAX_TOTAL_PIXELS = 12_000_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_OUTPUT_BYTES = 48 * 1024 * 1024;
const MAX_DIMENSION = 4096;
const TIMEOUT_MS = 15_000;
const MAX_ADDRESS_SPACE_BYTES = 805_306_368; // 768 MiB, per sandboxed process (prlimit --as).
const MAX_CPU_SECONDS = 12; // prlimit --cpu; bounds CPU time, not wall clock (TIMEOUT_MS covers that).
// A tmpfs sized and mounted INSIDE the sandbox's own, private mount
// namespace: the kernel enforces this ceiling on every write the parser
// makes, DURING extraction, across every file it produces together — not
// a tally performed only after the subprocess has already exited (the gap
// a prior review found: "cota agregada só é conferida após subprocesso").
// Sized above MAX_TOTAL_OUTPUT_BYTES for the intermediate representation
// poppler may hold before the final PNG. Verified manually on this host: a
// write past this size fails with ENOSPC while still inside the sandboxed
// process, before any byte reaches the host.
const SANDBOX_TMPFS_BYTES = MAX_TOTAL_OUTPUT_BYTES * 2;
const MAX_CONCURRENT_EXTRACTIONS = 2;

// Decode sandbox (sharp/libvips, run as its own OS process — never in this
// main Node process; see the "decode phase" comment on extractEmbeddedImages).
// --as must be MUCH larger than the parser's: verified manually on this
// host that Node/V8 itself fails to even start (FatalOOM, before any of our
// code runs) under ~1 GiB of virtual address space, regardless of how
// little it will actually commit — V8's pointer-compression cage reserves
// a large range unconditionally. 3 GiB starts reliably with headroom; it
// bounds a runaway reservation, not real RAM (DECODE_MEMORY_MAX_BYTES below
// does that).
const DECODE_ADDRESS_SPACE_BYTES = 3 * 1024 * 1024 * 1024;
const DECODE_CPU_SECONDS = 10;
const DECODE_TIMEOUT_MS = 8_000;
// RLIMIT_AS bounds virtual address space, not resident memory — verified
// manually that RLIMIT_RSS is not enforced at all on this kernel (a process
// happily grows to 2 GiB RSS under a 64 MiB --rss). A real, live RSS ceiling
// for the decode process requires a cgroup; see assertMemoryIsolationAvailable
// and the "decode phase" comment for exactly what this depends on and what
// happens when it is not available. Verified manually against a worst-case
// MAX_PIXELS_PER_IMAGE decode (4 MP, noisy, non-compressible): real peak RSS
// stayed well under 48 MiB; this is sized with large headroom above that.
const DECODE_MEMORY_MAX_BYTES = 256 * 1024 * 1024;
// A known, bounded ceiling on concurrent decode processes, separate from
// MAX_CONCURRENT_EXTRACTIONS (the parser's own gate): decoding runs once per
// embedded image, so without its own cap it could otherwise spike well past
// the parser's concurrency limit within a single extraction. At the cap,
// this commits at most MAX_CONCURRENT_DECODES × DECODE_MEMORY_MAX_BYTES of
// real RAM to decoding alone (2 × 256 MiB = 512 MiB today) — PER PROCESS.
// This module has no cross-process or cross-host coordination: a
// multi-instance deployment (several API processes, horizontally scaled)
// multiplies this number of times with no shared counter between them: an
// operator sizing a host or cluster for this feature must multiply by the
// number of instances themselves. A true cross-instance cap would need an
// external coordinator (e.g. a shared semaphore) — not implemented here,
// and not attempted without that being explicitly decided and authorized.
const MAX_CONCURRENT_DECODES = 2;

export interface EmbeddedImageCandidate {
  page: number;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
  data: Buffer;
}

export class PdfImagesError extends Error {
  constructor(readonly code: 'INVALID_PDF' | 'PARSER_UNAVAILABLE' | 'SANDBOX_UNAVAILABLE' | 'MEMORY_ISOLATION_UNAVAILABLE' | 'CONCURRENCY_LIMIT' | 'IMAGE_LIMIT' | 'EXTRACTION_FAILED') {
    super(code);
  }
}

interface ListedImage { page: number; index: number; type: string; width: number; height: number }

// systemd-run needs the user's bus to create the memory-limited scope. Never
// forward application secrets, loader overrides or Node flags to subprocesses.
function subprocessEnv(): NodeJS.ProcessEnv {
  return {
    PATH: '/usr/bin:/bin', LANG: 'C.UTF-8',
    ...(process.env.XDG_RUNTIME_DIR ? { XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR } : {}),
    ...(process.env.DBUS_SESSION_BUS_ADDRESS ? { DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS } : {}),
  };
}

function execute(file: string, args: string[], timeout = TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    // killSignal SIGKILL, not the default SIGTERM: a hostile or stuck
    // parser inside the sandbox must not be able to ignore the timeout.
    // bwrap's own reaper (it holds PID 1 in its private pid namespace,
    // via --unshare-all) then tears down every descendant with it —
    // verified manually: killing the outer bwrap process leaves nothing
    // behind, not even a lingering grandchild.
    execFile(file, args, { timeout, killSignal: 'SIGKILL', maxBuffer: 256 * 1024, encoding: 'utf8', windowsHide: true, env: subprocessEnv() }, (error, stdout) => {
      if (error) return reject(new PdfImagesError(error.code === 'ENOENT' || error.code === 'EACCES' ? 'PARSER_UNAVAILABLE' : 'EXTRACTION_FAILED'));
      resolve(stdout);
    });
  });
}

/**
 * Same process/timeout/kill semantics as execute(), but for the one call
 * whose stdout is binary image bytes, not text: see the "export phase"
 * comment in extractEmbeddedImages for why this is the ONLY channel that
 * leaves the sandbox. maxBuffer here is not an incidental limit — it is
 * the fail-closed backstop if a hostile parser tries to flood stdout past
 * what the tmpfs quota alone would allow: execFile kills the child and
 * rejects once stdout exceeds it, before any of those bytes are parsed.
 */
function executeBuffer(file: string, args: string[], timeout: number, maxBuffer: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, killSignal: 'SIGKILL', maxBuffer, encoding: 'buffer', windowsHide: true, env: subprocessEnv() }, (error, stdout) => {
      if (error) return reject(new PdfImagesError(error.code === 'ENOENT' || error.code === 'EACCES' ? 'PARSER_UNAVAILABLE' : 'EXTRACTION_FAILED'));
      resolve(stdout);
    });
  });
}

/**
 * Like executeBuffer, but feeds `input` on the child's stdin instead of
 * reading an argv-named file — used only for the decode sandbox, which
 * never receives the untrusted bytes through any filesystem path (the
 * sandboxed decode process has no writable bind at all, and no path to the
 * exported PNG either; it only ever sees a pipe). The stdin stream's own
 * 'error' listener is a deliberate no-op: if the child has already exited
 * (e.g. rejected immediately by execFile's own validation), writing to its
 * stdin raises EPIPE on the stream — execFile's callback below already
 * reports that failure; without this listener, the unhandled stream error
 * would crash the whole process instead.
 */
function executeWithStdin(file: string, args: string[], input: Buffer, timeout: number, maxBuffer: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { timeout, killSignal: 'SIGKILL', maxBuffer, encoding: 'buffer', windowsHide: true, env: subprocessEnv() }, (error, stdout) => {
      if (error) return reject(new PdfImagesError(error.code === 'ENOENT' || error.code === 'EACCES' ? 'PARSER_UNAVAILABLE' : 'EXTRACTION_FAILED'));
      resolve(stdout);
    });
    child.stdin?.on('error', () => {});
    child.stdin?.end(input);
  });
}

/**
 * Parses the framed stdout protocol the export script below writes: for
 * each expected file, in order, a decimal line (byte count, or -1 meaning
 * "not produced") followed by exactly that many raw bytes. Any deviation
 * — a missing newline, a non-numeric size, a declared size that would run
 * past the end of the buffer, or trailing bytes left over after every
 * expected entry has been read — is treated as tampering or a broken
 * parser and fails closed (EXTRACTION_FAILED), never partially accepted.
 */
function parsePngExport(buffer: Buffer, expectedCount: number): (Buffer | null)[] {
  const results: (Buffer | null)[] = [];
  let offset = 0;
  let totalBytes = 0;
  for (let i = 0; i < expectedCount; i += 1) {
    const newline = buffer.indexOf(0x0a, offset);
    if (newline === -1) throw new PdfImagesError('EXTRACTION_FAILED');
    const sizeText = buffer.subarray(offset, newline).toString('ascii').trim();
    offset = newline + 1;
    if (!/^-?\d+$/.test(sizeText)) throw new PdfImagesError('EXTRACTION_FAILED');
    const size = Number(sizeText);
    if (size === -1) { results.push(null); continue; }
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES) throw new PdfImagesError('IMAGE_LIMIT');
    if (offset + size > buffer.length) throw new PdfImagesError('EXTRACTION_FAILED');
    totalBytes += size;
    if (totalBytes > MAX_TOTAL_OUTPUT_BYTES) throw new PdfImagesError('IMAGE_LIMIT');
    results.push(buffer.subarray(offset, offset + size));
    offset += size;
  }
  if (offset !== buffer.length) throw new PdfImagesError('EXTRACTION_FAILED');
  return results;
}

/**
 * Parses the decode driver's own, much simpler framed protocol: one
 * "width height length\n" header line, followed by exactly length raw JPEG
 * bytes, nothing else. Any deviation fails closed the same way as
 * parsePngExport, for the same reason (tampering and a broken/compromised
 * decode process must look identical to Node: a rejection, never a partial
 * or best-effort result).
 */
function parseDecodeExport(buffer: Buffer): { width: number; height: number; data: Buffer } {
  const newline = buffer.indexOf(0x0a);
  if (newline === -1) throw new PdfImagesError('EXTRACTION_FAILED');
  const header = buffer.subarray(0, newline).toString('ascii').trim();
  const match = /^(\d+) (\d+) (\d+)$/.exec(header);
  if (!match) throw new PdfImagesError('EXTRACTION_FAILED');
  const width = Number(match[1]);
  const height = Number(match[2]);
  const length = Number(match[3]);
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_FILE_BYTES) throw new PdfImagesError('IMAGE_LIMIT');
  const data = buffer.subarray(newline + 1);
  if (data.length !== length) throw new PdfImagesError('EXTRACTION_FAILED');
  return { width, height, data };
}

function parseList(stdout: string): ListedImage[] {
  const rows = stdout.split(/\r?\n/).slice(2).filter(line => line.trim());
  const images: ListedImage[] = [];
  let pixels = 0;
  for (const row of rows) {
    const fields = row.trim().split(/\s+/);
    const page = Number(fields[0]); const index = Number(fields[1]);
    const type = fields[2]; const width = Number(fields[3]); const height = Number(fields[4]);
    if (fields.length < 5 || !Number.isSafeInteger(page) || !Number.isSafeInteger(index) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || page < 1 || page > MAX_PAGES || index < 0 || width < 1 || height < 1) throw new PdfImagesError('EXTRACTION_FAILED');
    if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS_PER_IMAGE) throw new PdfImagesError('IMAGE_LIMIT');
    pixels += width * height;
    if (pixels > MAX_TOTAL_PIXELS || images.length >= MAX_IMAGES) throw new PdfImagesError('IMAGE_LIMIT');
    images.push({ page, index, type, width, height });
  }
  return images;
}

let activeExtractions = 0;
/** Throws CONCURRENCY_LIMIT instead of queueing: an unbounded queue of held PDF buffers is its own resource risk. Callers should retry later. */
function acquireExtractionSlot(): () => void {
  if (activeExtractions >= MAX_CONCURRENT_EXTRACTIONS) throw new PdfImagesError('CONCURRENCY_LIMIT');
  activeExtractions += 1;
  let released = false;
  return () => { if (!released) { released = true; activeExtractions -= 1; } };
}

let activeDecodes = 0;
/** Same shape as acquireExtractionSlot, but a separate pool: see MAX_CONCURRENT_DECODES. */
function acquireDecodeSlot(): () => void {
  if (activeDecodes >= MAX_CONCURRENT_DECODES) throw new PdfImagesError('CONCURRENCY_LIMIT');
  activeDecodes += 1;
  let released = false;
  return () => { if (!released) { released = true; activeDecodes -= 1; } };
}

/**
 * Filesystem and network isolation, plus privilege drop, common to every
 * sandboxed step below. Only /usr (plus /proc, /dev) is visible by
 * default: bwrap starts every invocation from an EMPTY root, so a
 * configured parser binary (or, for decoding, the Node runtime and the
 * decode driver script) living outside /usr — the real-world case for most
 * operator setups and for this host's nvm-managed Node, and the only way
 * tests can supply a throwaway fake parser or driver — is otherwise
 * unresolvable (execve fails inside bwrap). Bind only each required file,
 * never its containing directory: a compromised parser must not gain read
 * access to unrelated configuration or secrets alongside the binary.
 * Required runtime dependency directories are bound exactly as specified.
 */

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Proves, on every call, that THIS exact sandbox configuration still works
 * on this host — never cached as a one-time check, because the kernel or
 * AppArmor policy backing unprivileged user namespaces (what bwrap needs)
 * can change without this process restarting. If this fails for any
 * reason, the environment does not provide the isolation this module
 * requires: callers must stay disabled and surface SANDBOX_UNAVAILABLE,
 * never fall back to running the parser unsandboxed.
 */
async function assertSandboxAvailable(bwrapPath: string, limiterPath: string): Promise<void> {
  try { await Promise.all([access(bwrapPath, constants.X_OK), access(limiterPath, constants.X_OK)]); }
  catch { throw new PdfImagesError('SANDBOX_UNAVAILABLE'); }
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(bwrapPath, [...sandboxArgs(), '--', '/usr/bin/true'], { timeout: 5000, killSignal: 'SIGKILL', env: subprocessEnv() }, (error) => (error ? reject(error) : resolve()));
    });
  } catch { throw new PdfImagesError('SANDBOX_UNAVAILABLE'); }
}

/**
 * Proves, on every call — same reasoning and the same never-cached
 * discipline as assertSandboxAvailable — that this host can give the
 * decode process a REAL, kernel-enforced ceiling on resident memory, not
 * just the much larger, startup-driven virtual-address-space bound prlimit
 * --as provides (see the constants above for why --as alone cannot do
 * this: RLIMIT_RSS is not enforced on this kernel, and V8 itself needs
 * gigabytes of address space just to start regardless of real usage).
 * systemd-run --user --scope -p MemoryMax=… is the mechanism used: it maps
 * to a real cgroup v2 memory.max, verified manually to actually kill a
 * process that exceeds it (not merely accepted as a syntactically valid
 * option). Whether this succeeds depends on things this process cannot
 * assume in general — an active (lingering or session-backed) systemd user
 * session for whoever runs it, and, for a process started by a SYSTEM
 * systemd unit rather than an interactive login, that unit explicitly
 * enabling cgroup delegation (`Delegate=yes`) so its own, unprivileged user
 * can create and configure a nested cgroup scope at all. Production here
 * runs as the system unit overtrip-api.service; this check tells it
 * directly, by actually trying, whether that currently works — it is never
 * assumed from this dev worktree. If it fails for ANY reason, the decode
 * sandbox must not run with a weaker, undemonstrated bound presented as
 * equivalent: callers must stay disabled and surface
 * MEMORY_ISOLATION_UNAVAILABLE.
 */
async function assertMemoryIsolationAvailable(systemdRunPath: string): Promise<void> {
  try { await access(systemdRunPath, constants.X_OK); }
  catch { throw new PdfImagesError('MEMORY_ISOLATION_UNAVAILABLE'); }
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(systemdRunPath, ['--user', '--scope', '--quiet', '--collect', '-p', `MemoryMax=${DECODE_MEMORY_MAX_BYTES}`, '--', '/usr/bin/true'], { timeout: 5000, killSignal: 'SIGKILL', env: subprocessEnv() }, (error) => (error ? reject(error) : resolve()));
    });
  } catch { throw new PdfImagesError('MEMORY_ISOLATION_UNAVAILABLE'); }
}

/**
 * The decode driver's full source, materialized to a real file once per
 * process (see decodeDriverPath) and run as its own sandboxed OS process —
 * never imported into this one. It is deliberately tiny, dependency-free
 * beyond sharp itself, and fixed: nothing about its own behaviour is
 * influenced by the untrusted bytes it decodes beyond what sharp does with
 * them. Protocol: argv carries the already-validated numeric bounds
 * (nothing here re-derives them from anything attacker-controlled); stdin
 * is the untrusted PNG bytes in full; on success, stdout is exactly one
 * "width height length\n" line followed by length raw JPEG bytes, nothing
 * else, and the process exits 0. On ANY failure — decode error, a
 * width/height mismatch against what the caller declared as expected, or
 * output over the given byte limit — it writes NOTHING to stdout and exits
 * non-zero; the caller (decodeCandidateSandboxed) treats a non-zero exit,
 * a timeout, or any malformed framing identically: EXTRACTION_FAILED.
 */
const DECODE_DRIVER_SOURCE = `'use strict';
const sharp = require(process.argv[6]);
const limitPixels = Number(process.argv[2]);
const expectedWidth = Number(process.argv[3]);
const expectedHeight = Number(process.argv[4]);
const maxOutputBytes = Number(process.argv[5]);
if (![limitPixels, expectedWidth, expectedHeight, maxOutputBytes].every(Number.isFinite)) process.exit(1);

const chunks = [];
process.stdin.on('error', () => process.exit(1));
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  const input = Buffer.concat(chunks);
  const image = sharp(input, { limitInputPixels: limitPixels, failOn: 'error' });
  image.metadata()
    .then((metadata) => {
      if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) { process.exit(2); return undefined; }
      return image.rotate().jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
    })
    .then((result) => {
      if (!result) return;
      if (result.data.length > maxOutputBytes) { process.exit(3); return; }
      const header = Buffer.from(result.info.width + ' ' + result.info.height + ' ' + result.data.length + '\\n', 'ascii');
      process.stdout.write(Buffer.concat([header, result.data]), () => process.exit(0));
    })
    .catch(() => process.exit(1));
});
`;

// The installed application can be read-only (ProtectSystem=strict). Create
// only this fixed, non-sensitive driver in a unique temp directory, reachable
// by the sandbox's remapped UID and never writable by it. Sharp is resolved by
// explicit read-only package path, not relative to the temporary script.
async function createDecodeDriver(source = DECODE_DRIVER_SOURCE): Promise<{ directory: string; driver: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), 'overtrip-pdf-decode-'));
  try {
    await chmod(directory, 0o755);
    const driver = path.join(directory, 'driver.cjs');
    await writeFile(driver, source, { mode: 0o644, flag: 'wx' });
    return { directory, driver };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Resolves the exact, explicit read-only paths the decode sandbox needs to
 * run sharp at all: the real Node binary actually running this process
 * (resolved through its symlink — on this host it is nvm-managed, under
 * the user's home directory, not under /usr the way every other trusted
 * binary this module runs is) and the project's own installed copies of
 * sharp and its runtime dependencies (sharp's own package.json
 * dependencies, plus the @img/* platform-specific native binaries sharp
 * loads dynamically by package name, never listed as a plain dependency —
 * the whole @img directory is bound instead of guessing platform-specific
 * package names). Computed from this module's own __dirname rather than
 * any assumption about CWD or deployment layout: both in dev (src/services)
 * and production (dist/services) it sits exactly two directories below the
 * project root, which is always the direct parent of node_modules.
 */
async function resolveDecodeRuntimePaths(): Promise<{ nodeBin: string; dependencyDirs: string[] }> {
  let nodeBin: string;
  try { nodeBin = await realpath(process.execPath); }
  catch { throw new PdfImagesError('MEMORY_ISOLATION_UNAVAILABLE'); }
  const projectRoot = path.join(__dirname, '..', '..');
  const nodeModulesDir = path.join(projectRoot, 'node_modules');
  const dependencyDirs = [
    path.join(nodeModulesDir, 'sharp'),
    path.join(nodeModulesDir, '@img'),
    path.join(nodeModulesDir, 'detect-libc'),
    path.join(nodeModulesDir, 'semver'),
  ];
  try { await Promise.all(dependencyDirs.map((dir) => access(dir, constants.R_OK))); }
  catch { throw new PdfImagesError('MEMORY_ISOLATION_UNAVAILABLE'); }
  return { nodeBin, dependencyDirs };
}

/**
 * Decodes and re-encodes ONE embedded image, entirely inside its own OS
 * process — sharp/libvips never runs in this main Node process. See the
 * "decode phase" comment on extractEmbeddedImages for the overall
 * reasoning; this function is the mechanics.
 *
 * Wrapping, outermost first: systemd-run --scope gives a real cgroup
 * memory.max (DECODE_MEMORY_MAX_BYTES), verified available by
 * assertMemoryIsolationAvailable on every call; bwrap gives the same
 * mount/network/pid/ipc/uts/cgroup-namespace isolation, capability drop
 * and uid remap as the parser sandbox, with read-only binds for exactly
 * the Node runtime and sharp dependency paths resolveDecodeRuntimePaths
 * computed — nothing else is visible, and nothing writable is ever bound;
 * prlimit bounds address space and CPU time as a secondary backstop.
 * Verified manually (see tests) that systemd-run --scope execs directly
 * into bwrap (no separate supervisor process to kill independently), so
 * execFile's own timeout, sending SIGKILL to that one PID, reaches bwrap
 * itself — which tears down its entire private pid namespace, including
 * any descendant the decode process might fork, exactly as for the parser.
 * The untrusted bytes are never written to any path the sandboxed process
 * could reach: they arrive on its stdin, and the result leaves only via
 * its stdout (parseDecodeExport below), bounded by maxBuffer independently
 * of the cgroup memory cap — the same defense-in-depth pairing already
 * used for the parser's own export phase.
 */
export async function decodeCandidateSandboxed(
  pngBytes: Buffer, expectedWidth: number, expectedHeight: number,
  // driverPath exists so tests can substitute an adversarial driver (one
  // that forks a background process, for instance) without touching sharp
  // or any real decode logic; maxOutputBytes exists so tests can shrink the
  // output cap to prove the IMAGE_LIMIT path deterministically, without
  // needing a genuinely multi-megabyte re-encoded image. Production callers
  // should never pass either.
  sandbox: { bwrapPath: string; limiterPath: string; systemdRunPath: string; timeoutMs: number; driverPath?: string; maxOutputBytes?: number },
): Promise<{ width: number; height: number; data: Buffer }> {
  const release = acquireDecodeSlot();
  let driverDirectory: string | undefined;
  try {
    await assertMemoryIsolationAvailable(sandbox.systemdRunPath);
    const temporaryDriver = sandbox.driverPath ? undefined : await createDecodeDriver();
    driverDirectory = temporaryDriver?.directory;
    const driver = sandbox.driverPath ?? temporaryDriver!.driver;
    const { nodeBin, dependencyDirs } = await resolveDecodeRuntimePaths();
    const maxOutputBytes = sandbox.maxOutputBytes ?? MAX_FILE_BYTES + 1024;
    const output = await executeWithStdin(sandbox.systemdRunPath, [
      '--user', '--scope', '--quiet', '--collect', '-p', `MemoryMax=${DECODE_MEMORY_MAX_BYTES}`,
      '--',
      sandbox.bwrapPath,
      ...sandboxArgs([nodeBin, driver], dependencyDirs),
      '--size', '1048576', '--tmpfs', '/work', '--chdir', '/work',
      '--',
      sandbox.limiterPath, `--as=${DECODE_ADDRESS_SPACE_BYTES}`, `--cpu=${DECODE_CPU_SECONDS}`, '--',
      nodeBin, driver, String(MAX_PIXELS_PER_IMAGE), String(expectedWidth), String(expectedHeight), String(maxOutputBytes), dependencyDirs[0],
    ], pngBytes, sandbox.timeoutMs, maxOutputBytes + 1024);
    return parseDecodeExport(output);
  } catch (error) {
    if (error instanceof PdfImagesError) throw error;
    throw new PdfImagesError('EXTRACTION_FAILED');
  } finally {
    try {
      if (driverDirectory) await rm(driverDirectory, { recursive: true, force: true });
    } finally {
      release();
    }
  }
}

// Generate every stored derivative in the sandbox as well: a compromised
// decoder's stdout is untrusted and must NEVER be passed to Sharp in the API.
// The parent validates framing, dimensions, sizes, and output signatures before
// writing bytes; it does not parse image data in the privileged process.
const VARIANT_DRIVER_SOURCE = `'use strict';
const sharp = require(process.argv[6]);
const limit = Number(process.argv[2]);
const expectedWidth = Number(process.argv[3]);
const expectedHeight = Number(process.argv[4]);
const maxBytes = Number(process.argv[5]);
const chunks = [];
process.stdin.on('error', () => process.exit(1));
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', async () => {
  try {
    const input = Buffer.concat(chunks);
    const image = sharp(input, { limitInputPixels: limit, failOn: 'error', animated: false });
    const meta = await image.metadata();
    if (meta.width !== expectedWidth || meta.height !== expectedHeight) process.exit(2);
    const {data,info} = await image.rotate().resize({width:2560,height:2560,fit:'inside',withoutEnlargement:true}).toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
    const options = {raw:{width:info.width,height:info.height,channels:info.channels}};
    let alpha = false;
    if (info.channels === 4) for (let i=3;i<data.length;i+=4) if(data[i] !== 255){alpha=true;break;}
    const main = alpha ? await sharp(data,options).png({compressionLevel:9,palette:false}).toBuffer() : await sharp(data,options).removeAlpha().jpeg({quality:82,mozjpeg:true}).toBuffer();
    const variants = [];
    for (const width of [640,960,1280]) variants.push({width,data:(await sharp(data,options).resize({width,withoutEnlargement:true}).webp({quality:76}).toBuffer()).toString('base64')});
    const result = Buffer.from(JSON.stringify({width:info.width,height:info.height,ext:alpha?'png':'jpg',main:main.toString('base64'),variants}));
    if(result.length > maxBytes) process.exit(3);
    process.stdout.write(result, () => process.exit(0));
  } catch { process.exit(1); }
});
`;

export async function processPdfCandidateSandboxed(
  candidate: EmbeddedImageCandidate,
  sandbox: { bwrapPath?: string; limiterPath?: string; systemdRunPath?: string; timeoutMs?: number; maxOutputBytes?: number } = {},
): Promise<ProcessedImage> {
  const release = acquireDecodeSlot();
  let directory: string | undefined;
  try {
    if (!Buffer.isBuffer(candidate.data) || candidate.data.length > MAX_FILE_BYTES || candidate.width < 1 || candidate.height < 1 || candidate.width > MAX_DIMENSION || candidate.height > MAX_DIMENSION || candidate.width * candidate.height > MAX_PIXELS_PER_IMAGE) throw new PdfImagesError('IMAGE_LIMIT');
    const systemdRunPath = sandbox.systemdRunPath ?? '/usr/bin/systemd-run';
    await assertMemoryIsolationAvailable(systemdRunPath);
    const temp = await createDecodeDriver(VARIANT_DRIVER_SOURCE);
    directory = temp.directory;
    const { nodeBin, dependencyDirs } = await resolveDecodeRuntimePaths();
    const maxBytes = sandbox.maxOutputBytes ?? MAX_TOTAL_OUTPUT_BYTES;
    const output = await executeWithStdin(systemdRunPath, [
      '--user', '--scope', '--quiet', '--collect', '-p', `MemoryMax=${DECODE_MEMORY_MAX_BYTES}`,
      '--', sandbox.bwrapPath ?? '/usr/bin/bwrap', ...sandboxArgs([nodeBin, temp.driver], dependencyDirs),
      '--size', '1048576', '--tmpfs', '/work', '--chdir', '/work', '--',
      sandbox.limiterPath ?? '/usr/bin/prlimit', `--as=${DECODE_ADDRESS_SPACE_BYTES}`, `--cpu=${DECODE_CPU_SECONDS}`, '--',
      nodeBin, temp.driver, String(MAX_PIXELS_PER_IMAGE), String(candidate.width), String(candidate.height), String(maxBytes), dependencyDirs[0],
    ], candidate.data, sandbox.timeoutMs ?? DECODE_TIMEOUT_MS, maxBytes);
    let result: {width: unknown; height: unknown; ext: unknown; main: unknown; variants: unknown};
    try { result = JSON.parse(output.toString('utf8')); } catch { throw new PdfImagesError('EXTRACTION_FAILED'); }
    const scale = Math.min(1, 2560 / Math.max(candidate.width, candidate.height));
    const expectedWidth = Math.max(1, Math.round(candidate.width * scale));
    const expectedHeight = Math.max(1, Math.round(candidate.height * scale));
    if (!Number.isSafeInteger(result.width) || !Number.isSafeInteger(result.height) || result.width !== expectedWidth || result.height !== expectedHeight || (result.ext !== 'jpg' && result.ext !== 'png') || typeof result.main !== 'string' || !Array.isArray(result.variants) || result.variants.length !== 3) throw new PdfImagesError('EXTRACTION_FAILED');
    const decode = (value: unknown): Buffer => {
      if (typeof value !== 'string' || value.length > MAX_FILE_BYTES * 2 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new PdfImagesError('EXTRACTION_FAILED');
      const data = Buffer.from(value, 'base64');
      if (!data.length || data.length > MAX_FILE_BYTES) throw new PdfImagesError('IMAGE_LIMIT');
      return data;
    };
    const main = decode(result.main);
    const validMain = result.ext === 'jpg' ? main.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])) : main.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    if (!validMain) throw new PdfImagesError('EXTRACTION_FAILED');
    const variants = result.variants.map((item: unknown, i: number) => {
      if (!item || typeof item !== 'object') throw new PdfImagesError('EXTRACTION_FAILED');
      const row = item as {width?: unknown; data?: unknown};
      const width = [640,960,1280][i];
      if (row.width !== width) throw new PdfImagesError('EXTRACTION_FAILED');
      const buffer = decode(row.data);
      if (buffer.toString('ascii',0,4) !== 'RIFF' || buffer.toString('ascii',8,12) !== 'WEBP') throw new PdfImagesError('EXTRACTION_FAILED');
      return {width,buffer};
    });
    return { ext: result.ext, mimeType: result.ext === 'jpg' ? 'image/jpeg' : 'image/png', width: expectedWidth, height: expectedHeight, main, variants };
  } catch (error) {
    if (error instanceof PdfImagesError) throw error;
    throw new PdfImagesError('EXTRACTION_FAILED');
  } finally {
    try { if (directory) await rm(directory, { recursive: true, force: true }); } finally { release(); }
  }
}

/**
 * Extract private, untrusted candidates from an already scanned CLEAN PDF.
 * This does not establish authorization, persist media, or publish images.
 * Callers must revalidate tenant and document before exposing/importing results.
 * Work is limited to the first 30 pages.
 *
 * Isolation (bwrap + prlimit, both required — see assertSandboxAvailable):
 * every step that touches the untrusted PDF runs inside a fresh mount,
 * network, pid, ipc and uts namespace, with every Linux capability dropped
 * and the process remapped to uid/gid 65534; the parser sees only its own
 * read-only input file and (for image extraction) a size-capped tmpfs that
 * the kernel itself refuses to overfill while the parser is still running.
 * No real, host-backed, writable directory is ever bound into any
 * invocation the parser runs in: results leave only via this process's own
 * stdout (see the "export phase" comment below), never a filesystem path
 * a compromised parser could write to directly.
 * prlimit additionally bounds address space, CPU time and per-file size;
 * TIMEOUT_MS bounds wall-clock time with SIGKILL. A bounded number of
 * extractions may run at once (MAX_CONCURRENT_EXTRACTIONS); beyond that,
 * this throws CONCURRENCY_LIMIT rather than queueing or running unbounded.
 * If the sandbox itself cannot be set up on this host, this throws
 * SANDBOX_UNAVAILABLE and never runs the parser unsandboxed.
 *
 * Decode phase (sharp/libvips, run as its own sandboxed OS process — see
 * decodeCandidateSandboxed): an earlier version of this module ran sharp in
 * this main Node process, decoding bytes the untrusted parser had produced,
 * with only a JS-level Promise.race as a "timeout" — an independent review
 * correctly rejected that as insufficient: a Promise race rejects the
 * API-level wait, but cannot reclaim or stop whatever native CPU/memory
 * libvips is still using underneath, and a vulnerability in
 * libvips/libjpeg/libpng itself, triggered by decoding a validly-shaped but
 * hostile image, ran with the full privileges of the API process. Decoding
 * now runs the exact same way the parser does: its own bwrap sandbox (mount,
 * network, pid, ipc, uts, capability drop, uid remap), its own prlimit, and
 * — because prlimit --as cannot give Node/V8 a meaningful ceiling (see the
 * constants above) — its own cgroup memory.max via systemd-run, verified
 * actually enforced on every call by assertMemoryIsolationAvailable. A
 * decode timeout now SIGKILLs that whole sandboxed process tree, verified
 * manually (see tests) for both a normal return and a timeout, including a
 * forked descendant that tries to outlive the main decode process either
 * way. If the memory-isolation mechanism is not available on this host —
 * which this module checks live, every call, never assumed — decoding (and
 * therefore the whole extraction) throws MEMORY_ISOLATION_UNAVAILABLE and
 * never falls back to decoding unsandboxed, in this process, as a silent
 * downgrade presented as equivalent protection.
 */
export async function extractEmbeddedImages(
  pdf: Buffer, parserPath: string,
  // bwrapPath/limiterPath/systemdRunPath/timeoutMs/tmpfsBytes exist so tests
  // can prove the sandbox-unavailable, timeout and live-quota failure paths
  // deterministically and quickly; production callers should never need to
  // pass any of these.
  sandbox: { bwrapPath?: string; limiterPath?: string; systemdRunPath?: string; timeoutMs?: number; tmpfsBytes?: number; decodeTimeoutMs?: number } = {},
): Promise<EmbeddedImageCandidate[]> {
  if (!Buffer.isBuffer(pdf) || pdf.length < 5 || pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') throw new PdfImagesError('INVALID_PDF');
  if (!path.isAbsolute(parserPath)) throw new PdfImagesError('PARSER_UNAVAILABLE');
  const bwrapPath = sandbox.bwrapPath ?? '/usr/bin/bwrap';
  const limiterPath = sandbox.limiterPath ?? '/usr/bin/prlimit';
  const systemdRunPath = sandbox.systemdRunPath ?? '/usr/bin/systemd-run';
  const timeoutMs = sandbox.timeoutMs ?? TIMEOUT_MS;
  const decodeTimeoutMs = sandbox.decodeTimeoutMs ?? DECODE_TIMEOUT_MS;
  const tmpfsBytes = sandbox.tmpfsBytes ?? SANDBOX_TMPFS_BYTES;

  const release = acquireExtractionSlot();
  try {
    try { await access(parserPath, constants.X_OK); } catch { throw new PdfImagesError('PARSER_UNAVAILABLE'); }
    await assertSandboxAvailable(bwrapPath, limiterPath);
    await assertMemoryIsolationAvailable(systemdRunPath);

    const dir = await mkdtemp(path.join(tmpdir(), 'overtrip-pdf-images-'));
    try {
      await chmod(dir, 0o700);
      const input = path.join(dir, 'input.pdf');
      await writeFile(input, pdf, { mode: 0o600, flag: 'wx' });

      const prlimited = [limiterPath, `--as=${MAX_ADDRESS_SPACE_BYTES}`, `--cpu=${MAX_CPU_SECONDS}`, `--fsize=${MAX_FILE_BYTES}`, '--'];
      const list = await execute(bwrapPath, [
        ...sandboxArgs([parserPath]), '--ro-bind', input, '/input.pdf',
        '--', ...prlimited, parserPath, '-f', '1', '-l', String(MAX_PAGES), '-list', '/input.pdf',
      ], timeoutMs);
      const images = parseList(list);
      if (!images.length) return [];
      // Mask and smask entries are not photographs and must not become
      // candidates; never requested back from the sandbox below, so a
      // hostile parser gains nothing by producing extra ones beyond what
      // parseList's own MAX_IMAGES bound already allows.
      const imageEntries = images.filter((image) => image.type === 'image');

      // Export phase. Extraction still writes only into /work (the sized
      // tmpfs): the kernel enforces SANDBOX_TMPFS_BYTES live, during this
      // call, across every file the parser produces together — the same
      // live aggregate quota as before. What changed is how bytes leave
      // the sandbox: a prior review found that binding a REAL, host-backed,
      // writable directory (`/output`) into this SAME sandbox invocation
      // let a parser compromised by a crafted PDF — arbitrary code
      // execution inside its own process, or any child it forks — write
      // directly to that real directory, bypassing the tmpfs quota
      // entirely (nothing capped how much it could write there). This
      // sandbox invocation now binds NO writable host path at all: the
      // parser's own stdout is redirected to /dev/null (so it cannot
      // inject anything into the protocol below), and the ONLY way bytes
      // leave is this same script reading each file back by its OWN exact
      // expected name (never a glob — a hostile parser cannot plant extra
      // files that get read) and streaming it over this process's stdout,
      // a pipe Node already owns and bounds (maxPngOutputBytes below) —
      // never a filesystem path a sandboxed process could write to. A
      // symlink at an expected name is rejected (`-L`), matching the same
      // defense previously applied via stat() on the host side. `set -e`
      // still means any failure in the parser's own invocation — including
      // a write erroring out mid-page once the tmpfs is full — aborts the
      // script before the export loop runs at all.
      const exportLines = imageEntries.map((image) => {
        const file = `/work/image-${String(image.index).padStart(3, '0')}.png`;
        const quoted = shQuote(file);
        return `if [ -f ${quoted} ] && [ ! -L ${quoted} ]; then wc -c < ${quoted}; cat ${quoted}; else echo -1; fi`;
      }).join('\n');
      // Reap phase. A compromised parser can fork a background process and
      // exit itself before that process is done: `set -e` only observes the
      // PARSER's own exit status, so the script above would otherwise move
      // straight on to exportLines while that orphan is still alive and
      // able to race the trusted wc/cat reads below it (verified manually:
      // without this loop, an orphan writing in a tight loop reliably wins
      // that race and is read back instead of the legitimate file). Once
      // the parser's own foreground invocation returns, this namespace's
      // own PID 1 (bwrap's reaper, from --unshare-all) has already
      // inherited any such orphan; we only need to kill everything but
      // ourselves and PID 1, then re-check /proc, until nothing else is
      // left. SIGKILL cannot be blocked or deferred by the target, so this
      // converges quickly in practice — verified manually against a
      // tight-write-loop adversarial process. It is bounded, not a proof of
      // zero window at the instruction level: TIMEOUT_MS's outer SIGKILL on
      // the whole invocation remains the fail-closed backstop if this loop
      // itself were ever starved, and the per-image width/height check
      // against the EARLIER, separate -list invocation (enforced again,
      // independently, inside the sandboxed decode process below) rejects
      // anything a surviving race could still substitute that doesn't also
      // match the originally declared dimensions.
      const reapOtherProcesses = [
        'i=0',
        'while [ "$i" -lt 250 ]; do',
        '  other=0',
        '  for entry in /proc/[0-9]*; do',
        '    pid=${entry#/proc/}',
        '    case "$pid" in (*[!0-9]*) continue ;; esac',
        '    if [ "$pid" != "$$" ] && [ "$pid" != "1" ]; then other=1; kill -KILL "$pid" 2>/dev/null; fi',
        '  done',
        '  [ "$other" -eq 0 ] && break',
        '  i=$((i+1))',
        '  sleep 0.01',
        'done',
      ].join('\n');
      const pngScript = [
        'set -e',
        `${shQuote(limiterPath)} --as=${MAX_ADDRESS_SPACE_BYTES} --cpu=${MAX_CPU_SECONDS} --fsize=${MAX_FILE_BYTES} -- ${shQuote(parserPath)} -f 1 -l ${MAX_PAGES} -png /input.pdf /work/image >/dev/null`,
        reapOtherProcesses,
        exportLines,
      ].join('\n');
      // Framing overhead only (a short decimal line per expected file):
      // legitimate output within MAX_TOTAL_OUTPUT_BYTES always fits well
      // under this. A hostile parser trying to flood stdout past it is
      // killed by execFile itself (maxBuffer), fail-closed, before Node
      // ever parses a single byte of it.
      const maxPngOutputBytes = MAX_TOTAL_OUTPUT_BYTES + 64 * 1024;
      const pngOutput = await executeBuffer(bwrapPath, [
        ...sandboxArgs([parserPath]), '--ro-bind', input, '/input.pdf',
        '--size', String(tmpfsBytes), '--tmpfs', '/work', '--chdir', '/work',
        '--', '/usr/bin/sh', '-c', pngScript,
      ], timeoutMs, maxPngOutputBytes);
      const files = parsePngExport(pngOutput, imageEntries.length);

      const candidates: EmbeddedImageCandidate[] = [];
      for (let i = 0; i < imageEntries.length; i += 1) {
        const bytes = files[i];
        if (!bytes) throw new PdfImagesError('EXTRACTION_FAILED');
        const entry = imageEntries[i];
        const decoded = await decodeCandidateSandboxed(bytes, entry.width, entry.height, { bwrapPath, limiterPath, systemdRunPath, timeoutMs: decodeTimeoutMs });
        if (decoded.data.length > MAX_FILE_BYTES) throw new PdfImagesError('IMAGE_LIMIT');
        candidates.push({ page: entry.page, width: decoded.width, height: decoded.height, mimeType: 'image/jpeg', data: decoded.data });
      }
      return candidates;
    } catch (error) {
      if (error instanceof PdfImagesError) throw error;
      throw new PdfImagesError('EXTRACTION_FAILED');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } finally {
    release();
  }
}
