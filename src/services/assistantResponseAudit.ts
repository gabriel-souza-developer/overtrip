import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

// Registra apenas metadados de uma resposta efetivamente processada pelo
// chamador. Não recebe mensagens, telefone, IDs de cliente ou saída do modelo.
const auditSchema = z.object({
  knowledgeVersion: z.number().int().positive().nullable(),
  outcome: z.enum(['ANSWERED', 'HANDOFF_REQUIRED', 'FAILED']),
}).strict();

export async function recordAssistantResponseAudit(input: unknown) {
  const data = auditSchema.parse(input);
  return prisma.assistantResponseAudit.create({ data });
}
