import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { recordAssistantResponseAudit } from '../src/services/assistantResponseAudit.js';
import { approveAssistantKnowledge } from '../src/services/assistantKnowledge.js';

describe('auditoria interna de respostas do assistente', () => {
  afterAll(async () => { await prisma.$disconnect(); });
  it('registra a versão e o resultado sem aceitar conteúdo nem referências inexistentes', async () => {
    const user = await prisma.user.create({ data: { email: 'audit-admin@example.test', passwordHash: 'test', role: 'admin' } });
    const knowledge = await approveAssistantKnowledge(user.id, []);
    const record = await recordAssistantResponseAudit({ knowledgeVersion: knowledge.version, outcome: 'ANSWERED' });
    expect(record).toMatchObject({ knowledgeVersion: knowledge.version, outcome: 'ANSWERED' });
    expect(Object.keys(record).sort()).toEqual(['createdAt', 'id', 'knowledgeVersion', 'outcome']);
    await expect(recordAssistantResponseAudit({ knowledgeVersion: null, outcome: 'HANDOFF_REQUIRED', message: 'conteúdo privado' })).rejects.toThrow();
    await expect(recordAssistantResponseAudit({ knowledgeVersion: 999999, outcome: 'ANSWERED' })).rejects.toThrow();
    const failed = await recordAssistantResponseAudit({ knowledgeVersion: null, outcome: 'FAILED' });
    expect(failed.knowledgeVersion).toBeNull();
    await prisma.assistantResponseAudit.deleteMany({ where: { id: { in: [record.id, failed.id] } } });
  });
});
