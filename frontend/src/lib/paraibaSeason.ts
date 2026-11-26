import { easter } from './holidays';

// Orientação sazonal para planejar saídas na Paraíba. É CLIMATOLOGIA (médias
// históricas), não previsão do tempo: cada ano varia, com influência de
// El Niño/La Niña e do Atlântico. Valores em milímetros só aparecem quando
// conferidos na fonte (normais INMET 1991–2020); os demais meses usam a
// faixa qualitativa dos regimes descritos pela AESA e pela literatura.
// Atividades são sugestões de época; avaliações de cada lugar devem ser
// consultadas nas plataformas indicadas (não guardamos notas aqui).

export type RainLevel = 'baixa' | 'moderada' | 'alta';
export type SeasonRegion = 'litoral' | 'agreste' | 'sertao';

export const REGION_LABELS: Record<SeasonRegion, { name: string; places: string }> = {
  litoral: { name: 'Litoral', places: 'João Pessoa, Cabedelo, Conde' },
  agreste: { name: 'Agreste e Brejo', places: 'Campina Grande, Pocinhos, Areia, Bananeiras' },
  sertao: { name: 'Cariri e Sertão', places: 'Cabaceiras, Sousa, Patos' },
};

export const RAIN_LABELS: Record<RainLevel, string> = { baixa: 'Chuva baixa', moderada: 'Chuva moderada', alta: 'Chuva alta' };

export interface RegionClimate { rain: RainLevel; note: string }
export interface SeasonActivity { title: string; where: string; why: string; mapsQuery: string }
export interface SeasonMonth { regions: Record<SeasonRegion, RegionClimate>; activities: SeasonActivity[]; events: string[] }

const SEASON: SeasonMonth[] = [
  { // janeiro
    regions: {
      litoral: { rain: 'moderada', note: 'Quente; normal de 86,4 mm em João Pessoa.' },
      agreste: { rain: 'baixa', note: 'Período seco e quente.' },
      sertao: { rain: 'moderada', note: 'Começa a quadra chuvosa do Sertão (jan–abr).' },
    },
    activities: [
      { title: 'Piscinas naturais de Picãozinho e Seixas', where: 'João Pessoa', why: 'Mar mais calmo e menos chuva; saídas só na maré baixa.', mapsQuery: 'Piscinas naturais do Picãozinho João Pessoa' },
      { title: 'Ilha de Areia Vermelha', where: 'Cabedelo', why: 'Banco de areia que aparece na maré baixa; bom com sol.', mapsQuery: 'Ilha de Areia Vermelha Cabedelo' },
      { title: 'Praias de Tambaba e Coqueirinho', where: 'Conde', why: 'Litoral Sul com falésias, no período ainda pouco chuvoso.', mapsQuery: 'Praia de Coqueirinho Conde PB' },
    ],
    events: ['Prévias de carnaval em João Pessoa.'],
  },
  { // fevereiro
    regions: {
      litoral: { rain: 'moderada', note: 'Quente; normal de 106,2 mm em João Pessoa.' },
      agreste: { rain: 'baixa', note: 'Ainda seco e quente.' },
      sertao: { rain: 'alta', note: 'Meio da quadra chuvosa; caatinga verde.' },
    },
    activities: [
      { title: 'Piscinas naturais e Areia Vermelha', where: 'João Pessoa e Cabedelo', why: 'Ainda é época de sol no litoral; confira a tábua de marés.', mapsQuery: 'Ilha de Areia Vermelha Cabedelo' },
      { title: 'Lajedo de Pai Mateus', where: 'Cabaceiras', why: 'Cariri começa a ficar verde com as chuvas.', mapsQuery: 'Lajedo de Pai Mateus Cabaceiras' },
    ],
    events: ['Folia de Rua de João Pessoa (blocos antes do carnaval).'],
  },
  { // março
    regions: {
      litoral: { rain: 'alta', note: 'Começa o período chuvoso; normal de 171,5 mm em João Pessoa.' },
      agreste: { rain: 'moderada', note: 'Início das chuvas em Campina Grande (mar–ago).' },
      sertao: { rain: 'alta', note: 'Quadra chuvosa; rios e açudes podem encher.' },
    },
    activities: [
      { title: 'Lajedo de Pai Mateus e Saca de Lã', where: 'Cabaceiras', why: 'Paisagem do Cariri verde; evite trilhas logo após temporais.', mapsQuery: 'Saca de Lã Cabaceiras' },
      { title: 'Itacoatiaras do Ingá', where: 'Ingá', why: 'Sítio arqueológico perto de Campina Grande; o rio pode ter água.', mapsQuery: 'Pedra do Ingá' },
    ],
    events: [],
  },
  { // abril
    regions: {
      litoral: { rain: 'alta', note: 'Quadrimestre mais chuvoso do litoral: abr–jul.' },
      agreste: { rain: 'moderada', note: 'Chuvas regulares; temperaturas caindo.' },
      sertao: { rain: 'alta', note: 'Fim da quadra chuvosa.' },
    },
    activities: [
      { title: 'Vale dos Dinossauros', where: 'Sousa', why: 'Fim das chuvas no Sertão: paisagem verde e calor menor.', mapsQuery: 'Vale dos Dinossauros Sousa' },
      { title: 'Pedra da Boca', where: 'Araruna', why: 'Trilhas e escalada; prefira dias sem chuva forte.', mapsQuery: 'Parque Estadual Pedra da Boca Araruna' },
    ],
    events: [],
  },
  { // maio
    regions: {
      litoral: { rain: 'alta', note: 'Muito chuvoso; normal de 287,7 mm em João Pessoa.' },
      agreste: { rain: 'moderada', note: 'Chuvoso e mais frio.' },
      sertao: { rain: 'baixa', note: 'Chuvas diminuem; caatinga ainda verde.' },
    },
    activities: [
      { title: 'Roteiro do Cariri', where: 'Cabaceiras', why: 'Interior com menos chuva que o litoral nesta época.', mapsQuery: 'Lajedo de Pai Mateus Cabaceiras' },
      { title: 'Pedra da Boca e Pedra do Ingá', where: 'Araruna e Ingá', why: 'Alternativas ao litoral, onde as piscinas naturais costumam ficar turvas.', mapsQuery: 'Pedra da Boca Araruna' },
    ],
    events: [],
  },
  { // junho
    regions: {
      litoral: { rain: 'alta', note: 'Pico de chuva; normal de 368,7 mm em João Pessoa.' },
      agreste: { rain: 'alta', note: 'Mês mais chuvoso em Campina Grande (125,8 mm) e frio.' },
      sertao: { rain: 'baixa', note: 'Período seco.' },
    },
    activities: [
      { title: 'São João de Campina Grande', where: 'Parque do Povo, Campina Grande', why: 'Principal festa do calendário; leve agasalho e capa de chuva.', mapsQuery: 'Parque do Povo Campina Grande' },
      { title: 'Festa do Bode Rei', where: 'Cabaceiras', why: 'Festa tradicional no início de junho, no Cariri seco.', mapsQuery: 'Cabaceiras PB' },
    ],
    events: ['São João de Campina Grande (junho, com feriado municipal em 24/06).', 'Festa do Bode Rei, Cabaceiras (início de junho).'],
  },
  { // julho
    regions: {
      litoral: { rain: 'alta', note: 'Ainda chuvoso.' },
      agreste: { rain: 'moderada', note: 'Frio no Brejo: mínimas médias perto de 19 °C em Areia e Bananeiras.' },
      sertao: { rain: 'baixa', note: 'Seco.' },
    },
    activities: [
      { title: 'Caminhos do Frio', where: 'Areia, Pilões, Bananeiras e outras cidades do Brejo', why: 'Festival itinerante de inverno, uma cidade por semana (jul–ago).', mapsQuery: 'Areia PB' },
      { title: 'Engenhos e cachaçarias do Brejo', where: 'Areia', why: 'Passeio de clima frio, bom mesmo com garoa.', mapsQuery: 'Engenhos Areia PB' },
    ],
    events: ['Caminhos do Frio (rota no Brejo; programação muda a cada ano).', 'Festa das Neves começa no fim do mês em João Pessoa.'],
  },
  { // agosto
    regions: {
      litoral: { rain: 'moderada', note: 'Transição para o período seco.' },
      agreste: { rain: 'baixa', note: 'Fim das chuvas; ainda frio no Brejo.' },
      sertao: { rain: 'baixa', note: 'Seco.' },
    },
    activities: [
      { title: 'Caminhos do Frio (etapas finais)', where: 'Bananeiras, Alagoa Grande e outras', why: 'Últimas cidades do festival de inverno.', mapsQuery: 'Bananeiras PB' },
      { title: 'Trilhas do Brejo', where: 'Bananeiras e Areia', why: 'Menos chuva e temperatura amena para caminhar.', mapsQuery: 'Trilhas Bananeiras PB' },
    ],
    events: ['Festa das Neves, João Pessoa (até 05/08, data magna da Paraíba).'],
  },
  { // setembro
    regions: {
      litoral: { rain: 'baixa', note: 'Começa o período ensolarado.' },
      agreste: { rain: 'baixa', note: 'Seco; temperaturas subindo.' },
      sertao: { rain: 'baixa', note: 'Seco e muito quente.' },
    },
    activities: [
      { title: 'Piscinas naturais e Areia Vermelha', where: 'João Pessoa e Cabedelo', why: 'Começa a boa fase do mar; saídas dependem da maré baixa.', mapsQuery: 'Piscinas naturais do Seixas João Pessoa' },
      { title: 'Trilhas e mirantes do Brejo', where: 'Areia e Bananeiras', why: 'Tempo firme e clima ainda ameno.', mapsQuery: 'Mirante Areia PB' },
    ],
    events: [],
  },
  { // outubro
    regions: {
      litoral: { rain: 'baixa', note: 'Seco; normal de 31,0 mm em João Pessoa.' },
      agreste: { rain: 'baixa', note: 'Seco.' },
      sertao: { rain: 'baixa', note: 'Muito quente; programe atividades cedo.' },
    },
    activities: [
      { title: 'Picãozinho, Seixas e Areia Vermelha', where: 'João Pessoa e Cabedelo', why: 'Água mais clara nos meses secos; confira a maré.', mapsQuery: 'Piscinas naturais do Picãozinho João Pessoa' },
      { title: 'Tambaba e Coqueirinho', where: 'Conde', why: 'Praias do Litoral Sul com sol firme.', mapsQuery: 'Praia de Tambaba Conde PB' },
      { title: 'Itacoatiaras do Ingá', where: 'Ingá', why: 'Bate-volta curto saindo de Campina Grande; vá cedo por causa do calor.', mapsQuery: 'Pedra do Ingá' },
    ],
    events: [],
  },
  { // novembro
    regions: {
      litoral: { rain: 'baixa', note: 'Mês mais seco em João Pessoa (normal de 21,1 mm).' },
      agreste: { rain: 'baixa', note: 'Mês mais seco em Campina Grande (12 mm).' },
      sertao: { rain: 'baixa', note: 'Calor forte; atividades só cedo ou no fim da tarde.' },
    },
    activities: [
      { title: 'Praias e piscinas naturais', where: 'Litoral', why: 'Melhor combinação de sol e mar calmo no ano; reserve conforme a maré.', mapsQuery: 'Piscinas naturais do Seixas João Pessoa' },
      { title: 'Vale dos Dinossauros', where: 'Sousa', why: 'Possível, mas planeje o início da manhã.', mapsQuery: 'Vale dos Dinossauros Sousa' },
    ],
    events: [],
  },
  { // dezembro
    regions: {
      litoral: { rain: 'baixa', note: 'Seco e ensolarado.' },
      agreste: { rain: 'baixa', note: 'Seco e quente.' },
      sertao: { rain: 'baixa', note: 'Pré-estação: chuvas isoladas podem começar.' },
    },
    activities: [
      { title: 'Praias do Litoral Sul', where: 'Conde', why: 'Alta temporada de sol; reserve com antecedência.', mapsQuery: 'Praia de Coqueirinho Conde PB' },
      { title: 'Passeio de barco a Areia Vermelha', where: 'Cabedelo', why: 'Dias de maré baixa favorecem o banco de areia.', mapsQuery: 'Ilha de Areia Vermelha Cabedelo' },
    ],
    events: ['Réveillon em João Pessoa (programação a confirmar no ano).'],
  },
];

export interface SeasonSource { label: string; url: string; supports: string }

export const CLIMATE_SOURCES: SeasonSource[] = [
  { label: 'INMET — Normais Climatológicas do Brasil (1991–2020)', url: 'https://portal.inmet.gov.br/normais', supports: 'Médias mensais oficiais de chuva e temperatura por estação.' },
  { label: 'INMET — Balanço de chuvas de João Pessoa (jan/2024)', url: 'https://portal.inmet.gov.br/noticias/balan%C3%A7o-jo%C3%A3o-pessoa-pb-teve-chuva-acima-da-m%C3%A9dia-em-janeiro-2024', supports: 'Normais mensais citadas para João Pessoa.' },
  { label: 'AESA-PB — Agência Executiva de Gestão das Águas', url: 'https://www.aesa.pb.gov.br', supports: 'Monitoramento de chuvas, boletins PBCLIMA e quadras chuvosas por região.' },
  { label: 'Revista GEONORTE (UFAM) — normais de Campina Grande e João Pessoa', url: 'https://periodicos.ufam.edu.br/index.php/revista-geonorte/article/download/12372/9390/40018', supports: 'Dados INMET 1991–2020: chuva mar–ago em Campina Grande, pico em junho.' },
  { label: 'Marinha do Brasil — Tábuas de marés (porto de Cabedelo)', url: 'https://www.marinha.mil.br/chm/tabuas-de-mare', supports: 'Horários de maré baixa para piscinas naturais e Areia Vermelha.' },
];

export const TOURISM_SOURCES: SeasonSource[] = [
  { label: 'PBTur — Empresa Paraibana de Turismo', url: 'https://pbtur.pb.gov.br', supports: 'Calendário e roteiros oficiais do estado.' },
  { label: 'Tripadvisor — atrações da Paraíba', url: 'https://www.tripadvisor.com.br/Attractions-g303428-Activities-State_of_Paraiba.html', supports: 'Avaliações de visitantes por atração.' },
  { label: 'Google Maps — avaliações de cada lugar', url: 'https://www.google.com/maps', supports: 'Notas e comentários recentes; use o link de cada atividade.' },
  { label: 'A União — Caminhos do Frio', url: 'https://www.auniao.pb.gov.br/noticias/caderno_paraiba/lancamento-ocorre-no-proximo-mes', supports: 'Rota por cidade do festival de inverno (edição 2026).' },
];

export const SEASON_DISCLAIMER = 'Orientação climatológica baseada em médias históricas (INMET e AESA). Não é previsão do tempo: cada ano varia bastante. Consulte a previsão do INMET e da AESA perto da data, a tábua de marés da Marinha para piscinas naturais e os canais oficiais para datas de eventos.';

const pad = (n: number) => String(n).padStart(2, '0');

/** Terça de Carnaval (47 dias antes da Páscoa), AAAA-MM-DD. */
export function carnivalTuesday(year: number): string {
  const date = new Date(easter(year).getTime() - 47 * 86_400_000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export const mapsSearchUrl = (query: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

/** Orientação do mês (0–11) para o ano escolhido; o Carnaval é calculado para o ano. */
export function seasonalGuide(year: number, month: number): SeasonMonth | null {
  if (!Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(year) || year < 1583 || year > 4099) return null;
  const base = SEASON[month];
  const carnival = carnivalTuesday(year);
  const events = [...base.events];
  if (Number(carnival.slice(5, 7)) - 1 === month) events.unshift(`Carnaval: terça-feira ${carnival.slice(8, 10)}/${carnival.slice(5, 7)}/${year} (ponto facultativo; calculado pela Páscoa).`);
  return { ...base, events };
}
