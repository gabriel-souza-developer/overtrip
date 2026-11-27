// Orientação sazonal para planejar saídas na Paraíba. É CLIMATOLOGIA (o
// período em que as chuvas costumam se concentrar), não previsão do tempo:
// cada ano varia. Não guardamos milímetros nem notas de avaliação aqui.
//
// Zonas e períodos chuvosos seguem a AESA (boletins PBCLIMA):
// - Litoral, Brejo e Agreste: "período mais chuvoso ... entre os meses de
//   abril e julho" (PBCLIMA jan/2026) e "regime pluviométrico se estende de
//   abril a julho" (PBCLIMA jul/2025).
// - Alto Sertão: abril é o "final da quadra chuvosa do Alto Sertão" e janeiro
//   abre a quadra no semiárido (PBCLIMA fev/2026) → janeiro a abril.
// - Sertão, Cariri e Curimataú: abril é "o mês que antecede o final da quadra
//   chuvosa das regiões do Sertão, Cariri e Curimataú" (PBCLIMA fev/2026) →
//   fevereiro a maio.
// Cidades de exemplo conferidas nas tabelas por região dos boletins da AESA
// (ex.: Pocinhos e Cabaceiras no Cariri; Patos no Sertão; Sousa no Alto Sertão).

export type SeasonZone = 'leste' | 'semiarido' | 'altoSertao';
export type RainPhase = 'inicio' | 'chuvoso' | 'fim' | 'antes' | 'depois' | 'seco';

export interface ZoneInfo { name: string; places: string; window: [number, number]; windowLabel: string }

/** Meses 0–11, intervalo fechado. */
export const ZONES: Record<SeasonZone, ZoneInfo> = {
  leste: { name: 'Litoral, Brejo e Agreste', places: 'João Pessoa, Conde, Campina Grande, Areia, Bananeiras', window: [3, 6], windowLabel: 'abril a julho' },
  semiarido: { name: 'Cariri, Curimataú e Sertão', places: 'Pocinhos, Cabaceiras, Patos', window: [1, 4], windowLabel: 'fevereiro a maio' },
  altoSertao: { name: 'Alto Sertão', places: 'Sousa, Cajazeiras', window: [0, 3], windowLabel: 'janeiro a abril' },
};
export const ZONE_ORDER: SeasonZone[] = ['leste', 'semiarido', 'altoSertao'];

export const PHASE_LABELS: Record<RainPhase, string> = {
  inicio: 'Início do período chuvoso',
  chuvoso: 'Período chuvoso',
  fim: 'Fim do período chuvoso',
  antes: 'Transição: antes do período chuvoso',
  depois: 'Transição: chuvas diminuindo',
  seco: 'Fora do período chuvoso',
};

/** Fase climatológica da zona no mês (0–11). Transição = mês vizinho ao período chuvoso, quando chuvas podem ocorrer ou não. */
export function rainPhase(zone: SeasonZone, month: number): RainPhase {
  const [start, end] = ZONES[zone].window;
  if (month === start) return 'inicio';
  if (month === end) return 'fim';
  if (month > start && month < end) return 'chuvoso';
  if (month === (start + 11) % 12) return 'antes';
  if (month === (end + 1) % 12) return 'depois';
  return 'seco';
}

export const isRainy = (phase: RainPhase) => phase === 'inicio' || phase === 'chuvoso' || phase === 'fim';

export interface SeasonActivity { title: string; where: string; zone: SeasonZone; why: string; mapsQuery: string }

/** Até três sugestões por mês, a principal primeiro. Nenhuma depende de data de evento. */
const ACTIVITIES: SeasonActivity[][] = [
  [ // janeiro: leste fora da chuva
    { title: 'Piscinas naturais do Seixas e Picãozinho', where: 'João Pessoa', zone: 'leste', why: 'Litoral fora do período chuvoso; a visita depende da maré baixa.', mapsQuery: 'Piscinas naturais do Seixas João Pessoa' },
    { title: 'Praias de Coqueirinho e Tambaba', where: 'Conde', zone: 'leste', why: 'Litoral Sul com falésias, fora do período chuvoso.', mapsQuery: 'Praia de Coqueirinho Conde PB' },
  ],
  [ // fevereiro
    { title: 'Ilha de Areia Vermelha', where: 'Cabedelo', zone: 'leste', why: 'Litoral ainda fora do período chuvoso; banco de areia só na maré baixa.', mapsQuery: 'Ilha de Areia Vermelha Cabedelo' },
    { title: 'Lajedo de Pai Mateus', where: 'Cabaceiras', zone: 'semiarido', why: 'Início da quadra chuvosa no Cariri: paisagem pode estar verde; evite trilhas logo após temporais.', mapsQuery: 'Lajedo de Pai Mateus Cabaceiras' },
  ],
  [ // março
    { title: 'Itacoatiaras do Ingá', where: 'Ingá', zone: 'leste', why: 'Perto de Campina Grande; Agreste em transição, ainda antes do período chuvoso.', mapsQuery: 'Pedra do Ingá' },
    { title: 'Praias e piscinas naturais', where: 'João Pessoa e Conde', zone: 'leste', why: 'Transição no Litoral: prefira dias de sol e confira a maré.', mapsQuery: 'Piscinas naturais do Picãozinho João Pessoa' },
  ],
  [ // abril
    { title: 'Vale dos Dinossauros', where: 'Sousa', zone: 'altoSertao', why: 'Fim da quadra chuvosa no Alto Sertão: paisagem verde e chuvas diminuindo.', mapsQuery: 'Vale dos Dinossauros Sousa' },
    { title: 'Saca de Lã e Lajedo de Pai Mateus', where: 'Cabaceiras', zone: 'semiarido', why: 'Cariri ainda na quadra chuvosa: verde, mas confira a previsão do dia.', mapsQuery: 'Saca de Lã Cabaceiras' },
  ],
  [ // maio
    { title: 'Vale dos Dinossauros', where: 'Sousa', zone: 'altoSertao', why: 'Alto Sertão já em transição para o seco, com menos risco de chuva que o Litoral.', mapsQuery: 'Vale dos Dinossauros Sousa' },
    { title: 'Roteiro do Cariri', where: 'Cabaceiras', zone: 'semiarido', why: 'Fim da quadra chuvosa no Cariri; alternativa ao Litoral, que entra no período chuvoso.', mapsQuery: 'Lajedo de Pai Mateus Cabaceiras' },
  ],
  [ // junho
    { title: 'São João de Campina Grande', where: 'Parque do Povo, Campina Grande', zone: 'leste', why: 'Festa junina tradicional; o Agreste está no período chuvoso: leve capa de chuva.', mapsQuery: 'Parque do Povo Campina Grande' },
    { title: 'Roteiro do Cariri', where: 'Cabaceiras e Pocinhos', zone: 'semiarido', why: 'Cariri em transição após a quadra chuvosa: chuvas diminuindo.', mapsQuery: 'Cabaceiras PB' },
  ],
  [ // julho
    { title: 'Brejo no inverno: engenhos e mirantes', where: 'Areia e Bananeiras', zone: 'leste', why: 'Fim do período chuvoso no Brejo; programa de clima frio que funciona mesmo com garoa.', mapsQuery: 'Areia PB' },
    { title: 'Cachoeira do Roncador', where: 'Bananeiras', zone: 'leste', why: 'O volume de água depende das chuvas locais: confirme a condição da cachoeira e do acesso antes de levar o grupo.', mapsQuery: 'Cachoeira do Roncador Bananeiras' },
  ],
  [ // agosto
    { title: 'Cachoeira do Roncador', where: 'Bananeiras', zone: 'leste', why: 'Chuvas diminuindo no Brejo; o volume de água depende das chuvas locais, então confirme a condição da cachoeira e do acesso.', mapsQuery: 'Cachoeira do Roncador Bananeiras' },
    { title: 'Trilhas do Brejo', where: 'Bananeiras e Areia', zone: 'leste', why: 'Transição para o seco: menos chuva para caminhar.', mapsQuery: 'Trilhas Bananeiras PB' },
  ],
  [ // setembro
    { title: 'Piscinas naturais do Seixas e Picãozinho', where: 'João Pessoa', zone: 'leste', why: 'Litoral fora do período chuvoso; reserve conforme a maré baixa.', mapsQuery: 'Piscinas naturais do Seixas João Pessoa' },
    { title: 'Mirantes do Brejo', where: 'Areia e Bananeiras', zone: 'leste', why: 'Fora do período chuvoso típico; confira a previsão antes da trilha.', mapsQuery: 'Mirante Areia PB' },
  ],
  [ // outubro
    { title: 'Picãozinho e Areia Vermelha', where: 'João Pessoa e Cabedelo', zone: 'leste', why: 'Período seco no Litoral; a programação depende da maré baixa.', mapsQuery: 'Piscinas naturais do Picãozinho João Pessoa' },
    { title: 'Praias de Tambaba e Coqueirinho', where: 'Conde', zone: 'leste', why: 'Litoral Sul fora do período chuvoso.', mapsQuery: 'Praia de Tambaba Conde PB' },
  ],
  [ // novembro
    { title: 'Praias e piscinas naturais', where: 'João Pessoa, Cabedelo e Conde', zone: 'leste', why: 'Litoral fora do período chuvoso; marque a vivência pela tábua de marés.', mapsQuery: 'Piscinas naturais do Seixas João Pessoa' },
    { title: 'Itacoatiaras do Ingá', where: 'Ingá', zone: 'leste', why: 'Bate-volta curto saindo de Campina Grande; vá cedo, por causa do calor.', mapsQuery: 'Pedra do Ingá' },
  ],
  [ // dezembro
    { title: 'Praias do Litoral Sul', where: 'Conde', zone: 'leste', why: 'Fora do período chuvoso; alta procura, reserve com antecedência.', mapsQuery: 'Praia de Coqueirinho Conde PB' },
    { title: 'Ilha de Areia Vermelha', where: 'Cabedelo', zone: 'leste', why: 'Banco de areia que aparece na maré baixa.', mapsQuery: 'Ilha de Areia Vermelha Cabedelo' },
  ],
];

export interface SeasonSource { label: string; url: string; supports: string }

export const CLIMATE_SOURCES: SeasonSource[] = [
  { label: 'AESA — Boletim PBCLIMA fevereiro/2026', url: 'https://www.aesa.pb.gov.br/assets/uploads/2026/02/Boletim-Climatico-Mensal_PBCLIMA_AESA_Feveriro_2026.pdf', supports: 'Abril: início do período chuvoso no Litoral, Brejo e Agreste, fim da quadra no Alto Sertão e mês que antecede o fim da quadra no Sertão, Cariri e Curimataú.' },
  { label: 'AESA — Boletim PBCLIMA julho/2025', url: 'https://www.aesa.pb.gov.br/assets/uploads/2025/08/Boletim-Climatico-Mensal_PBCLIMA_AESA_Julho_2025.pdf', supports: 'Litoral, Brejo e Agreste: regime de chuvas de abril a julho.' },
  { label: 'AESA — Atlas Pluviométrico da Paraíba', url: 'https://www.aesa.pb.gov.br/biblioteca/atlas-pluviometrico-da-paraiba/', supports: 'Distribuição histórica das chuvas no estado.' },
];

export const FORECAST_SOURCES: SeasonSource[] = [
  { label: 'AESA — Previsão do tempo', url: 'https://www.aesa.pb.gov.br/previsao-do-tempo/', supports: 'Previsão diária para a Paraíba.' },
  { label: 'AESA — Avisos meteorológicos', url: 'https://www.aesa.pb.gov.br/aviso-meteorologico/', supports: 'Avisos estaduais de chuva forte.' },
  { label: 'INMET — Avisos meteorológicos', url: 'https://avisos.inmet.gov.br', supports: 'Alertas oficiais em vigor por município.' },
  { label: 'Marinha do Brasil — Tábuas de marés', url: 'https://www.marinha.mil.br/chm/tabuas-de-mare', supports: 'Maré baixa para piscinas naturais e Areia Vermelha (porto de Cabedelo).' },
];

export const SEASON_DISCLAIMER = 'Orientação climatológica: mostra quando as chuvas costumam se concentrar em cada região, segundo a AESA. Não é previsão do tempo, e cada ano varia. Perto da data, consulte a previsão e os avisos da AESA e do INMET, além da tábua de marés para vivências em piscinas naturais.';

export const mapsSearchUrl = (query: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

export interface SeasonMonth { zones: { zone: SeasonZone; phase: RainPhase }[]; activities: SeasonActivity[]; summary: string }

function monthSummary(zones: { zone: SeasonZone; phase: RainPhase }[]): string {
  const rainy = zones.filter((item) => isRainy(item.phase)).map((item) => ZONES[item.zone].name);
  if (rainy.length === 0) return 'Todas as regiões estão fora do período chuvoso típico. Praia e trilha ainda dependem da previsão, da maré e da condição do local.';
  if (rainy.length === zones.length) return 'Todas as regiões estão no período chuvoso típico: prefira roteiros flexíveis e confira a previsão.';
  return `Período chuvoso típico em ${rainy.join(' e ')}; as demais regiões estão em transição ou fora dele.`;
}

/** Orientação do mês (0–11). O ano não muda a climatologia; é exibido só no título. */
export function seasonalGuide(month: number): SeasonMonth | null {
  if (!Number.isInteger(month) || month < 0 || month > 11) return null;
  const zones = ZONE_ORDER.map((zone) => ({ zone, phase: rainPhase(zone, month) }));
  return { zones, activities: ACTIVITIES[month], summary: monthSummary(zones) };
}
