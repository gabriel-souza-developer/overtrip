import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';

/** O monitor roda a cada 5 minutos; acima disso o painel avisa que o resultado está velho. */
const STALE_AFTER_MINUTES = 15;
const MAX_FILE_BYTES = 64 * 1024;
const MAX_HISTORY_FILE_BYTES = 2 * 1024 * 1024;
const MAX_HISTORY_POINTS = 2016;

// Mensagens vêm do deploy/monitor-health.sh: texto fixo com números e nomes de serviço.
const messageSchema = z.string().min(1).max(200).regex(/^[\p{L}\p{N} .,:;%()=/_@-]+$/u);
const statusSchema = z.object({
  checkedAt: z.string().datetime(),
  ok: z.boolean(),
  checks: z.array(z.object({ status: z.enum(['ok', 'alert', 'metric']), message: messageSchema }).strict()).min(1).max(50),
}).strict();

export type SystemHealthCheck = z.infer<typeof statusSchema>['checks'][number];
export type SystemHealthHistoryPoint = z.infer<typeof statusSchema>;
export type SystemHealth =
  | { state: 'unavailable'; checkedAt: null; ageMinutes: null; checks: [] }
  | { state: 'ok' | 'alert' | 'stale'; checkedAt: string; ageMinutes: number; checks: SystemHealthCheck[] };

const unavailable: SystemHealth = { state: 'unavailable', checkedAt: null, ageMinutes: null, checks: [] };

export async function readSystemHealth(file: string, now = new Date()): Promise<SystemHealth> {
  try {
    if ((await stat(file)).size > MAX_FILE_BYTES) return unavailable;
    const parsed = statusSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
    if (!parsed.success) return unavailable;
    const { checkedAt, ok, checks } = parsed.data;
    const ageMinutes = Math.max(0, Math.floor((now.getTime() - Date.parse(checkedAt)) / 60_000));
    const state = ageMinutes > STALE_AFTER_MINUTES ? 'stale' : ok ? 'ok' : 'alert';
    return { state, checkedAt, ageMinutes, checks };
  } catch {
    return unavailable;
  }
}

/** Lê no máximo sete dias de histórico; linhas corrompidas são ignoradas sem expor conteúdo. */
export async function readSystemHealthHistory(file: string, limit = MAX_HISTORY_POINTS): Promise<SystemHealthHistoryPoint[]> {
  try {
    if ((await stat(file)).size > MAX_HISTORY_FILE_BYTES) return [];
    const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean).slice(-Math.min(MAX_HISTORY_POINTS, Math.max(1, limit)));
    return lines.flatMap((line) => {
      try {
        const parsed = statusSchema.safeParse(JSON.parse(line));
        return parsed.success ? [parsed.data] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
