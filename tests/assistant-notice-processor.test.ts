import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { applyAssistantConversationEvent, createAssistantConversation } from '../src/services/assistantConversation.js';
import { processAssistantNotice } from '../src/services/assistantNoticeProcessor.js';

beforeEach(async () => { await prisma.assistantHandoffNotice.deleteMany(); });
afterAll(async () => { await prisma.$disconnect(); });
describe('processador de avisos com adaptador simulado', () => {
  it('não envia sem aviso e confirma somente após o adaptador concluir', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await processAssistantNotice({ send })).toBe('idle');
    await createAssistantConversation('processor_success');
    await applyAssistantConversationEvent('processor_success', 'request', 0, 'REQUEST_HUMAN');
    expect(await processAssistantNotice({ send })).toBe('sent');
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({ conversationId: 'processor_success', noticeId: expect.any(String) });
    expect(await prisma.assistantConversationState.findUniqueOrThrow({ where: { id: 'processor_success' } })).toMatchObject({ state: 'WAITING_HUMAN' });
  });
  it('reagenda falha sem registrar conteúdo do erro e mantém o bot pausado', async () => {
    await createAssistantConversation('processor_failure');
    await applyAssistantConversationEvent('processor_failure', 'request', 0, 'REQUEST_HUMAN');
    expect(await processAssistantNotice({ send: async () => { throw new Error('conteúdo privado'); } })).toBe('retry');
    expect(await prisma.assistantConversationState.findUniqueOrThrow({ where: { id: 'processor_failure' } })).toMatchObject({ state: 'WAITING_NOTIFICATION' });
    expect(await prisma.assistantHandoffNotice.findFirstOrThrow({ where: { conversationId: 'processor_failure' } })).toMatchObject({ status: 'PENDING', attempts: 1 });
  });
  it('interrompe uma tentativa travada e agenda nova tentativa', async () => {
    await createAssistantConversation('processor_timeout');
    await applyAssistantConversationEvent('processor_timeout', 'request', 0, 'REQUEST_HUMAN');
    let signal: AbortSignal | undefined;
    expect(await processAssistantNotice({ send: ({ signal: s }) => { signal = s; return new Promise(() => {}); } }, 10)).toBe('retry');
    expect(signal?.aborted).toBe(true);
    expect(await prisma.assistantHandoffNotice.findFirstOrThrow({ where: { conversationId: 'processor_timeout' } })).toMatchObject({ status: 'PENDING' });
  });
});
