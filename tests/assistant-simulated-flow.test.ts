import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { applyAssistantConversationEvent, createAssistantConversation } from '../src/services/assistantConversation.js';
import { claimAssistantNotice, finishAssistantNotice } from '../src/services/assistantNoticeQueue.js';

afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => { await prisma.assistantHandoffNotice.deleteMany(); });
describe('atendimento com canal simulado', () => {
  it('mantém assistente pausado na falha e espera liberação explícita da equipe', async () => {
    const id = 'simulated_conversation';
    await createAssistantConversation(id);
    expect(await applyAssistantConversationEvent(id, 'request', 0, 'REQUEST_HUMAN')).toMatchObject({ state: 'WAITING_NOTIFICATION', assistantMayReply: false });
    expect(await prisma.assistantHandoffNotice.count({ where: { conversationId: id, status: 'PENDING' } })).toBe(1);
    const now = new Date(Date.now() + 1000);
    const first = await claimAssistantNotice(now);
    expect(await finishAssistantNotice(first!.id, first!.token, 'failed', now)).toBe(true);
    expect(await prisma.assistantHandoffNotice.findFirstOrThrow({ where: { conversationId: id } })).toMatchObject({ status: 'PENDING', attempts: 1 });
    const later = new Date(now.getTime() + 31_000);
    const second = await claimAssistantNotice(later);
    expect(await finishAssistantNotice(second!.id, second!.token, 'sent', later)).toBe(true);
    expect(await prisma.assistantHandoffNotice.findFirstOrThrow({ where: { conversationId: id } })).toMatchObject({ status: 'SENT', attempts: 2 });
    expect(await applyAssistantConversationEvent(id, 'taken', 2, 'HUMAN_ASSUMED')).toMatchObject({ state: 'HUMAN', assistantMayReply: false });
    expect(await prisma.assistantHandoffNotice.count({ where: { conversationId: id, status: 'SENT' } })).toBe(1);
    expect(await finishAssistantNotice(second!.id, second!.token, 'sent', later)).toBe(false);
    expect(await applyAssistantConversationEvent(id, 'release', 3, 'HUMAN_RELEASED')).toMatchObject({ state: 'ASSISTANT', assistantMayReply: true });
  });
  it('cancela aviso pendente quando a equipe assume e cria outro em novo ciclo', async () => {
    const id = 'simulated_second_cycle';
    await createAssistantConversation(id);
    await applyAssistantConversationEvent(id, 'request_1', 0, 'REQUEST_HUMAN');
    await applyAssistantConversationEvent(id, 'request_1', 0, 'REQUEST_HUMAN');
    expect(await prisma.assistantHandoffNotice.count({ where: { conversationId: id } })).toBe(1);
    await applyAssistantConversationEvent(id, 'taken_1', 1, 'HUMAN_ASSUMED');
    expect(await prisma.assistantHandoffNotice.findFirstOrThrow({ where: { conversationId: id } })).toMatchObject({ status: 'CANCELLED' });
    await applyAssistantConversationEvent(id, 'released_1', 2, 'HUMAN_RELEASED');
    await applyAssistantConversationEvent(id, 'request_2', 3, 'REQUEST_HUMAN');
    expect(await prisma.assistantHandoffNotice.count({ where: { conversationId: id, status: 'PENDING' } })).toBe(1);
  });
});
