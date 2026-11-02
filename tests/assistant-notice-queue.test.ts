import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { applyAssistantConversationEvent, createAssistantConversation } from '../src/services/assistantConversation.js';
import { claimAssistantNotice, finishAssistantNotice } from '../src/services/assistantNoticeQueue.js';

afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => { await prisma.assistantHandoffNotice.deleteMany(); });
describe('fila interna de avisos', () => {
  it('recupera reserva expirada e impede conclusão por trabalhador antigo', async () => {
    await createAssistantConversation('queue_test');
    await applyAssistantConversationEvent('queue_test', 'request', 0, 'REQUEST_HUMAN');
    const now = new Date(Date.now() + 1000);
    const first = await claimAssistantNotice(now);
    expect(first).not.toBeNull();
    expect(await claimAssistantNotice(now)).toBeNull();
    const later = new Date(now.getTime() + 61_000);
    const second = await claimAssistantNotice(later);
    expect(second?.id).toBe(first?.id);
    expect(await finishAssistantNotice(first!.id, first!.token, 'sent', later)).toBe(false);
    expect(await finishAssistantNotice(second!.id, second!.token, 'failed', later)).toBe(true);
    expect(await claimAssistantNotice(new Date(later.getTime() + 29_000))).toBeNull();
    const third = await claimAssistantNotice(new Date(later.getTime() + 31_000));
    expect(await finishAssistantNotice(third!.id, third!.token, 'sent', new Date(later.getTime() + 32_000))).toBe(true);
    expect(await prisma.assistantConversationState.findUniqueOrThrow({ where: { id: 'queue_test' } })).toMatchObject({ state: 'WAITING_HUMAN', revision: 2 });
  });
  it('não conclui aviso reservado depois que a equipe assume', async () => {
    await createAssistantConversation('queue_cancel');
    await applyAssistantConversationEvent('queue_cancel', 'request', 0, 'REQUEST_HUMAN');
    const claim = await claimAssistantNotice(new Date(Date.now() + 1000));
    await applyAssistantConversationEvent('queue_cancel', 'taken', 1, 'HUMAN_ASSUMED');
    expect(await finishAssistantNotice(claim!.id, claim!.token, 'sent')).toBe(false);
    expect(await prisma.assistantHandoffNotice.findUniqueOrThrow({ where: { id: claim!.id } })).toMatchObject({ status: 'CANCELLED' });
  });
});
