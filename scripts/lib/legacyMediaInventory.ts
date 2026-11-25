import { constants } from 'node:fs';
import { open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { FileMissingError, readRegularFileIntegrity, SymlinkRejectedError } from './safeFileRead.js';

/** Only this class carries messages safe to expose in command output. */
export class InventoryError extends Error {}

const MAIN_FILE_PATTERN = /^([0-9a-f]{32})\.(?:jpg|png)$/;
/** Variante legada órfã: mesmo storageKey do arquivo principal, mas revisada e aprovada à parte — nunca por herança da aprovação do principal. */
const VARIANT_FILE_PATTERN = /^([0-9a-f]{32})-w(?:640|960|1280)\.webp$/;
const ALLOWLIST_FILENAME = '.legacy-media-allowlist.json';

export interface LegacyMediaCandidate {
  storageKey: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
}

/** O nome do arquivo tem que ser exatamente storageKey + extensão principal OU storageKey + sufixo de variante — nunca ../, nunca outro storageKey, nunca fora desses dois padrões. */
function filenameMatchesStorageKey(storageKey: string, filename: string): boolean {
  if (filename.includes('/') || filename.includes('\\')) return false;
  const match = MAIN_FILE_PATTERN.exec(filename) ?? VARIANT_FILE_PATTERN.exec(filename);
  return Boolean(match) && match![1] === storageKey;
}

export interface InventoryResult {
  totalFiles: number;
  registered: string[];
  /** Órfãos legíveis como arquivo normal (principal OU variante): candidatos a allowlist, nunca aprovados aqui. */
  candidates: LegacyMediaCandidate[];
  /** Órfãos recusados por serem (ou terem virado) link simbólico: nunca candidatos. */
  rejectedSymlinks: string[];
}

/**
 * Lista, sem alterar nada, quais arquivos (principal OU variante WebP) na
 * pasta de uploads não têm um MediaAsset correspondente (pelo storageKey) —
 * candidatos a uma allowlist de mídia legada (arquivos anteriores ao
 * MediaAsset). Uma variante só é candidata quando o storageKey inteiro é
 * legado (sem registro algum); se o storageKey tem MediaAsset, principal e
 * variantes já são servidos pelo registro normal, nunca por aqui. Isto é só a
 * simulação: não promove nada, e nunca aprova uma variante por aprovar o
 * principal (ou vice-versa) — cada arquivo é seu próprio candidato, com seu
 * próprio hash, revisado e aprovado à parte (ver applyLegacyMediaManifest).
 */
export async function inventoryLegacyMedia(prisma: Pick<PrismaClient, 'mediaAsset'>, uploadsDirectory: string): Promise<InventoryResult> {
  const entries = await readdir(uploadsDirectory);
  const files = entries
    .map((name) => ({ name, storageKey: MAIN_FILE_PATTERN.exec(name)?.[1] ?? VARIANT_FILE_PATTERN.exec(name)?.[1] }))
    .filter((entry): entry is { name: string; storageKey: string } => Boolean(entry.storageKey));
  if (files.length === 0) return { totalFiles: 0, registered: [], candidates: [], rejectedSymlinks: [] };

  const found = await prisma.mediaAsset.findMany({ where: { storageKey: { in: files.map((f) => f.storageKey) } }, select: { storageKey: true } });
  const registered = new Set(found.map((row) => row.storageKey));
  const orphans = files.filter((f) => !registered.has(f.storageKey));

  const candidates: LegacyMediaCandidate[] = [];
  const rejectedSymlinks: string[] = [];
  for (const orphan of orphans) {
    try {
      const { sizeBytes, sha256 } = await readRegularFileIntegrity(path.join(uploadsDirectory, orphan.name));
      candidates.push({ storageKey: orphan.storageKey, filename: orphan.name, sizeBytes, sha256 });
    } catch (error) {
      if (error instanceof SymlinkRejectedError) rejectedSymlinks.push(orphan.name);
      else if (!(error instanceof FileMissingError)) throw error; // removido entre o readdir e agora: ignora, não é candidato
    }
  }
  return { totalFiles: files.length, registered: [...registered], candidates, rejectedSymlinks };
}

export interface DatabaseFingerprint { dev: number; ino: number }

/**
 * Identidade real do arquivo do banco (device + inode), não só o caminho.
 * Detecta troca do SQLite pelo mesmo caminho (restauração de outro backup,
 * recriação do arquivo) entre a proposta e a aplicação — o caminho sozinho
 * não muda nesse caso, mas o inode muda sempre.
 */
export async function computeDatabaseFingerprint(databasePath: string): Promise<DatabaseFingerprint> {
  const info = await stat(databasePath);
  return { dev: info.dev, ino: info.ino };
}

export interface LegacyMediaManifest {
  generatedAt: string;
  /** Caminho real (realpath) do banco e da pasta de uploads no momento da proposta — comparado ao que for informado na aplicação, mas nunca como única prova de identidade do banco (ver databaseFingerprint). */
  database: string;
  databaseFingerprint: DatabaseFingerprint;
  uploadsDir: string;
  candidates: LegacyMediaCandidate[];
}

/** Grava o manifesto para revisão humana. Nunca toca na allowlist. */
export async function writeLegacyMediaManifest(manifestPath: string, manifest: LegacyMediaManifest): Promise<void> {
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o640 });
}

function isValidCandidateShape(c: unknown): c is LegacyMediaCandidate {
  return Boolean(c) && typeof c === 'object'
    && typeof (c as LegacyMediaCandidate).storageKey === 'string' && /^[0-9a-f]{32}$/.test((c as LegacyMediaCandidate).storageKey)
    && typeof (c as LegacyMediaCandidate).filename === 'string'
    && typeof (c as LegacyMediaCandidate).sizeBytes === 'number'
    && typeof (c as LegacyMediaCandidate).sha256 === 'string' && /^[0-9a-f]{64}$/.test((c as LegacyMediaCandidate).sha256);
}

export async function readLegacyMediaManifest(manifestPath: string): Promise<LegacyMediaManifest> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf8');
  } catch {
    throw new InventoryError('Não foi possível ler o manifesto indicado.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InventoryError('O manifesto não é um JSON válido.');
  }
  const m = parsed as Partial<LegacyMediaManifest> | null;
  if (!m || typeof m.database !== 'string' || typeof m.uploadsDir !== 'string' || !Array.isArray(m.candidates)
    || !m.databaseFingerprint || typeof m.databaseFingerprint.dev !== 'number' || typeof m.databaseFingerprint.ino !== 'number') {
    throw new InventoryError('O manifesto está malformado (faltam database, databaseFingerprint, uploadsDir ou candidates).');
  }
  if (!m.candidates.every(isValidCandidateShape)) {
    throw new InventoryError('O manifesto contém candidatos malformados.');
  }
  const candidates = m.candidates as LegacyMediaCandidate[];
  // Nome tem que corresponder exatamente ao storageKey declarado: nunca ../,
  // nunca um storageKey diferente do nome do arquivo. Um manifesto com
  // qualquer entrada assim é recusado por inteiro — não dá para confiar
  // parcialmente num manifesto que tenta mentir sobre o que é o quê.
  if (candidates.some((c) => !filenameMatchesStorageKey(c.storageKey, c.filename))) {
    throw new InventoryError('O manifesto contém um nome de arquivo que não corresponde ao storageKey declarado.');
  }
  // Nunca duplica NOME DE ARQUIVO (cada arquivo só pode ser revisado uma vez
  // por manifesto). Várias entradas podem legitimamente compartilhar o
  // mesmo storageKey: o principal e cada uma de suas variantes WebP órfãs
  // são candidatos independentes, cada um com seu próprio arquivo e hash.
  const filenames = candidates.map((c) => c.filename);
  if (new Set(filenames).size !== filenames.length) {
    throw new InventoryError('O manifesto contém nome de arquivo duplicado.');
  }
  return { generatedAt: String(m.generatedAt ?? ''), database: m.database, databaseFingerprint: m.databaseFingerprint, uploadsDir: m.uploadsDir, candidates };
}

export interface LegacyMediaAllowlistEntry { filename: string; sizeBytes: number; sha256: string }

async function loadAllowlistEntries(allowlistPath: string): Promise<LegacyMediaAllowlistEntry[]> {
  try {
    const raw = await readFile(allowlistPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const entries = parsed && typeof parsed === 'object' && Array.isArray((parsed as { entries?: unknown }).entries)
      ? (parsed as { entries: unknown[] }).entries
      : [];
    return entries.filter((e): e is LegacyMediaAllowlistEntry =>
      Boolean(e) && typeof e === 'object' && typeof (e as LegacyMediaAllowlistEntry).filename === 'string'
      && typeof (e as LegacyMediaAllowlistEntry).sizeBytes === 'number' && typeof (e as LegacyMediaAllowlistEntry).sha256 === 'string');
  } catch {
    return [];
  }
}

async function withAllowlistLock<T>(allowlistPath: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = `${allowlistPath}.lock`;
  let handle;
  try {
    handle = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new InventoryError('Outra escrita da allowlist está em andamento; tente de novo em seguida.');
    }
    throw error;
  }
  try {
    await handle.close();
    return await fn();
  } finally {
    await unlink(lockPath).catch(() => {});
  }
}

/**
 * Escreve a allowlist com a UNIÃO (por nome de arquivo exato) do que já
 * estava aprovado com o que esta chamada aprova agora — nunca substitui; uma
 * URL legada já aprovada antes continua servida mesmo que não apareça no
 * manifesto desta vez. A leitura-e-escrita toda acontece sob uma trava de
 * arquivo (recusa se outra escrita estiver em andamento, nunca tenta
 * mesclar sob risco de perder uma aprovação concorrente) e a escrita em si é
 * atômica (grava num arquivo temporário e troca com rename, nunca trunca o
 * arquivo final direto — uma queda no meio nunca deixa a allowlist com JSON
 * parcial).
 */
export async function writeLegacyMediaAllowlist(allowlistPath: string, entries: readonly LegacyMediaAllowlistEntry[]): Promise<void> {
  await withAllowlistLock(allowlistPath, async () => {
    const existing = await loadAllowlistEntries(allowlistPath);
    const merged = new Map(existing.map((e) => [e.filename, e] as const));
    for (const entry of entries) merged.set(entry.filename, entry);
    const body = JSON.stringify({
      generatedAt: new Date().toISOString(),
      entries: [...merged.values()].sort((a, b) => a.filename.localeCompare(b.filename)),
    }, null, 2);
    const tempPath = `${allowlistPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await writeFile(tempPath, body, { mode: 0o640 });
    await rename(tempPath, allowlistPath);
  });
}

export interface ManifestApplyRejection { storageKey: string; filename: string; reason: 'missing' | 'symlink' | 'content-changed' | 'now-registered' | 'invalid-filename'; }
export interface ManifestApplyResult { approved: string[]; rejected: ManifestApplyRejection[]; }

/**
 * Reverifica cada candidato do manifesto contra o estado ATUAL do disco e do
 * banco — nunca confia só no manifesto (pode estar desatualizado desde a
 * revisão) nem só numa nova varredura (promoveria qualquer coisa automaticamente,
 * o problema original). Só aprova o que bate exatamente nas duas pontas;
 * qualquer diferença, link simbólico, arquivo ausente, nome fora do padrão ou
 * storageKey hoje registrado por um envio real é recusado, nunca aplicado
 * parcialmente. A checagem de banco/pasta/identidade do arquivo do banco fica
 * aqui dentro (defesa em profundidade), não só na CLI que chama isto — nunca
 * aplica um manifesto gerado para outro lugar, mesmo que o chamador esqueça
 * de checar antes.
 */
export async function applyLegacyMediaManifest(
  prisma: Pick<PrismaClient, 'mediaAsset'>,
  manifest: LegacyMediaManifest,
  uploadsDirectory: string,
  databaseIdentifier: string,
  databaseFingerprint: DatabaseFingerprint,
  allowlistPath: string,
): Promise<ManifestApplyResult> {
  if (manifest.uploadsDir !== uploadsDirectory || manifest.database !== databaseIdentifier) {
    throw new InventoryError('O manifesto foi gerado para outro banco ou outra pasta de uploads; recusado.');
  }
  if (manifest.databaseFingerprint.dev !== databaseFingerprint.dev || manifest.databaseFingerprint.ino !== databaseFingerprint.ino) {
    throw new InventoryError('O arquivo do banco foi substituído (mesmo caminho, identidade diferente) desde a proposta; recusado.');
  }

  const approved: LegacyMediaCandidate[] = [];
  const rejected: ManifestApplyRejection[] = [];

  for (const candidate of manifest.candidates) {
    if (!filenameMatchesStorageKey(candidate.storageKey, candidate.filename)) {
      rejected.push({ storageKey: candidate.storageKey, filename: candidate.filename, reason: 'invalid-filename' });
      continue;
    }
    const nowRegistered = await prisma.mediaAsset.findUnique({ where: { storageKey: candidate.storageKey }, select: { id: true } });
    if (nowRegistered) { rejected.push({ storageKey: candidate.storageKey, filename: candidate.filename, reason: 'now-registered' }); continue; }

    try {
      const current = await readRegularFileIntegrity(path.join(uploadsDirectory, candidate.filename));
      if (current.sizeBytes !== candidate.sizeBytes || current.sha256 !== candidate.sha256) {
        rejected.push({ storageKey: candidate.storageKey, filename: candidate.filename, reason: 'content-changed' });
        continue;
      }
      approved.push(candidate);
    } catch (error) {
      if (error instanceof SymlinkRejectedError) rejected.push({ storageKey: candidate.storageKey, filename: candidate.filename, reason: 'symlink' });
      else if (error instanceof FileMissingError) rejected.push({ storageKey: candidate.storageKey, filename: candidate.filename, reason: 'missing' });
      else throw error;
    }
  }

  if (approved.length > 0) {
    await writeLegacyMediaAllowlist(allowlistPath, approved.map((c) => ({ filename: c.filename, sizeBytes: c.sizeBytes, sha256: c.sha256 })));
  }
  return { approved: approved.map((c) => c.storageKey), rejected };
}

export { ALLOWLIST_FILENAME };
