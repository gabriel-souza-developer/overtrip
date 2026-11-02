import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

// Conteúdo aprovado é dado de referência, nunca instrução de sistema.
const entrySchema = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(3000),
}).strict();
const entriesSchema = z.array(entrySchema).max(100);

export type AssistantKnowledgeEntry = z.infer<typeof entrySchema>;

/** API interna: só deve receber o identificador de um usuário autenticado. */
export async function approveAssistantKnowledge(approvedById: string, input: unknown, expectedVersion?: number | null) {
  const entries = entriesSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: approvedById }, select: { role: true } });
    if (!user || user.role !== 'admin') throw new Error('Aprovação exige administrador');
    if (expectedVersion !== undefined) {
      const current = await tx.assistantKnowledgeVersion.findFirst({ orderBy: { version: 'desc' }, select: { version: true } });
      if ((current?.version ?? null) !== expectedVersion) throw AppError.conflict('A base foi atualizada por outra pessoa. Recarregue antes de aprovar.');
    }
    const row = await tx.assistantKnowledgeVersion.create({
      data: { entries: JSON.stringify(entries), approvedById },
    });
    return { version: row.version, entries, approvedById: row.approvedById, approvedAt: row.approvedAt };
  });
}

export async function listAssistantKnowledgeVersions() {
  return prisma.assistantKnowledgeVersion.findMany({
    orderBy: { version: 'desc' }, take: 100,
    select: { version: true, approvedAt: true, approvedById: true },
  });
}

/** A versão mais recente substitui integralmente a anterior, inclusive se vazia. */
export async function getAssistantKnowledge(version?: number) {
  const row = version === undefined
    ? await prisma.assistantKnowledgeVersion.findFirst({ orderBy: { version: 'desc' } })
    : await prisma.assistantKnowledgeVersion.findUnique({ where: { version } });
  if (!row) return null;
  return {
    version: row.version,
    entries: entriesSchema.parse(JSON.parse(row.entries)),
    approvedById: row.approvedById,
    approvedAt: row.approvedAt,
  };
}
