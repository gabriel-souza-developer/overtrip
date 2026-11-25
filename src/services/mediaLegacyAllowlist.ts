import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultUploadsDir, MEDIA_FILE_PATTERN } from './mediaStorage.js';

const ALLOWLIST_FILENAME = '.legacy-media-allowlist.json';

export function legacyMediaAllowlistPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(defaultUploadsDir(env), ALLOWLIST_FILENAME);
}

export interface LegacyMediaAllowlistEntry { sizeBytes: number; sha256: string }

/**
 * Allowlist explícita e auditável de arquivos anteriores ao MediaAsset (sem
 * registro nenhum no banco), gerada por scripts/inventory-legacy-media.ts
 * (--propose e --apply-manifest) e só escrita depois de alguém revisar a
 * lista. Nunca é usada para nada que o processo de upload tenha criado — a
 * rota pública só consulta esta allowlist quando NÃO existe registro nenhum
 * para o storageKey pedido; qualquer registro existente (mesmo pendente,
 * mesmo de outra organização) decide por si só, sem passar por aqui.
 *
 * Chaveada pelo NOME EXATO do arquivo (nunca pelo storageKey sozinho): uma
 * aprovação do arquivo principal nunca libera uma variante (-w640/-w960/
 * -w1280) ou outra extensão com o mesmo storageKey — cada uma só é servida se
 * tiver sua PRÓPRIA entrada aqui, revisada e hasheada à parte (o inventário
 * permite propor/aprovar uma variante órfã individualmente; ver
 * scripts/lib/legacyMediaInventory.ts). Cada entrada também guarda o tamanho
 * e o sha256 revisados: quem serve o arquivo tem que reconferir o conteúdo
 * real contra isto antes de responder, nunca confiar só em "o nome está na
 * lista" (ver publicRoutes.ts).
 *
 * Arquivo ausente, ilegível ou malformado = lista vazia. Nunca um fallback
 * permissivo: a ausência da allowlist nega os arquivos sem registro, não os
 * libera. Uma entrada malformada individual é ignorada (não derruba a lista
 * inteira), mas nunca tratada como aprovada.
 */
export async function loadLegacyMediaAllowlist(): Promise<ReadonlyMap<string, LegacyMediaAllowlistEntry>> {
  try {
    const raw = await readFile(legacyMediaAllowlistPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const entries = parsed && typeof parsed === 'object' && Array.isArray((parsed as { entries?: unknown }).entries)
      ? (parsed as { entries: unknown[] }).entries
      : [];
    const map = new Map<string, LegacyMediaAllowlistEntry>();
    for (const entry of entries) {
      const e = entry as { filename?: unknown; sizeBytes?: unknown; sha256?: unknown };
      if (typeof e.filename === 'string' && MEDIA_FILE_PATTERN.test(e.filename) && typeof e.sizeBytes === 'number' && typeof e.sha256 === 'string' && /^[0-9a-f]{64}$/.test(e.sha256)) {
        map.set(e.filename, { sizeBytes: e.sizeBytes, sha256: e.sha256 });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}
