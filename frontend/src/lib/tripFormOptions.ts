// Sugestões selecionáveis para informações que costumam se repetir entre viagens.
// As orientações padrão começam selecionadas em viagens novas e podem ser removidas.
export const FILTER_CATEGORY_OPTIONS = ['Trilha', 'Experiência', 'Praia', 'Aventura', 'Cultura', 'Natureza'] as const;

export const DEFAULT_IMPORTANT_INFO = [
  'Leve água, protetor solar e itens pessoais para o percurso.',
  'Obrigatório apresentar documento original com foto para a reserva/viagem (normas da ANTT)',
  'Restante do pagamento até 48 horas antes da TRIP.',
  'A TRIP será realizada com mínimo de 13 pessoas.',
  'Transportes utilizados: Van, Micro-ônibus ou Ônibus.',
] as const;

export const IMPORTANT_INFO_PRESETS = [
  ...DEFAULT_IMPORTANT_INFO,
  'Use roupas confortáveis e calçado adequado à atividade.',
  'Leve água e itens pessoais necessários para o percurso.',
  'Leve protetor solar e proteção para o sol.',
  'Chegue com antecedência ao local de saída.',
  'Apresente documento original com foto, se exigido para o embarque.',
] as const;

// Embarques que a agência usa com frequência: um atalho pra não digitar tudo de novo a cada viagem.
// Para adicionar um novo, basta incluir outro objeto aqui — não precisa mexer em mais nada.
export interface DeparturePreset {
  label: string;
  city: string;
  point: string;
  /** Texto de busca para o mapa (LocationPicker); não é a coordenada em si, só deixa a busca pronta. */
  mapsQuery: string;
}

export const DEPARTURE_PRESETS: DeparturePreset[] = [
  {
    label: 'Rodoviária Nova – Catolé (Campina Grande)',
    city: 'Campina Grande',
    point: 'Rodoviária Nova – Catolé (próximo ao guichê da Real Bus)',
    mapsQuery: 'Rodoviária Nova de Campina Grande, Catolé, Campina Grande - PB',
  },
  {
    label: 'Igreja Matriz de Pocinhos',
    city: 'Pocinhos',
    point: 'Igreja Matriz (Paróquia Nossa Senhora da Conceição)',
    mapsQuery: 'Igreja Matriz Nossa Senhora da Conceição, Pocinhos - PB',
  },
  {
    label: 'Parque da Liberdade (Campina Grande)',
    city: 'Campina Grande',
    point: 'Parque da Liberdade',
    mapsQuery: 'Parque da Liberdade, Rua Getúlio Cavalcante, Campina Grande - PB',
  },
];

const same = (a: string, b: string) => a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');

export const hasImportantInfoPreset = (list: string[], item: string) => list.some(value => same(value, item));

export function toggleImportantInfoPreset(list: string[], item: string): string[] {
  return hasImportantInfoPreset(list, item) ? list.filter(value => !same(value, item)) : [...list, item];
}

export function customImportantInfo(list: string[]): string[] {
  return list.filter(value => !IMPORTANT_INFO_PRESETS.some(preset => same(preset, value)));
}
