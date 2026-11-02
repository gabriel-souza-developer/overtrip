import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { approveAssistantKnowledge, getAssistantKnowledge } from '../src/services/assistantKnowledge.js';

describe('base interna aprovada do assistente', () => {
  afterAll(async () => { await prisma.$disconnect(); });

  it('exige admin, preserva versões e substitui a versão ativa integralmente', async () => {
    await prisma.assistantKnowledgeVersion.deleteMany();
    const admin = await prisma.user.create({ data: { email: 'knowledge-admin@example.test', passwordHash: 'test', role: 'admin' } });
    const other = await prisma.user.create({ data: { email: 'knowledge-other@example.test', passwordHash: 'test', role: 'user' } });
    const first = [{ question: 'Pergunta?', answer: 'Resposta aprovada.' }];
    await expect(approveAssistantKnowledge(other.id, first)).rejects.toThrow();
    await expect(approveAssistantKnowledge(admin.id, [{ question: ' ', answer: 'x' }])).rejects.toThrow();
    expect(await getAssistantKnowledge()).toBeNull();
    const v1 = await approveAssistantKnowledge(admin.id, first);
    const v2 = await approveAssistantKnowledge(admin.id, []);
    expect(v2.version).toBeGreaterThan(v1.version);
    expect(await getAssistantKnowledge()).toMatchObject({ version: v2.version, entries: [] });
    expect(await getAssistantKnowledge(v1.version)).toMatchObject({ entries: first, approvedById: admin.id });
    expect(await getAssistantKnowledge(999999)).toBeNull();
  });
});
