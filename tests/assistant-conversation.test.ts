import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { applyAssistantConversationEvent, createAssistantConversation } from '../src/services/assistantConversation.js';

afterAll(async () => { await prisma.$disconnect(); });
describe('persistência interna de atendimento', () => {
  it('preserva estado e recusa revisões antigas', async () => {
    const created = await createAssistantConversation('test_conversation');
    expect(created.state).toBe('ASSISTANT');
    const pending = await applyAssistantConversationEvent(created.id, 'request', 0, 'REQUEST_HUMAN');
    expect(pending).toMatchObject({ state: 'WAITING_NOTIFICATION', assistantMayReply: false, revision: 1 });
    await expect(applyAssistantConversationEvent(created.id, 'release_old', 0, 'HUMAN_RELEASED')).rejects.toMatchObject({ statusCode: 409 });
    const notified = await applyAssistantConversationEvent(created.id, 'taken', 1, 'HUMAN_ASSUMED');
    expect(notified.state).toBe('HUMAN');
    expect((await prisma.assistantConversationState.findUniqueOrThrow({ where: { id: created.id } })).revision).toBe(2);
    await expect(applyAssistantConversationEvent(created.id, 'invalid', 2, 'INVALID')).rejects.toThrow();
  });
  it('aceita apenas uma alteração concorrente da mesma revisão', async () => {
    const created = await createAssistantConversation('test_concurrent');
    const results = await Promise.allSettled([
      applyAssistantConversationEvent(created.id, 'request', 0, 'REQUEST_HUMAN'),
      applyAssistantConversationEvent(created.id, 'assumed', 0, 'HUMAN_ASSUMED'),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await prisma.assistantConversationState.findUniqueOrThrow({ where: { id: created.id } })).revision).toBe(1);
  });
  it('deduplica reentregas sem aplicar eventos antigos em ciclos posteriores', async () => {
    await createAssistantConversation('test_events');
    const first = await applyAssistantConversationEvent('test_events', 'event_1', 0, 'REQUEST_HUMAN');
    expect(first).toMatchObject({ state: 'WAITING_NOTIFICATION', revision: 1, replayed: false });
    await applyAssistantConversationEvent('test_events', 'event_2', 1, 'HUMAN_RELEASED');
    await applyAssistantConversationEvent('test_events', 'event_3', 2, 'REQUEST_HUMAN');
    expect(await applyAssistantConversationEvent('test_events', 'event_1', 0, 'REQUEST_HUMAN')).toMatchObject({ revision: 1, replayed: true });
    await expect(applyAssistantConversationEvent('test_events', 'event_1', 0, 'HUMAN_RELEASED')).rejects.toMatchObject({ statusCode: 409 });
    await expect(applyAssistantConversationEvent('test_events', 'late_event', 1, 'HUMAN_RELEASED')).rejects.toMatchObject({ statusCode: 409 });
    expect(await prisma.assistantConversationState.findUniqueOrThrow({ where: { id: 'test_events' } })).toMatchObject({ state: 'WAITING_NOTIFICATION', revision: 3 });
  });
  it('mantém uma única transição quando a mesma entrega chega simultaneamente', async () => {
    await createAssistantConversation('test_duplicate_concurrent');
    const send = () => applyAssistantConversationEvent('test_duplicate_concurrent', 'same_event', 0, 'REQUEST_HUMAN');
    const results = await Promise.allSettled([send(), send()]);
    expect(results.some(result => result.status === 'fulfilled')).toBe(true);
    expect(await send()).toMatchObject({ state: 'WAITING_NOTIFICATION', revision: 1, replayed: true });
    expect(await prisma.assistantConversationEvent.count({ where: { conversationId: 'test_duplicate_concurrent' } })).toBe(1);
    expect(await prisma.assistantConversationState.findUniqueOrThrow({ where: { id: 'test_duplicate_concurrent' } })).toMatchObject({ revision: 1 });
  });
});
