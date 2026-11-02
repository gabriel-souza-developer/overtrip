import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { transitionHandoff } from './assistantHandoff.js';
import { AppError } from '../middleware/errorHandler.js';

const stateSchema = z.enum(['ASSISTANT', 'WAITING_NOTIFICATION', 'WAITING_HUMAN', 'HUMAN']);
const eventSchema = z.enum(['REQUEST_HUMAN', 'HUMAN_ASSUMED', 'HUMAN_RELEASED']);

/** IDs são opacos; autenticação e associação ao ciclo cabem ao adaptador. */
export async function createAssistantConversation(id: string) {
  const safeId = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/).parse(id);
  return prisma.assistantConversationState.create({ data: { id: safeId } });
}

/** Reentregas usam a mesma chave e revisão originais. O resultado reentregue
 * é histórico; para decidir se pode responder, consulte sempre o estado atual. */
export async function applyAssistantConversationEvent(id: string, eventId: string, expectedRevision: number, event: unknown) {
  const key = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/).parse(eventId);
  if (key.startsWith('notice_')) throw AppError.badRequest('Identificador de evento reservado');
  z.number().int().nonnegative().parse(expectedRevision);
  const action = eventSchema.parse(event);
  const replay = (stored: { event: string; expectedRevision: number; resultState: string; resultRevision: number }) => {
    if (stored.event !== action || stored.expectedRevision !== expectedRevision) throw AppError.conflict('Identificador de evento já utilizado');
    const state = stateSchema.parse(stored.resultState);
    return { state, revision: stored.resultRevision, replayed: true as const };
  };
  return prisma.$transaction(async tx => {
    const where = { conversationId_eventId: { conversationId: id, eventId: key } };
    const previous = await tx.assistantConversationEvent.findUnique({ where });
    if (previous) return replay(previous);
    const current = await tx.assistantConversationState.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('Atendimento não encontrado');
    if (current.revision !== expectedRevision) throw AppError.conflict('Estado do atendimento foi alterado');
    const result = transitionHandoff(stateSchema.parse(current.state), action);
    const updated = await tx.assistantConversationState.updateMany({ where: { id, revision: expectedRevision }, data: { state: result.state, revision: { increment: 1 } } });
    if (updated.count !== 1) throw AppError.conflict('Estado do atendimento foi alterado');
    await tx.assistantConversationEvent.create({ data: { conversationId: id, eventId: key, event: action, expectedRevision, resultState: result.state, resultRevision: expectedRevision + 1 } });
    if (action === 'REQUEST_HUMAN' && current.state === 'ASSISTANT') {
      await tx.assistantHandoffNotice.create({ data: { conversationId: id, requestEventId: key } });
    }
    if ((action === 'HUMAN_ASSUMED' || action === 'HUMAN_RELEASED') && result.state !== 'WAITING_NOTIFICATION') {
      await tx.assistantHandoffNotice.updateMany({ where: { conversationId: id, status: { in: ['PENDING', 'PROCESSING'] } }, data: { status: 'CANCELLED', leaseToken: null, leaseUntil: null } });
    }
    return { ...result, revision: expectedRevision + 1, replayed: false as const };
  });
}
