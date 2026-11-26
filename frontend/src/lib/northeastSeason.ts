/**
 * Guia climatológico para planejamento de viagens no Nordeste.
 * As janelas descrevem concentrações históricas indicadas nas fontes por zona;
 * não são previsão, garantia de chuva nem classificação de segurança turística.
 * Meses usam o índice JS (0–11) e podem cruzar dezembro/janeiro.
 */

export interface ClimateSource {
  label: string;
  url: string;
  supports: string;
}

export interface ClimateZone {
  name: string;
  places: string;
  months: number[];
  periodLabel: string;
  source: ClimateSource;
}

export interface NortheastState {
  code: string;
  name: string;
  forecast: ClimateSource;
  zones: ClimateZone[];
}

const source = (label: string, url: string, supports: string): ClimateSource => ({ label, url, supports });

export const NORTHEAST_STATES: NortheastState[] = [
  {
    code: 'AL', name: 'Alagoas',
    forecast: source('SEMARH-AL — previsão e monitoramento', 'https://meteorologia.semarh.al.gov.br/', 'Acompanhe as condições atualizadas do estado.'),
    zones: [{ name: 'Estado (janela de atenção a chuvas intensas)', places: 'Faixa costeira e interior; referência de planejamento de risco', months: [3, 4, 5, 6, 7], periodLabel: 'segunda quinzena de abril a primeira quinzena de agosto', source: source('CBMAL — plano operacional da quadra chuvosa 2026', 'https://www.bombeiros.al.gov.br/noticias/view/4315/corpo-de-bombeiros-militar-de-alagoas-apresenta-a-imprensa-o-plano-ope', 'O plano estadual usa esta janela para organizar resposta a ocorrências de chuva intensa e a descreve como historicamente recorrente; é uma referência operacional, não uma climatologia municipal.') }],
  },
  {
    code: 'BA', name: 'Bahia',
    forecast: source('INEMA — meteorologia e monitoramento', 'https://www.ba.gov.br/inema/paginas', 'Acesse previsão, mapas e monitoramento de chuva da Bahia.'),
    zones: [
      { name: 'Litoral e faixa Leste', places: 'Salvador, Recôncavo e costa', months: [3, 4, 5, 6], periodLabel: 'abril a julho (com variação local)', source: source('INEMA — climatologia por setor da Bacia Itapicuru', 'https://www.ba.gov.br/inema/sites/site-inema/files/2025-12/TERMO_ALOCACAO__PINDOBACU_PONTONOVO_2025_2026.pdf', 'No recorte costeiro descrito pelo INEMA, os maiores índices de chuva ocorrem de abril a julho, regime apontado como semelhante ao restante da costa Leste.') },
      { name: 'Setor Centro-Oeste (Bacia Itapicuru)', places: 'Recorte do interior baiano', months: [10, 11, 0, 1, 2, 3], periodLabel: 'novembro a abril (recorte da bacia)', source: source('INEMA — climatologia por setor da Bacia Itapicuru', 'https://www.ba.gov.br/inema/sites/site-inema/files/2025-12/TERMO_ALOCACAO__PINDOBACU_PONTONOVO_2025_2026.pdf', 'O documento indica novembro a abril como principal período chuvoso do setor centro-oeste dessa bacia; outras áreas do interior têm calendário próprio.') },
    ],
  },
  {
    code: 'CE', name: 'Ceará',
    forecast: source('FUNCEME — previsão e monitoramento', 'https://www.funceme.br/', 'Acompanhe previsão, boletins e dados de chuva no Ceará.'),
    zones: [{ name: 'Estado (quadra principal)', places: 'Litoral, serras e Sertão; a distribuição varia', months: [1, 2, 3, 4], periodLabel: 'fevereiro a maio', source: source('FUNCEME — período de chuvas do Ceará', 'https://www.funceme.br/?p=843', 'A quadra chuvosa estadual vai de fevereiro a maio; março e abril costumam ter maiores médias, mas os volumes variam entre regiões.') }],
  },
  {
    code: 'MA', name: 'Maranhão',
    forecast: source('SEMA-MA — Sala de Situação', 'https://www.sema.ma.gov.br/programas-ou-campanhas/centro-de-prevencao-de-desastre-ambientais', 'Acompanhe monitoramento meteorológico e hidrológico estadual.'),
    zones: [
      { name: 'Norte e litoral', places: 'São Luís, Lençóis Maranhenses e costa', months: [0, 1, 2, 3, 4, 5], periodLabel: 'janeiro a junho', source: source('SEMA-MA — As chuvas no Maranhão', 'https://www.sema.ma.gov.br/noticias/as-chuvas-no-maranhao', 'A caracterização estadual indica período chuvoso de janeiro a junho no Norte/litoral.') },
      { name: 'Sul do Maranhão', places: 'Chapadas e região de Balsas', months: [9, 10, 11, 0, 1, 2], periodLabel: 'outubro a março (aproximadamente)', source: source('SEMA-MA — As chuvas no Maranhão', 'https://www.sema.ma.gov.br/noticias/as-chuvas-no-maranhao', 'A caracterização estadual indica período chuvoso aproximadamente de outubro a março no Sul.') },
    ],
  },
  {
    code: 'PB', name: 'Paraíba',
    forecast: source('AESA — previsão do tempo', 'https://www.aesa.pb.gov.br/previsao-do-tempo/', 'Previsão diária por região e municípios paraibanos.'),
    zones: [
      { name: 'Alto Sertão', places: 'Sousa e Cajazeiras', months: [0, 1, 2, 3], periodLabel: 'janeiro a abril', source: source('AESA — Atlas Pluviométrico da Paraíba', 'https://www.aesa.pb.gov.br/aesa-lanca-atlas-pluviometrico-e-estabelece-nova-climatologia-da-paraiba/', 'O Atlas, com séries de 1994 a 2023, indica esta quadra para o Alto Sertão.') },
      { name: 'Sertão, Cariri e Curimataú', places: 'Patos, Cabaceiras e Pocinhos', months: [1, 2, 3, 4], periodLabel: 'fevereiro a maio', source: source('AESA — Atlas Pluviométrico da Paraíba', 'https://www.aesa.pb.gov.br/aesa-lanca-atlas-pluviometrico-e-estabelece-nova-climatologia-da-paraiba/', 'O Atlas, com séries de 1994 a 2023, indica esta quadra para estas regiões.') },
      { name: 'Litoral, Brejo e Agreste', places: 'João Pessoa, Conde, Areia e Campina Grande', months: [3, 4, 5, 6], periodLabel: 'abril a julho', source: source('AESA — Atlas Pluviométrico da Paraíba', 'https://www.aesa.pb.gov.br/aesa-lanca-atlas-pluviometrico-e-estabelece-nova-climatologia-da-paraiba/', 'O Atlas, com séries de 1994 a 2023, indica esta quadra para estas regiões.') },
    ],
  },
  {
    code: 'PE', name: 'Pernambuco',
    forecast: source('APAC — previsão e monitoramento', 'https://www.apac.pe.gov.br/', 'Consulte previsão e boletins meteorológicos e hidrológicos do estado.'),
    zones: [
      { name: 'Litoral e Zona da Mata', places: 'Recife, Olinda e litoral', months: [4, 5, 6, 7], periodLabel: 'maio a agosto (faixa costeira)', source: source('APAC — Plano Estadual de Recursos Hídricos', 'https://www.apac.pe.gov.br/images/media/1569523011_PERHPE_volume8.pdf', 'O documento descreve chuvas de leste entre maio e agosto no litoral e Zona da Mata; há variação anual e local.') },
      { name: 'Agreste', places: 'Caruaru, Garanhuns e entorno', months: [1, 2, 3, 4, 5, 6], periodLabel: 'fevereiro a julho', source: source('APAC — Plano Estadual de Recursos Hídricos', 'https://www.apac.pe.gov.br/images/media/1569523011_PERHPE_volume8.pdf', 'O documento indica fevereiro a julho para o Agreste, com maiores volumes em abril e maio.') },
      { name: 'Sertão', places: 'Sertão Central e São Francisco', months: [11, 0, 1, 2, 3, 4], periodLabel: 'dezembro a maio (com exceções locais)', source: source('APAC — Plano Estadual de Recursos Hídricos', 'https://www.apac.pe.gov.br/images/media/1569523011_PERHPE_volume8.pdf', 'O documento indica dezembro a maio no Sertão; algumas áreas, como Petrolina, têm janela mais curta.') },
    ],
  },
  {
    code: 'PI', name: 'Piauí',
    forecast: source('SEMARH-PI — boletins meteorológicos', 'https://www.semarh.pi.gov.br/meteorologia/boletins', 'Boletins mensais, mapas e monitoramento de chuva no Piauí.'),
    zones: [
      { name: 'Centro-Norte', places: 'Teresina, litoral e norte do estado', months: [11, 0, 1, 2, 3, 4], periodLabel: 'dezembro a maio; maiores chuvas entre janeiro e março', source: source('SEMARH-PI — boletins climáticos', 'https://www.semarh.pi.gov.br/meteorologia/boletins/trimestrais', 'Os informes descrevem estação chuvosa no primeiro semestre e destacam diferenças entre regiões.') },
      { name: 'Sudoeste piauiense', places: 'Gilbués e Alto Parnaíba', months: [10, 11, 0, 1, 2], periodLabel: 'novembro a março (recorte do Sudoeste)', source: source('SEMARH-PI — caracterização de área protegida no Sudoeste', 'https://siga.semarh.pi.gov.br/media/ucs/uc_files/2026/01/20/2af7ae40-2d73-4e85-8cee-e04b1222030d.pdf', 'Para esta área protegida, a fonte aponta concentração de chuva de novembro a março; outras áreas do Sul podem variar.') },
    ],
  },
  {
    code: 'RN', name: 'Rio Grande do Norte',
    forecast: source('EMPARN — meteorologia e monitoramento', 'https://meteorologia.emparn.rn.gov.br/', 'Monitoramento de chuva, estações e relatórios do estado.'),
    zones: [
      { name: 'Interior', places: 'Seridó, Oeste e Sertão', months: [1, 2, 3, 4], periodLabel: 'fevereiro a maio (período principal)', source: source('ANA — Manual da Sala de Situação do RN', 'https://progestao.ana.gov.br/progestao-1/acompanhamento-programa/aplicacao-dos-recursos/acompanhamento-das-metas-de-cooperacao-federativa/manuais-de-salas-de-situacao/manual-de-operacao-de-sala-de-situacao_rn.pdf', 'O manual indica a quadra de fevereiro a maio para quase todo o estado, com exceção do litoral leste; aplicamos a referência ao interior.') },
      { name: 'Litoral Leste', places: 'Natal e costa oriental', months: [2, 3, 4, 5, 6, 7], periodLabel: 'março a agosto (referência de Natal)', source: source('Prefeitura de Natal — climatologia de precipitação', 'https://www.natal.rn.gov.br/storage/app/media/sempla/Vol_1_-_REL_AREAS_RISCO_-_Final.pdf', 'O estudo municipal descreve a estação chuvosa de Natal de março a agosto. A ANA observa que a chuva no litoral leste pode avançar até agosto; o início varia por local.') },
    ],
  },
  {
    code: 'SE', name: 'Sergipe',
    forecast: source('SEMAC-SE — boletins climáticos', 'https://www.se.gov.br/semac/transparencia/seguranca_hidrica/boletins_climaticos', 'Boletins climáticos, pluviométricos e hidrometeorológicos de Sergipe.'),
    zones: [{ name: 'Litoral e leste sergipano', places: 'Aracaju, litoral e Zona da Mata', months: [3, 4, 5, 6], periodLabel: 'abril a julho (janela de maior atenção)', source: source('Governo de Sergipe — período chuvoso', 'https://www.se.gov.br/agencia/noticias/governo/governo_de_sergipe_reforca_monitoramento_e_acoes_preventivas_para_o_periodo_chuvoso', 'A meteorologia estadual destaca abril a julho para atenção a chuvas; o sertão tem comportamento diferente.') }],
  },
];

export const getStateByCode = (code: string) => NORTHEAST_STATES.find((state) => state.code === code) ?? NORTHEAST_STATES.find((state) => state.code === 'PB')!;

export function isZoneRainyInMonth(zone: ClimateZone, month: number): boolean {
  return zone.months.includes(month);
}

export function monthRainSummary(state: NortheastState, month: number): string {
  const rainyZones = state.zones.filter((zone) => isZoneRainyInMonth(zone, month));
  if (rainyZones.length === 0) return `Em ${state.name}, este mês está fora das janelas sazonais citadas para as regiões listadas. Isso não significa ausência de chuva.`;
  if (rainyZones.length === state.zones.length) return `Em ${state.name}, as referências sazonais das regiões mostradas incluem este mês. Planeje alternativas e confira as condições perto da viagem.`;
  return `Em ${state.name}, as referências sazonais incluem ${rainyZones.map((zone) => zone.name).join(' e ')} neste mês. As demais áreas têm padrões próprios.`;
}

export const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const SEASONAL_DISCLAIMER = 'Estas referências sazonais descrevem recortes históricos ou operacionais citados pelas fontes e não são previsão do ano selecionado. Chuva, sol, vazão, maré, balneabilidade, acesso e segurança variam. Consulte a fonte estadual atualizada e os responsáveis pelo local antes de confirmar uma saída.';
