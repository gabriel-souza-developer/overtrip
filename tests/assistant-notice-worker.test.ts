import { afterAll, describe, expect, it } from 'vitest';
import { runAssistantNoticeWorker } from '../src/services/assistantNoticeWorker.js';
import { prisma } from '../src/lib/prisma.js';
import { applyAssistantConversationEvent, createAssistantConversation } from '../src/services/assistantConversation.js';

afterAll(async () => { await prisma.$disconnect(); });

describe('ciclo do trabalhador de avisos', () => {
  it('encerra imediatamente se já estiver cancelado', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(runAssistantNoticeWorker({ send: async () => { throw new Error('não esperado'); } }, controller.signal)).resolves.toBeUndefined();
  });
  it('processa um aviso e encerra sem iniciar outro ciclo após sinal', async () => {
    await prisma.assistantHandoffNotice.deleteMany();
    await createAssistantConversation('worker_flow');
    await applyAssistantConversationEvent('worker_flow', 'request', 0, 'REQUEST_HUMAN');
    const controller = new AbortController();
    let sent = 0;
    await runAssistantNoticeWorker({ send: async () => { sent++; controller.abort(); } }, controller.signal, 10);
    expect(sent).toBe(1);
    expect(await prisma.assistantConversationState.findUniqueOrThrow({ where: { id: 'worker_flow' } })).toMatchObject({ state: 'WAITING_HUMAN' });
  });
});
