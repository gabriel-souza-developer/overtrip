import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { toAssistantCatalogTrip } from './assistantCatalog.js';
import { getAssistantKnowledge } from './assistantKnowledge.js';
import { mapPublicTrip } from './publicTrips.js';

/**
 * Contrato v2 do fluxo n8n (Assistente WhatsApp v35): mesmo formato do antigo
 * trips.json/knowledge.json que a ficha do fluxo usa, servido só pelo serviço privado.
 */
type PublicTripRow = Parameters<typeof mapPublicTrip>[0];

/** Viagem oferecida pelo assistente: só o que o catálogo libera, sem mídia, botões ou campos internos. */
export function toN8nV2Trip(row: PublicTripRow, now = new Date()) {
  if (!toAssistantCatalogTrip(row, now)) return null;
  const { media: _media, buttonLabel: _label, buttonClass: _class, availabilitySchema: _schema, ...trip } = mapPublicTrip(row);
  return { ...trip, handoffRequiredForBooking: true as const };
}

export async function listN8nV2Trips(now = new Date()) {
  const rows = await prisma.trip.findMany({
    where: { status: 'OPEN' },
    include: { departures: { orderBy: { orderIndex: 'asc' } } },
  });
  return rows
    .map((row) => toN8nV2Trip(row, now))
    .filter((trip): trip is NonNullable<typeof trip> => trip !== null)
    .sort((a, b) => a.startDateISO.localeCompare(b.startDateISO));
}

// O arquivo é editado à mão; exigimos o mínimo que o fluxo usa para cobrar a entrada e responder FAQ.
const knowledgeFileSchema = z.object({
  reservation: z.object({ depositPercentage: z.number().min(0).max(100) }).passthrough(),
  faq: z.array(z.object({ question: z.string(), answer: z.string() }).passthrough()),
}).passthrough();

type ApprovedFaq = { version: number; entries: { question: string; answer: string }[] } | null;

export function buildN8nKnowledge(file: unknown, approved: ApprovedFaq) {
  const base = knowledgeFileSchema.parse(file);
  // Versão aprovada no painel substitui integralmente a FAQ do arquivo, inclusive se vazia.
  const faq = approved
    ? approved.entries.map((entry, index) => ({ id: `painel-v${approved.version}-${index + 1}`, ...entry }))
    : base.faq;
  return { ...base, faq, knowledgeVersion: approved?.version ?? null };
}

let cache: { file: string; mtimeMs: number; data: unknown } | null = null;

async function readKnowledgeFile(file: string): Promise<unknown> {
  const { mtimeMs } = await stat(file);
  if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache.data;
  const data: unknown = JSON.parse(await readFile(file, 'utf8'));
  cache = { file, mtimeMs, data };
  return data;
}

export async function getN8nV2Knowledge(file: string) {
  const [content, approved] = await Promise.all([readKnowledgeFile(file), getAssistantKnowledge()]);
  return buildN8nKnowledge(content, approved ? { version: approved.version, entries: approved.entries } : null);
}
