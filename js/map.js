
// MAPA DE LUGARES JÁ VISITADOS (#visited-map)
// Leaflet + OpenStreetMap (sem chave de API, sem cadastro).

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
  }
];

const buildPopupHTML = (place) => `
  <h3>${place.title}</h3>
  <p>${place.place} · ${place.date}</p>
`;

// "Excursões realizadas" na stats-bar (#sobre): usa o total de pins aqui
// embaixo como fonte

const updateTripsCountStat = () => {
  const statEl = document.querySelector("#stat-trips-count");

  if (!statEl) {
    return;
  }

  statEl.textContent = `+${VISITED_PLACES.length}`;
};

const initVisitedMap = () => {
  const container = document.querySelector("#visited-map");

  if (!container) {
    return;
  }

  // Se a Leaflet não carregou (CDN bloqueado, sem internet no momento etc.),
  // mostra um aviso em vez de deixar o quadro em branco sem explicação 
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

  const map = L.map(container, {
    scrollWheelZoom: false,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(map);

  const markers = VISITED_PLACES.map((place) => {
    const marker = L.marker([place.lat, place.lng]).addTo(map);
    marker.bindPopup(buildPopupHTML(place));
    return marker;
  });

  if (markers.length) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.3));
  } else {
    // Fallback: centraliza no Nordeste caso a lista fique vazia um dia.
    map.setView([-7.5, -35.5], 6);
  }

  // O scroll da página não fica "preso" pelo zoom do mapa — só ativa o
  // zoom por scroll depois que a pessoa clica dentro do mapa de propósito.
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