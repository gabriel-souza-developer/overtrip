const TRIPS = [];
let tripsLoadError = null;

const TRIPS_API_URL = "/api/public/trips";
const TRIPS_FALLBACK_URL = "/trips.json";
const TRIPS_API_TIMEOUT_MS = 3000;

// Lê um endereço e devolve um array de trips; qualquer outra coisa (erro de
// rede, HTTP != 2xx, HTML, objeto) vira exceção.
const requestTripsArray = async (fetchFn, url, signal) => {
  const response = await fetchFn(url, { cache: "no-cache", signal });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const payload = await response.json();

  if (!Array.isArray(payload)) {
    throw new Error(`A resposta de ${url} não é um array válido.`);
  }

  return payload;
};

// Lê da API (com tempo limite); se falhar, cai para /trips.json e avisa no
// console. Array vazio da API é resposta válida (nada publicado).
const fetchTripsWithFallback = async (fetchFn, { timeoutMs = TRIPS_API_TIMEOUT_MS, warn = console.warn } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await requestTripsArray(fetchFn, TRIPS_API_URL, controller.signal);
  } catch (error) {
    warn(`[OVERTRIP] API de trips indisponível (${error?.message || error}); usando ${TRIPS_FALLBACK_URL}.`);
    return requestTripsArray(fetchFn, TRIPS_FALLBACK_URL);
  } finally {
    clearTimeout(timer);
  }
};

const loadTrips = async () => {
  if (TRIPS.length > 0) {
    return TRIPS;
  }

  try {
    // A home já dispara a requisição no <head> (ver index.html) e entrega o
    // array pronto; aqui só reaproveita. Nas demais páginas, ou se ela
    // falhou, busca normalmente (API e, se preciso, /trips.json).
    const early = window.__tripsRequest ? await window.__tripsRequest : null;
    window.__tripsRequest = null;
    const payload = Array.isArray(early) ? early : await fetchTripsWithFallback(fetch.bind(globalThis));

    TRIPS.splice(0, TRIPS.length, ...payload);
    tripsLoadError = null;
    return TRIPS;
  } catch (error) {
    tripsLoadError = error;
    console.error("[OVERTRIP] Não foi possível carregar as trips.", error);
    return TRIPS;
  }
};

const getTripsLoadError = () => tripsLoadError;

// Memórias: toda trip realizada entra aqui. `dateISO` (AAAA-MM-DD) ordena a
// galeria da mais recente para a mais antiga; `date` é só o texto exibido.
const GALLERY = [
  {
    title: "Praia de Coqueirinho - Conde - PB",
    date: "28 de maio de 2023",
    dateISO: "2023-05-28",
    description: "Praia, falésias e um dia inteiro no litoral sul da Paraíba.",
    images: [
      { src: "assets/images/coqueirinho-conde-pb/coqueirinho-pb-vista-aerea.jpg", alt: "Vista aérea da faixa de areia, do mar e dos coqueiros na praia de Coqueirinho" },
      { src: "assets/images/coqueirinho-conde-pb/coqueirinho-pb-guarda-sols.jpg", alt: "Guarda-sóis coloridos e banhistas na faixa de areia de Coqueirinho" },
    ],
  },
  {
    title: "Cachoeira do Paraíso - Bonito - PE",
    date: "14 de abril de 2024",
    dateISO: "2024-04-14",
    description: "Trilha e banho de cachoeira em Bonito, Pernambuco.",
    images: [
      { src: "assets/images/bonito-pe/bonito-pe-cachoeira-paraiso-piscina-natural.jpg", alt: "Queda d'água em piscinas naturais cercadas pela vegetação" },
      { src: "assets/images/bonito-pe/bonito-pe-cachoeira-paraiso-queda-dagua.jpg", alt: "Cachoeira em meio à mata fechada" },
    ],
  },
  {
    title: "Camping no Rio do Feijão - Barra de Santana - PB",
    date: "22 de julho de 2023",
    dateISO: "2023-07-22",
    description: "Acampamento às margens do Rio do Feijão, com fogueira e céu aberto.",
    images: [
      { src: "assets/images/rio-do-feijao-barra-de-santana-pb/rio-do-feijao-pb-camping-tendas.jpg", alt: "Barracas montadas no camping às margens do Rio do Feijão" },
      { src: "assets/images/rio-do-feijao-barra-de-santana-pb/rio-do-feijao-pb-camping-entardecer.jpg", alt: "Barracas montadas à beira do rio ao entardecer" },
      { src: "assets/images/rio-do-feijao-barra-de-santana-pb/rio-do-feijao-pb-ceu-estrelado.jpg", alt: "Estrelas à noite" },
    ],
  },
  {
    title: "Olheiro de Pureza - RN",
    date: "17 de maio de 2026",
    dateISO: "2026-05-17",
    description: "Um dia de banho nas águas cristalinas do Olheiro de Pureza.",
    images: [
      { src: "assets/images/olheiro-de-pureza-rn/olheiro-pureza-rn-grupo.jpg", alt: "Grupo de viajantes no olheiro de Pureza" },
      { src: "assets/images/olheiro-de-pureza-rn/olheiro-pureza-rn-banho.jpg", alt: "Olheiro de Pureza em meio à vegetação natural" },
      { src: "assets/images/olheiro-de-pureza-rn/olheiro-pureza-rn-nascente-azul.jpg", alt: "Nascente de águas cristalinas entre as pedras" },
    ],
  },
  {
    title: "Expedição Bonito - PE",
    date: "13 de setembro de 2026",
    dateISO: "2026-09-13",
    description: "Cachoeiras, piscinas naturais e aventura no Camping do Mágico.",
    images: [
      { src: "assets/images/bonito-pe/bonito-pe-cachoeira-paraiso-piscina-natural.jpg", alt: "Cachoeira formando piscinas naturais em Bonito, Pernambuco" },
      { src: "assets/images/bonito-pe/bonito-pe-camping-do-magico-tirolesa.jpg", alt: "Tirolesa sobre a mata no Camping do Mágico" },
      { src: "assets/images/bonito-pe/bonito-pe-teleferico-por-do-sol.jpg", alt: "Teleférico ao pôr do sol em Bonito, Pernambuco" },
      { src: "assets/images/bonito-pe/bonito-pe-riacho-restaurante.jpg", alt: "Riacho com queda d'água em Bonito, Pernambuco" },
    ],
  },
  {
    title: "OVER RIDERS: Cachoeira do Pinga - PB",
    date: "20 de setembro de 2026",
    dateISO: "2026-09-20",
    description: "Um roteiro de estrada, trilha e cachoeira com a comunidade OVER RIDERS.",
    images: [
      { src: "assets/images/riders/over-riders-capa-tema.jpg", alt: "Grupo OVER RIDERS reunido na Cachoeira do Pinga" },
      { src: "assets/images/cachoeira-do-pinga-pb/cachoeira-do-pinga-pb-estrada-moto.jpg", alt: "Moto na estrada durante o roteiro da OVER RIDERS" },
      { src: "assets/images/cachoeira-do-pinga-pb/cachoeira-do-pinga-pb-riders-02.jpg", alt: "Participantes da OVER RIDERS na trilha" },
      { src: "assets/images/cachoeira-do-pinga-pb/cachoeira-do-pinga-pb-pedra-agua.jpg", alt: "Formação de pedra e água na Cachoeira do Pinga" },
    ],
  },
  {
    title: "Trilha em Lucena - PB",
    date: "18 de outubro de 2026",
    dateISO: "2026-10-18",
    description: "Ruínas da Igreja de Bom Sucesso, rio e mirante na foz do Rio Miriri.",
    images: [
      { src: "assets/images/trilha-em-lucena-pb/trilha-em-lucena-pb-ruinas-bom-sucesso.jpg", alt: "Ruínas da Igreja de Bom Sucesso em Lucena - PB" },
      { src: "assets/images/trilha-em-lucena-pb/trilha-em-lucena-pb-rio-caboclo.jpg", alt: "Trecho do Rio Caboclo cercado pela vegetação em Lucena - PB" },
      { src: "assets/images/trilha-em-lucena-pb/trilha-em-lucena-pb-foz-rio-miriri.jpg", alt: "Foz do Rio Miriri em Lucena - PB" },
      { src: "assets/images/trilha-em-lucena-pb/mirante-de-lucena-no-final-da-trilha-pb.jpg", alt: "Vista do Mirante de Lucena ao final da trilha" },
    ],
  },
];

// rating vai de 1 a 5 — o carrossel desenha as estrelas a partir daqui.
const TESTIMONIALS = [
  {
    name: "Anna",
    place: "Barra de Santana - 2024",
    rating: 5,
    quote: "Entrei sem conhecer ninguém e, no fim da viagem, parecia que já fazia parte do grupo há muito tempo.",
  },
  {
    name: "Lívia",
    place: "Pedreira de Boa Vista - 2024",
    rating: 5,
    quote: "Viajar em grupo sempre me deixava insegura, mas me senti muito à vontade. Com certeza quero participar das próximas.",
  },
  {
    name: "Helton",
    place: "Pedra do Altar - 2025",
    rating: 5,
    quote: "Toda viagem com vocês é muito boa, galera tranquila, me sinto muito à vontade.",
  },
  {
    name: "Mateus",
    place: "Cachoeira do Paraíso, Bonito - PE - 2024",
    rating: 5,
    quote: "Achei que ia só conhecer a cachoeira, mas o melhor acabou sendo a convivência com a galera durante os rolês.",
  },
  {
    name: "Diego",
    place: "Camping Rio do Feijão - 2023",
    rating: 5,
    quote: "O que mais gostei foi a forma como todo mundo foi tratado. Dá pra perceber que existe um cuidado genuíno com quem viaja.",
  },
];

export { TRIPS, GALLERY, TESTIMONIALS, loadTrips, getTripsLoadError, fetchTripsWithFallback };
