import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';

const LEASE_MS = 60_000;
const RETRY_MS = 30_000;

/** Reservas são cercadas por token; nunca passe dados de clientes para logs. */
export async function claimAssistantNotice(now = new Date()) {
  const candidate = await prisma.assistantHandoffNotice.findFirst({
    where: { conversation: { state: 'WAITING_NOTIFICATION' }, OR: [
      { status: 'PENDING', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
      { status: 'PROCESSING', leaseUntil: { lte: now } },
    ] }, orderBy: { createdAt: 'asc' },
  });
  if (!candidate) return null;
  const token = randomUUID();
  const claimed = await prisma.assistantHandoffNotice.updateMany({
    where: { id: candidate.id, status: candidate.status, attempts: candidate.attempts, leaseToken: candidate.leaseToken, leaseUntil: candidate.leaseUntil, nextAttemptAt: candidate.nextAttemptAt, conversation: { state: 'WAITING_NOTIFICATION' } },
    data: { status: 'PROCESSING', leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 } },
  });
  return claimed.count ? { id: candidate.id, conversationId: candidate.conversationId, token } : null;
}

/** Conclusão é atômica e aceita apenas reserva ainda válida do ciclo corrente. */
export async function finishAssistantNotice(id: string, token: string, outcome: 'sent' | 'failed', now = new Date()) {
  return prisma.$transaction(async tx => {
    const notice = await tx.assistantHandoffNotice.findFirst({ where: { id, status: 'PROCESSING', leaseToken: token, leaseUntil: { gt: now } }, include: { conversation: true } });
    if (!notice || notice.conversation.state !== 'WAITING_NOTIFICATION') return false;
    const updated = await tx.assistantHandoffNotice.updateMany({ where: { id, status: 'PROCESSING', leaseToken: token, leaseUntil: { gt: now } }, data: outcome === 'sent'
      ? { status: 'SENT', leaseToken: null, leaseUntil: null }
      : { status: 'PENDING', leaseToken: null, leaseUntil: null, nextAttemptAt: new Date(now.getTime() + RETRY_MS) } });
    if (!updated.count) return false;
    if (outcome === 'sent') {
      const conversation = await tx.assistantConversationState.updateMany({ where: { id: notice.conversationId, revision: notice.conversation.revision, state: 'WAITING_NOTIFICATION' }, data: { state: 'WAITING_HUMAN', revision: { increment: 1 } } });
      if (!conversation.count) throw new Error('CONVERSATION_CHANGED');
      await tx.assistantConversationEvent.create({ data: { conversationId: notice.conversationId, eventId: `notice_${notice.id}`, event: 'NOTIFICATION_SENT', expectedRevision: notice.conversation.revision, resultState: 'WAITING_HUMAN', resultRevision: notice.conversation.revision + 1 } });
    }
    return true;
  });
}
