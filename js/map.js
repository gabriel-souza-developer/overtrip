/* ==========================================================================
   MAPA DE LUGARES JÁ VISITADOS (#visited-map)
   Leaflet + tiles públicas da OpenStreetMap — sem chave de API, sem cadastro.
   ========================================================================== */

const VISITED_PLACES = [
  {
    title: "Praia de Coqueirinho",
    place: "Conde - PB",
    date: "28 de maio de 2023",
    lat: -7.328045235187497,
    lng: -34.796762929152685,
  },
  {
    title: "Cachoeira do Paraíso",
    place: "Bonito - PE",
    date: "14 de abril de 2024",
    lat: -8.472,
    lng: -35.729,
  },
  {
    title: "Camping no Rio do Feijão",
    place: "Barra de Santana - PB",
    date: "22 de julho de 2023",
    lat: -7.535,
    lng: -35.95,
  },
  {
    title: "Olheiro de Pureza",
    place: "Pureza - RN",
    date: "17 de maio de 2026",
    lat: -5.65,
    lng: -35.403,
  },
  {
    title: "Cachoeira de Ouricuri",
    place: "Pilões - PB",
    date: "15 de janeiro de 2023",
    lat: -6.8916354,
    lng: -35.5862838,
  },
  {
    title: "Pedra do Altar",
    place: "Barra de Santana - PB",
    date: "12 de fevereiro de 2023",
    lat: -7.5857649,
    lng: -35.9879145,
  },
  {
    title: "Rio do Feijão",
    place: "Barra de Santana - PB",
    date: "30 de abril de 2023",
    lat: -7.5602347,
    lng: -35.9792986,
  },
  {
    title: "Cachoeira do Roncador",
    place: "Bananeiras - PB",
    date: "27 de agosto de 2023",
    lat: -6.7791497,
    lng: -35.5581909,
  },
  {
    title: "Cachoeira do Pinga",
    place: "Matinhas - PB",
    date: "17 de setembro de 2023",
    lat: -7.1351467,
    lng: -35.7884021,
  },
  {
    title: "Praia do Miriri",
    place: "Lucena - PB",
    date: "22 de outubro de 2023",
    lat: -6.8694627,
    lng: -34.8981823,
  },
  {
    title: "Mirante Curimatã",
    place: "Barra de Santana - PB",
    date: "26 de novembro de 2023",
    lat: -7.5679032,
    lng: -35.9765399,
  },
  {
    title: "Praia de Carapibus",
    place: "João Pessoa - PB",
    date: "28 de janeiro de 2024",
    lat: -7.2991394,
    lng: -34.7993596,
  },
  {
    title: "Cachoeira da Manga",
    place: "Pilões - PB",
    date: "25 de fevereiro de 2024",
    lat: -6.9110862,
    lng: -35.6081999,
  },
  {
    title: "Sítio Riacho Fundo",
    place: "Boa Vista - PB",
    date: "19 de maio de 2024",
    lat: -7.2476346,
    lng: -36.1897822,
  },
  {
    title: "Camping - Cachoeira da Manga",
    place: "Pilões - PB",
    date: "7 de julho de 2024",
    lat: -6.9110862,
    lng: -35.6081999,
  },
  {
    title: "Praia de Tabatinga II",
    place: "Conde - PB",
    date: "25 de agosto de 2024",
    lat: -7.3209205,
    lng: -34.8005527,
  },
  {
    title: "Cachoeira de Ouricuri",
    place: "Pilões - PB",
    date: "29 de setembro de 2024",
    lat: -6.8916354,
    lng: -35.5862838,
  },
  {
    title: "Lagoa Azul",
    place: "Santa Rita - PB",
    date: "23 de fevereiro de 2025",
    lat: -7.15,
    lng: -34.95,
  },
  {
    title: "Cachoeira de Ouricuri",
    place: "Pilões - PB",
    date: "30 de março de 2025",
    lat: -6.8916354,
    lng: -35.5862838,
  },
  {
    title: "Mirante Curimatã",
    place: "Barra de Santana - PB",
    date: "31 de agosto de 2025",
    lat: -7.5679032,
    lng: -35.9765399,
  },
  {
    title: "Barra de Mamanguape",
    place: "Rio Tinto - PB",
    date: "21 de setembro de 2025",
    lat: -6.7783793,
    lng: -34.9224326,
  },
  {
    title: "Balneário Rio Água Viva",
    place: "Areia - PB",
    date: "26 de outubro de 2025",
    lat: -7.0228898,
    lng: -35.6999904,
  },
  {
    title: "Área de Lazer Vegas",
    place: "Queimadas - PB",
    date: "7 de dezembro de 2025",
    lat: -7.3202042,
    lng: -35.942408,
  },
  {
    title: "Rio do Gozo",
    place: "Baía da Traição - PB",
    date: "8 de fevereiro de 2026",
    lat: -6.6685417,
    lng: -35.0291683,
  },
  {
    title: "Cachoeira do Roncador",
    place: "Bananeiras - PB",
    date: "15 de março de 2026",
    lat: -6.7791497,
    lng: -35.5581909,
  },
  {
    title: "Dique De Cabedelo",
    place: "Cabedelo - PB",
    date: "15 de agosto de 2026",
    lat: -6.96104575350527,
    lng: -34.84306725667084,
  },
  {
    title: "Fortaleza de Santa Catarina",
    place: "Cabedelo - PB",
    date: "15 de agosto de 2026",
    lat: -6.969040924975116,
    lng: -34.84027133564893,
  },
  {
    title: "Praia Formosa",
    place: "Cabedelo - PB",
    date: "15 de agosto de 2026",
    lat: -6.971145747428147,
    lng: -34.82810720679983,
  },
];

// Bases da OVERTRIP — pontos de partida das expedições.
const OVERTRIP_HUBS = [
  {
    title: "Campina Grande - PB",
    subtitle: "Ponto de partida",
    code: "CG",
    lat: -7.2384718,
    lng: -35.8958641,
  },
  {
    title: "Pocinhos - PB",
    subtitle: "Ponto de partida",
    code: "PC",
    lat: -7.077597792300147,
    lng: -36.060032319318815,
  },
];

const PIN_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/>
    <circle cx="12" cy="10" r="2.5"/>
  </svg>
`;

// Zoom aplicado ao clicar num item da lista ou num pin.
const MAP_SELECT_ZOOM = 12;

/* ==========================================================================
   MONTAGEM DOS DADOS: destinos únicos + popups
   ========================================================================== */

// Agrupa VISITED_PLACES por coordenada (arredondada a 3 casas, ~110m de
// tolerância) — visitas em datas diferentes ao MESMO lugar (ex: Cachoeira
// de Ouricuri em 2023, 2024 e 2025) viram um destino só, com todas as datas
// listadas no popup. Evita pins empilhados um em cima do outro e é a mesma
// lista usada na sidebar "Destinos & roteiros".
const getUniqueDestinations = () => {
  const byCoordinate = new Map();

  VISITED_PLACES.forEach((visit) => {
    const key = `${visit.lat.toFixed(3)},${visit.lng.toFixed(3)}`;

    if (!byCoordinate.has(key)) {
      byCoordinate.set(key, {
        title: visit.title,
        place: visit.place,
        lat: visit.lat,
        lng: visit.lng,
        visits: [visit],
      });
    } else {
      byCoordinate.get(key).visits.push(visit);
    }
  });

  return Array.from(byCoordinate.values());
};

const buildPopupHTML = (destination) => {
  if (destination.isHub) {
    return `<h3>${destination.title}</h3><p>${destination.subtitle}</p>`;
  }

  const dates = destination.visits.map((visit) => visit.date).join(" · ");
  return `
    <h3>${destination.title}</h3>
    <p>${destination.place}</p>
    <p class="popup-dates">${dates}</p>
  `;
};

/* ==========================================================================
   PINS E SIDEBAR
   ========================================================================== */

// Pin customizado (substitui o marcador azul padrão do Leaflet pelas cores
// da marca). Hubs usam uma variante maior e escura, com a sigla (code)
// dentro; destinos usam um ponto pequeno com anel/glow ao redor (ver
// .overtrip-pin no CSS) — o tamanho "visual" vem do box-shadow, não da
// caixa do ícone, por isso iconSize é só o pontinho em si (10px).
const createPinIcon = (entry) =>
  L.divIcon({
    className: "overtrip-pin-icon",
    html: `<span class="overtrip-pin ${entry.isHub ? "overtrip-pin--hub" : ""}">${entry.isHub ? entry.code : ""}</span>`,
    iconSize: entry.isHub ? [30, 30] : [10, 10],
    iconAnchor: entry.isHub ? [15, 15] : [5, 5],
    popupAnchor: [0, entry.isHub ? -18 : -16],
  });

const updateDestinationsCountBadge = (count) => {
  const badgeEl = document.querySelector("#map-destinations-count");

  if (!badgeEl) {
    return;
  }

  badgeEl.textContent = `${count} destino${count === 1 ? "" : "s"}`;
};

const buildSidebarItemHTML = (entry, index) => `
  <button
    type="button"
    class="map-destination${entry.isHub ? " is-hub" : ""}"
    data-destination-index="${index}"
  >
    <span class="map-destination-info">
      <span class="map-destination-icon" aria-hidden="true">${entry.isHub ? entry.code : PIN_ICON_SVG}</span>
      <span class="map-destination-text">
        <span class="map-destination-title">${entry.title}</span>
        <span class="map-destination-subtitle">${entry.isHub ? entry.subtitle : entry.place}</span>
      </span>
    </span>
    <span class="map-destination-action">Ver no mapa</span>
  </button>
`;

// "+N expedições já rolaram" na stats-bar — conta cada visita individual
// (repetir um lugar em datas diferentes também conta).
const updateTripsCountStat = () => {
  const statEl = document.querySelector("#stat-trips-count");

  if (!statEl) {
    return;
  }

  statEl.textContent = `+${VISITED_PLACES.length}`;
};

/* ==========================================================================
   INICIALIZAÇÃO DO MAPA
   ========================================================================== */

const initVisitedMap = () => {
  const container = document.querySelector("#visited-map");
  const sidebarList = document.querySelector("#map-destinations-list");

  if (!container) {
    return;
  }

  // Se a Leaflet não carregou (CDN bloqueado, sem internet no momento etc.),
  // mostra um aviso em vez de deixar o quadro em branco sem explicação.
  if (typeof L === "undefined") {
    console.warn(
      "[map.js] A biblioteca Leaflet não carregou — verifique se " +
      "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js está acessível " +
      "(aba Rede do DevTools) e se nenhum bloqueador de conteúdo está " +
      "impedindo o carregamento."
    );
    container.classList.add("visited-map-error");
    container.textContent = "Não foi possível carregar o mapa agora. Tente recarregar a página.";
    return;
  }

  const destinations = getUniqueDestinations();
  updateDestinationsCountBadge(destinations.length);

  // Bases primeiro (topo da lista/mapa), depois os destinos únicos.
  const entries = [
    ...OVERTRIP_HUBS.map((hub) => ({ ...hub, isHub: true })),
    ...destinations,
  ];

  const map = L.map(container, {
    scrollWheelZoom: false,
  });

  // Tiles públicas da OpenStreetMap — sem chave de API. (A CARTO, usada
  // antes, passou a exigir cadastro/chave para o estilo "Voyager".)
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: "abc",
    maxZoom: 19,
  }).addTo(map);

  const markers = entries.map((entry) => {
    const marker = L.marker([entry.lat, entry.lng], {
      icon: createPinIcon(entry),
    }).addTo(map);
    marker.bindPopup(buildPopupHTML(entry));
    return marker;
  });

  if (markers.length) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.25));
  } else {
    // Fallback: centraliza no Nordeste.
    map.setView([-7.5, -35.5], 6);
  }

  const sidebarButtons = [];

  if (sidebarList) {
    sidebarList.innerHTML = entries.map(buildSidebarItemHTML).join("");
    sidebarButtons.push(...sidebarList.querySelectorAll(".map-destination"));
  }

  // Marca visualmente (na lista e no pin) qual destino está selecionado.
  const setActiveIndex = (index) => {
    sidebarButtons.forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.destinationIndex) === index);
    });
    markers.forEach((marker, markerIndex) => {
      marker
        .getElement()
        ?.querySelector(".overtrip-pin")
        ?.classList.toggle("overtrip-pin--active", markerIndex === index);
    });
  };

  // Clicar num item da lista ou num pin dá zoom até lá e abre o popup.
  const selectEntry = (index) => {
    const entry = entries[index];
    const marker = markers[index];

    if (!entry || !marker) {
      return;
    }

    map.flyTo([entry.lat, entry.lng], MAP_SELECT_ZOOM, { duration: 0.8 });
    marker.openPopup();
    setActiveIndex(index);
  };

  sidebarButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectEntry(Number(button.dataset.destinationIndex));
    });
  });

  markers.forEach((marker, index) => {
    marker.on("click", () => selectEntry(index));
  });

  // O scroll da página não fica "preso" pelo zoom do mapa — só ativa o zoom
  // por scroll depois que a pessoa clica dentro do mapa de propósito.
  container.addEventListener("click", () => {
    map.scrollWheelZoom.enable();
  });
};

const initPage = () => {
  updateTripsCountStat();
  initVisitedMap();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPage);
} else {
  initPage();
}