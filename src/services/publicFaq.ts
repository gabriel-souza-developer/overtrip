import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export const PUBLIC_FAQ_KEY = 'publicFaq';

export const publicFaqEntrySchema = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(3000),
}).strict();
export const publicFaqEntriesSchema = z.array(publicFaqEntrySchema).min(1).max(20);
export type PublicFaqEntry = z.infer<typeof publicFaqEntrySchema>;

// Conteúdo inicial igual ao FAQ que já estava publicado no site.
export const DEFAULT_PUBLIC_FAQ: PublicFaqEntry[] = [
  {
    question: 'Posso embarcar sozinho(a)?',
    answer: 'Pode sim. As experiências são pensadas para acolher quem chega sozinho(a), em casal ou com amigos. Antes do embarque, a organização aproxima o grupo e passa as informações principais.',
  },
  {
    question: 'Como confirmo minha vaga?',
    answer: 'A reserva é feita com 50% do valor da experiência. O restante deve ser quitado até 48h antes do embarque. Aceitamos PIX e cartão; pagamentos no cartão podem ter acréscimo de taxas/juros da operadora.',
  },
  {
    question: 'O que está incluso no investimento?',
    answer: 'Inclui transporte, organização e curadoria da experiência. Alimentação, entradas ou itens extras são informados antes da reserva.',
  },
  {
    question: 'Precisa de experiência ou preparo físico?',
    answer: 'Cada expedição tem um nível de intensidade. Antes da reserva, informamos se a experiência é leve, moderada ou exige mais preparo físico.',
  },
  {
    question: 'Posso desistir? Tem reembolso?',
    answer: 'A política de desistência considera a proximidade do embarque e os custos de organização, logística e parceiros já assumidos. Após o pagamento de 50% referente à reserva, não realizamos reembolsos. Situações excepcionais, como problemas de saúde comprovados, são analisadas individualmente. Se precisar tratar de uma situação específica, posso direcionar ao nosso time responsável.',
  },
];

type StoredFaq = { version: number; entries: PublicFaqEntry[]; updatedAt: string; updatedById: string };

function parseStored(value: string | null | undefined): StoredFaq | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as StoredFaq;
    if (!Number.isSafeInteger(parsed.version) || parsed.version < 1) return null;
    const entries = publicFaqEntriesSchema.parse(parsed.entries);
    if (typeof parsed.updatedAt !== 'string' || typeof parsed.updatedById !== 'string') return null;
    return { version: parsed.version, entries, updatedAt: parsed.updatedAt, updatedById: parsed.updatedById };
  } catch {
    return null;
  }
}

export const publicFaqService = {
  async get() {
    const setting = await prisma.setting.findUnique({ where: { key: PUBLIC_FAQ_KEY } });
    const stored = parseStored(setting?.value);
    return stored
      ? { version: stored.version, entries: stored.entries, updatedAt: stored.updatedAt }
      : { version: 0, entries: DEFAULT_PUBLIC_FAQ, updatedAt: null };
  },

  async publish(updatedById: string, entriesInput: unknown, expectedVersion: number) {
    const entries = publicFaqEntriesSchema.parse(entriesInput);
    const user = await prisma.user.findUnique({ where: { id: updatedById }, select: { role: true } });
    if (!user || user.role !== 'admin') throw AppError.forbidden('Apenas administradores podem atualizar o FAQ do site.');
    const row = await prisma.setting.findUnique({ where: { key: PUBLIC_FAQ_KEY } });
    const current = parseStored(row?.value);
    const currentVersion = current?.version ?? 0;
    if (currentVersion !== expectedVersion) throw AppError.conflict('O FAQ foi atualizado por outra pessoa. Recarregue antes de salvar.');
    const next: StoredFaq = {
      version: currentVersion + 1,
      entries,
      updatedAt: new Date().toISOString(),
      updatedById,
    };

    try {
      if (row) {
        // Compare-and-swap: só grava se o conteúdo lido ainda for o conteúdo atual.
        const changed = await prisma.setting.updateMany({
          where: { key: PUBLIC_FAQ_KEY, value: row.value },
          data: { value: JSON.stringify(next) },
        });
        if (changed.count !== 1) throw AppError.conflict('O FAQ foi atualizado por outra pessoa. Recarregue antes de salvar.');
      } else {
        // A chave única resolve concorrência no primeiro salvamento (versão 0).
        await prisma.setting.create({ data: { key: PUBLIC_FAQ_KEY, value: JSON.stringify(next) } });
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
        throw AppError.conflict('O FAQ foi atualizado por outra pessoa. Recarregue antes de salvar.');
      }
      throw error;
    }
    return { version: next.version, entries, updatedAt: next.updatedAt };
  },
};
