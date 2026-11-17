import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { FileMissingError, readRegularFileIntegrity, SymlinkRejectedError } from './safeFileRead.js';

/** Only this class carries messages safe to expose in command output. */
export class ReconciliationError extends Error {}

/** Nunca aceita um limite menor que isto: evita confundir um envio lento e legítimo com um abandonado. */
export const MIN_OLDER_THAN_MS = 15 * 60000;

interface FileIntegrityEntry { name: string; sizeBytes: number; sha256: string }

function parseFileIntegrity(raw: string | null): FileIntegrityEntry[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const entries = parsed.filter((e): e is FileIntegrityEntry =>
      Boolean(e) && typeof e === 'object' && typeof (e as FileIntegrityEntry).name === 'string'
      && typeof (e as FileIntegrityEntry).sizeBytes === 'number' && typeof (e as FileIntegrityEntry).sha256 === 'string');
    return entries.length === parsed.length ? entries : null;
  } catch {
    return null;
  }
}

export interface PendingCandidate {
  id: string; storageKey: string; mimeType: string; createdAt: Date; fileIntegrity: string | null;
}

/** Só leitura: acha pendentes mais antigos que olderThanMs. */
export async function findReconciliationCandidates(prisma: Pick<PrismaClient, 'mediaAsset'>, olderThanMs: number): Promise<PendingCandidate[]> {
  const cutoff = new Date(Date.now() - Math.max(olderThanMs, MIN_OLDER_THAN_MS));
  return prisma.mediaAsset.findMany({
    where: { publishedAt: null, createdAt: { lt: cutoff } },
    select: { id: true, storageKey: true, mimeType: true, createdAt: true, fileIntegrity: true },
  });
}

export type ReconciliationAction = 'ready-to-publish' | 'needs-review' | 'skip-suspicious' | 'skip-unverifiable';
export interface ReconciliationDecision { storageKey: string; action: ReconciliationAction; detail?: string; }

/**
 * Classifica (nunca aplica nada) UM candidato, só com base nos arquivos em
 * disco agora. A mera existência dos arquivos esperados nunca é tratada como
 * prova de que a gravação terminou antes de uma queda — cada arquivo é
 * relido e comparado por tamanho e hash contra o que foi gravado em
 * fileIntegrity ANTES da escrita.
 *
 * Esta função NUNCA toca em arquivo nem no banco, para NENHUMA classificação
 * — nem para publicar um pendente íntegro. Auditoria independente (segunda
 * rodada): a publicação automática anterior (via updateMany condicionado a
 * publishedAt null) é segura olhando só pela ótica da reconciliação, mas cria
 * uma corrida pelo lado da própria rota de upload — o próprio processo que
 * está gravando o pendente pode estar ativo por mais de MIN_OLDER_THAN_MS
 * (envio grande, disco lento) e, se a chamada que publica DEPOIS de gravar
 * os arquivos falhar (ex.: queda de conexão com o banco já depois de a
 * escrita ter sido efetivada do lado do servidor), o código de rollback do
 * upload (src/routes/mediaRoutes.ts) assumia ser o único escritor e apagava
 * arquivo e registro sem reconferir publishedAt — destruindo um ativo que a
 * reconciliação **tinha acabado de publicar** de verdade. Não existe hoje
 * uma reivindicação atômica que também bloqueie uma escrita (não só uma
 * publicação) em andamento do lado do upload, então nenhuma idade mínima
 * prova ausência de corrida com segurança suficiente para esta ferramenta
 * mutar nada. A ferramenta é só diagnóstico: publicar ou tratar um pendente
 * (íntegro ou não) é sempre uma decisão manual, fora daqui — ver
 * deploy/ORACLE_STATUS.md.
 */
export async function reconcileOne(uploadsDirectory: string, candidate: PendingCandidate): Promise<ReconciliationDecision> {
  const finish = (action: ReconciliationAction, detail?: string): ReconciliationDecision => ({ storageKey: candidate.storageKey, action, detail });

  const expected = parseFileIntegrity(candidate.fileIntegrity);
  if (!expected) {
    // Anterior a este campo, ou corrompido: impossível provar conclusão.
    return finish('skip-unverifiable', 'fileIntegrity ausente ou malformado; precisa de tratamento explícito');
  }

  let allComplete = true;
  for (const entry of expected) {
    try {
      const actual = await readRegularFileIntegrity(path.join(uploadsDirectory, entry.name));
      if (actual.sizeBytes !== entry.sizeBytes || actual.sha256 !== entry.sha256) allComplete = false;
    } catch (error) {
      if (error instanceof SymlinkRejectedError) return finish('skip-suspicious', `link simbólico em ${entry.name}; precisa de tratamento explícito`);
      if (error instanceof FileMissingError) { allComplete = false; continue; }
      throw error;
    }
  }

  if (allComplete) return finish('ready-to-publish', 'arquivos batem com fileIntegrity; publicação é manual, fora desta ferramenta');
  return finish('needs-review', 'arquivo ausente ou alterado; nenhuma ação automática — precisa de revisão manual');
}

export interface ReconciliationResult {
  readyToPublish: string[];
  needsReview: string[];
  skippedSuspicious: string[];
  skippedUnverifiable: string[];
}

/** Puramente diagnóstico: nunca escreve em disco nem no banco, nem quando os arquivos de um pendente batem exatamente com fileIntegrity. */
export async function reconcilePendingMedia(
  prisma: Pick<PrismaClient, 'mediaAsset'>,
  uploadsDirectory: string,
  olderThanMs: number,
): Promise<ReconciliationResult> {
  const candidates = await findReconciliationCandidates(prisma, olderThanMs);
  const result: ReconciliationResult = { readyToPublish: [], needsReview: [], skippedSuspicious: [], skippedUnverifiable: [] };
  for (const candidate of candidates) {
    const decision = await reconcileOne(uploadsDirectory, candidate);
    if (decision.action === 'ready-to-publish') result.readyToPublish.push(decision.storageKey);
    else if (decision.action === 'needs-review') result.needsReview.push(decision.storageKey);
    else if (decision.action === 'skip-suspicious') result.skippedSuspicious.push(decision.storageKey);
    else result.skippedUnverifiable.push(decision.storageKey);
  }
  return result;
}
