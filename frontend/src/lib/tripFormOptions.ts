// Sugestões selecionáveis para informações que costumam se repetir entre viagens.
// São apenas atalhos: nada é incluído automaticamente no cadastro.
export const FILTER_CATEGORY_OPTIONS = ['Trilha', 'Experiência', 'Praia', 'Aventura', 'Cultura', 'Natureza'] as const;

export const IMPORTANT_INFO_PRESETS = [
  'Use roupas confortáveis e calçado adequado à atividade.',
  'Leve água e itens pessoais necessários para o percurso.',
  'Leve protetor solar e proteção para o sol.',
  'Chegue com antecedência ao local de saída.',
  'Apresente documento original com foto, se exigido para o embarque.',
] as const;

const same = (a: string, b: string) => a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');

export const hasImportantInfoPreset = (list: string[], item: string) => list.some(value => same(value, item));

export function toggleImportantInfoPreset(list: string[], item: string): string[] {
  return hasImportantInfoPreset(list, item) ? list.filter(value => !same(value, item)) : [...list, item];
}

export function customImportantInfo(list: string[]): string[] {
  return list.filter(value => !IMPORTANT_INFO_PRESETS.some(preset => same(preset, value)));
}
