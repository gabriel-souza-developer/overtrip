// "O que inclui": itens prontos para marcar + itens próprios. Tudo vive em uma lista só (`includes`).
// Funções puras, testadas em tests/includesServices.test.ts.

export const INCLUDE_PRESETS = ['Guia', 'Assistência da equipe OVERTRIP', 'Serviço de bordo', 'Transporte'] as const;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const hasItem = (list: string[], item: string) => list.some(x => same(x, item));

/** Marca/desmarca um item pronto. Os outros itens (e a ordem deles) ficam como estão. */
export function togglePreset(list: string[], item: string): string[] {
  return hasItem(list, item) ? list.filter(x => !same(x, item)) : [...list, item];
}

/** Itens da lista que não são um dos prontos (aparecem como itens próprios). */
export function customItems(list: string[]): string[] {
  return list.filter(x => !INCLUDE_PRESETS.some(p => same(p, x)));
}

/** Junta listas sem repetir (ignora maiúsculas). Usado para a IA, que ainda pode sugerir "serviços incluídos". */
export function mergeUnique(...lists: Array<string[] | undefined>): string[] {
  const out: string[] = [];
  for (const list of lists) for (const item of list ?? []) if (item.trim() && !hasItem(out, item)) out.push(item);
  return out;
}
