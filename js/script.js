document.body.classList.remove("no-js");
document.body.classList.add("js");

// Próximas trips, galeria de memórias e depoimentos ficam centralizados


const TRIPS = [
  {
    title: "Excursão | Bonito - PE",
    category: "Cachoeiras, Piscinas e atividades radicais",
  
    description: "Day use no Camping do Mágico: cachoeiras, piscinas naturais, teleférico e um dia inteiro de lazer saindo de Campina Grande.",
    city: "Bonito",
    region: "PE",
    month: "SET",
    returnTime: "17h",
    meetingCity: "Campina Grande - PB",
    meetingPoint: "Rodoviária Nova",
    meetingMapsQuery: "Rodoviária Nova, Campina Grande - PB",
    priceDisplay: "R$ 165,00",
    priceUnit: "por pessoa",
    priceValue: "165.00",
    intensityClass: "leve",
    intensityLabel: "Intensidade leve",
    includes: [
      "Cachoeiras e piscinas naturais",
      "Piscinas cloradas (adulto e infantil)",
      "Bar e restaurante no local",
      "Esportes radicais disponíveis à parte (tirolesa, rapel, arvorismo)",
    ],
    includesHighlight: "Taxa day use, transporte categoria turismo, seguro de viagem e assistência da equipe OVERTRIP já inclusos.",

    images: [
      { src: "assets/images/bonito-riacho-restaurante.jpg", alt: "Piscina natural de águas claras em Bonito - PE" },
      { src: "assets/images/cachoeira-do-paraiso-piscina-natural.jpg", alt: "Piscina natural de águas claras em Bonito - PE" },
      { src: "assets/images/por_sol_teleferico_pernambuco.jpg", alt: "Teleférico em Bonito - PE" },
      { src: "assets/images/tirolesa-capimgdomagico.jpg", alt: "Atividades radicais no camping do mágico" },
       { src: "assets/images/Seja bem vindo-bonito.jpg", alt: "Seja bem-vindo a Bonito - PE" },
       { src: "assets/images/piscina-capimgdomagico.jpg", alt: "Piscina natural de águas claras em Bonito - PE" },
    ],
    buttonLabel: "Reservar",
    buttonClass: "button-dark",
    waMessage: "Fala! Tenho interesse na excursão a Bonito - PE (13/09/2026) e quero saber mais detalhes.",
   
    startDateISO: "2026-09-13T03:30:00-03:00",
    availabilitySchema: "https://schema.org/InStock",
  },
];

const GALLERY = [
  {
    title: "Praia de Coqueirinho - Conde - PB",
    date: "28 de maio de 2023",
    description: "Um dia de praia, estrada e boas lembranças para levar na bagagem.",
    images: [
      { src: "assets/images/coqueirinho-praia-vista-aerea.jpg", alt: "Pôr do sol na praia com grupo de amigos em clima de descontração" },
      { src: "assets/images/coqueirinho-praia-guarda-sols.jpg", alt: "Falésias e mar na praia" },

    ],
  },
  {
    title: "Cachoeira do Paraíso - Bonito - PE",
    date: "14 de abril de 2024",
    description: "Trilha, cachoeira e um lugar que faz a gente desacelerar",
    images: [
      { src: "assets/images/cachoeira-do-paraiso-piscina-natural.jpg", alt: "Cachoeira com piscina natural em meio à vegetação, vista de cima" },
      { src: "assets/images/cachoeira-do-paraiso-queda-dagua.jpg", alt: "Cachoeira em meio à mata fechada" },
    ],
  },
  {
    title: "Camping no Rio do Feijão - Barra de Santana - PB",
    date: "22 de julho de 2023",
    description: "Fogueira, céu estrelado e a simplicidade de estar presente",
    images: [
      { src: "assets/images/rio-do-feijao-camping-tendas.jpg", alt: "Camping à beira de rio com grupo de amigos em clima de descontração" },
      { src: "assets/images/rio-do-feijao-camping-entardecer.jpg", alt: "Barracas montadas à beira do rio ao entardecer" },
      { src: "assets/images/rio-do-feijao-ceu-estrelado.jpg", alt: "Estrelas à noite" },
    ],
  },
  {
    title: "Olheiro de Pureza - RN",
    date: "17 de maio de 2026",
    description: "Águas cristalinas, risadas e uma viagem para guardar na memória.",
    images: [
      { src: "assets/images/pureza-olheiro-grupo.jpg", alt: "Grupo de viajantes no olheiro de Pureza" },
      { src: "assets/images/pureza-olheiro-banho.jpg", alt: "Olheiro de Pureza em meio à vegetação natural" },
      { src: "assets/images/pureza-nascente-azul.jpg", alt: "Nascente de águas cristalinas entre as pedras" },
    ],
  },
];

// Depoimentos: rating de 1 a 5. 
const TESTIMONIALS = [
  {
    name: "Anna",
    place: "Barra de Santana - 2024",
    rating: 5,
    quote: "Entrei sem conhecer ninguém e, no fim da viagem, parecia que já fazia parte do grupo há muito tempo."
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


// RENDER: Próxima trip (cards + schema.org gerado a partir do mesmo dado)


const formatTripDate = (isoString) => {
  const date = new Date(isoString);
  const datePart = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(date);
  const weekday = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    timeZone: "America/Sao_Paulo",
  }).format(date);
  return `${datePart} (${weekday})`;
};

const formatTripTime = (isoString) => {
  const date = new Date(isoString);
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(date);
  return formatted.replace(":", "h");
};

// matemática (data de hoje vs. data da trip), não estimativa.
const getCountdownBadge = (trip) => {
  const tripDate = new Date(trip.startDateISO);
  const today = new Date();

  // Zera a hora dos dois lados pra contar em dias de calendário cheios,
  // não em blocos de 24h exatas (evita "faltam 0 dias" na véspera à noite).
  const tripMidnight = new Date(tripDate.getFullYear(), tripDate.getMonth(), tripDate.getDate());
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysLeft = Math.round((tripMidnight - todayMidnight) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return { label: "Vagas encerradas", statusClass: "soon" };
  }
  if (daysLeft === 0) {
    return { label: "É hoje!", statusClass: "last" };
  }
  if (daysLeft === 1) {
    return { label: "Falta 1 dia", statusClass: "last" };
  }
  if (daysLeft <= 7) {
    return { label: `Faltam ${daysLeft} dias`, statusClass: "last" };
  }
  return { label: `Faltam ${daysLeft} dias`, statusClass: "open" };
};

const TRIP_ICON_CALENDAR = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
  </svg>
`;
const TRIP_ICON_CLOCK = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
  </svg>
`;
const TRIP_ICON_PIN = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>
  </svg>
`;
const TRIP_ICON_CHECK_CIRCLE = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.3 2.3 4.7-4.8"/>
  </svg>
`;
const TRIP_ICON_SHIELD = `
 <svg fill="#000000" width="800px" height="800px" viewBox="-4 -2 24 24" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin" class="jam jam-shield-check"><path d='M2 4.386V8a9.02 9.02 0 0 0 3.08 6.787L8 17.342l2.92-2.555A9.019 9.019 0 0 0 14 8V4.386l-6-2.25-6 2.25zM.649 2.756L8 0l7.351 2.757a1 1 0 0 1 .649.936V8c0 3.177-1.372 6.2-3.763 8.293L8 20l-4.237-3.707A11.019 11.019 0 0 1 0 8V3.693a1 1 0 0 1 .649-.936zm6.29 7.512l3.536-3.536a1 1 0 0 1 1.414 1.414L7.646 12.39a1 1 0 0 1-1.414 0l-2.121-2.121a1 1 0 0 1 1.414-1.414l1.414 1.414z'/></svg>
`;
const PIX_BUTTON_ICON = `
  <svg class="button-pix-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
    <path d="M14 14h3v3h-3ZM19 14h2M14 19h2M19 19h2"/>
  </svg>
`;

const buildTripCardHTML = (trip, tripIndex) => {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.meetingMapsQuery)}`;
  const includesHTML = trip.includes
    .map((item) => `<li><span class="trip-includes-icon" aria-hidden="true">${TRIP_ICON_CHECK_CIRCLE}</span><span>${item}</span></li>`)
    .join("");
  const countdown = getCountdownBadge(trip);
  const dateDisplay = formatTripDate(trip.startDateISO);
  const departure = formatTripTime(trip.startDateISO);
  // "Intensidade leve" -> "leve", só pro selo compacto sobre a imagem
  // ("NÍVEL: LEVE"); o texto completo continua disponível em trip.intensityLabel.
  const levelWord = trip.intensityLabel.replace(/^Intensidade\s*/i, "");

  const cover = trip.images[0];
  const extraCount = trip.images.length - 1;
  const photoBadge = extraCount > 0
    ? `<span class="gallery-photo-count">+${extraCount} foto${extraCount > 1 ? "s" : ""}</span>`
    : "";

  return `
    <article class="trip-card reveal" data-month="${trip.month}">
      <div
        class="trip-media"
        data-trip-index="${tripIndex}"
        tabindex="0"
        role="button"
        aria-label="Ver fotos de ${trip.title}"
      >
        <img src="${cover.src}" alt="${cover.alt}" loading="lazy" decoding="async">
        <span class="trip-media-category">${trip.category}</span>
        <span class="trip-media-status ${countdown.statusClass}">${countdown.label}</span>
        <span class="trip-media-intensity">Nível: ${levelWord}</span>
        ${photoBadge}
      </div>
      <div class="trip-body">
        <h3>${trip.title}</h3>
        <p class="trip-description">${trip.description}</p>

        <div class="trip-meta-list">
          <div class="trip-meta-row">
            <span class="trip-meta-icon" aria-hidden="true">${TRIP_ICON_CALENDAR}</span>
            <span>${dateDisplay}</span>
          </div>
          <div class="trip-meta-row">
            <span class="trip-meta-icon trip-meta-icon--muted" aria-hidden="true">${TRIP_ICON_CLOCK}</span>
            <span>${departure} às ${trip.returnTime}</span>
          </div>
          <div class="trip-meta-row">
            <span class="trip-meta-icon trip-meta-icon--muted" aria-hidden="true">${TRIP_ICON_PIN}</span>
            <a class="trip-map-link" href="${mapsUrl}" target="_blank" rel="noreferrer">${trip.meetingCity} (${trip.meetingPoint})</a>
          </div>
        </div>

        <details class="trip-includes-toggle">
          <summary><span class="trip-includes-toggle-label">Ver roteiro &amp; o que inclui</span></summary>
          <div class="trip-includes-body">
            <p class="trip-includes-heading">O que você vai viver</p>
            <ul class="trip-includes">${includesHTML}</ul>
            <div class="trip-includes-highlight">
              <span class="trip-includes-highlight-icon" aria-hidden="true">${TRIP_ICON_SHIELD}</span>
              <span>${trip.includesHighlight}</span>
            </div>
          </div>
        </details>

        <div class="trip-footer">
          <div class="trip-price-block">
            <span class="trip-price-info">
              <span class="trip-price-label">Investimento</span>
              <span class="trip-price-unit">${trip.priceUnit}</span>
            </span>
            <span class="trip-price-value">${trip.priceDisplay}</span>
          </div>
          <div class="trip-footer-actions">
            <a
              class="button ${trip.buttonClass} wa-link"
              data-wa-message="${trip.waMessage}"
              href="#"
              target="_blank"
              rel="noreferrer"
            >
              ${trip.buttonLabel}
            </a>
            <button
              type="button"
              class="button button-pix pix-trigger"
              data-pix-trip-index="${tripIndex}"
            >
              ${PIX_BUTTON_ICON}
              Pagar Pix
            </button>
          </div>
        </div>
      </div>
    </article>
  `;
};

const buildTripSchema = (trip) => {
  const schema = {
    "@type": "Event",
    name: `Expedição ${trip.title}`,
    startDate: trip.startDateISO,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: trip.title,
      address: {
        "@type": "PostalAddress",
        addressLocality: trip.city,
        addressRegion: trip.region,
        addressCountry: "BR",
      },
    },
    organizer: { "@type": "Organization", name: "OVERTRIP", url: "https://overtrip.com.br" },
    offers: {
      "@type": "Offer",
      price: trip.priceValue,
      priceCurrency: "BRL",
      availability: trip.availabilitySchema,
      url: "https://overtrip.com.br/#proxima",
    },
  };

  if (trip.endDateISO) {
    schema.endDate = trip.endDateISO;
  }

  return schema;
};

// Um trip "abre vaga" quando ainda não passou da data — mesma regra que já decide o selo "Vagas encerradas" de cada card (getCountdownBadge).
const isTripOpen = (trip) => getCountdownBadge(trip).statusClass !== "soon";

const updateProximaStatus = () => {
  const statusEl = document.querySelector("#proxima-status");

  if (!statusEl) {
    return;
  }

  const hasOpenTrip = TRIPS.some(isTripOpen);
  const label = TRIPS.length === 0
    ? "Nenhuma expedição agendada"
    : hasOpenTrip
      ? "Próximo embarque aberto"
      : "Vagas encerradas por enquanto";

  statusEl.classList.toggle("status-pill-closed", !hasOpenTrip);
  statusEl.innerHTML = `<span></span>${label}`;
};

// Troca o texto do "Ver roteiro & o que inclui" -> "Ocultar detalhes" (e
// vice-versa) conforme cada <details> do card é aberto/fechado. Cada card
// é independente — abrir um não fecha os outros (diferente do FAQ).
const bindTripIncludesToggles = () => {
  document.querySelectorAll(".trip-includes-toggle").forEach((details) => {
    details.addEventListener("toggle", () => {
      const label = details.querySelector(".trip-includes-toggle-label");
      if (label) {
        label.textContent = details.open ? "Ocultar detalhes" : "Ver roteiro & o que inclui";
      }
    });
  });
};

const renderTrips = () => {
  const grid = document.querySelector("#trip-grid");

  if (!grid) {
    return;
  }

  grid.innerHTML = TRIPS.map((trip, index) => buildTripCardHTML(trip, index)).join("");
  updateProximaStatus();
  bindTripIncludesToggles();

  // Schema.org por trip: gerado a partir do mesmo array acima
  const schemaScript = document.createElement("script");
  schemaScript.type = "application/ld+json";
  schemaScript.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": TRIPS.map(buildTripSchema),
  });
  document.head.appendChild(schemaScript);
};

// RENDER: Galeria + lightbox (modal com todas as fotos de cada memória)

const buildGalleryCardHTML = (entry, index) => {
  const cover = entry.images[0];
  const extraCount = entry.images.length - 1;
  const badge = extraCount > 0
    ? `<span class="gallery-photo-count">+${extraCount} foto${extraCount > 1 ? "s" : ""}</span>`
    : "";

  return `
    <article
      class="gallery-card reveal"
      data-gallery-index="${index}"
      tabindex="0"
      role="button"
      aria-label="Ver fotos de ${entry.title}"
    >
      <div class="gallery-image">
        <img src="${cover.src}" alt="${cover.alt}" loading="lazy" decoding="async">
        ${badge}
      </div>
      <div class="gallery-copy">
        <h3>${entry.title}</h3>
        <p>${entry.description}</p>
        <p>${entry.date}</p>
      </div>
    </article>
  `;
};

const renderGallery = () => {
  const grid = document.querySelector("#gallery-grid");

  if (!grid) {
    return;
  }

  grid.innerHTML = GALLERY.map(buildGalleryCardHTML).join("");
};

// Traduz uma trip pro mesmo formato { title, description, images }
const getTripLightboxEntry = (trip) => ({
  title: trip.title,
  description: `${formatTripDate(trip.startDateISO)} · ${trip.priceDisplay}`,
  images: trip.images,
});

const setupLightbox = () => {
  const lightbox = document.querySelector("#gallery-lightbox");
  const galleryGrid = document.querySelector("#gallery-grid");
  const tripGrid = document.querySelector("#trip-grid");

  if (!lightbox || (!galleryGrid && !tripGrid)) {
    return;
  }

  const imageEl = lightbox.querySelector(".lightbox-image");
  const counterEl = lightbox.querySelector(".lightbox-counter");
  const titleEl = lightbox.querySelector(".lightbox-title");
  const descEl = lightbox.querySelector(".lightbox-desc");
  const prevBtn = lightbox.querySelector(".lightbox-prev");
  const nextBtn = lightbox.querySelector(".lightbox-next");

  let currentEntry = null;
  let currentIndex = 0;

  const renderCurrentImage = () => {
    if (!currentEntry) {
      return;
    }

    const image = currentEntry.images[currentIndex];
    imageEl.src = image.src;
    imageEl.alt = image.alt;
    counterEl.textContent = `${currentIndex + 1} / ${currentEntry.images.length}`;
    titleEl.textContent = currentEntry.title;
    descEl.textContent = currentEntry.description;

    const hasMultiple = currentEntry.images.length > 1;
    prevBtn.hidden = !hasMultiple;
    nextBtn.hidden = !hasMultiple;
  };

  const openLightbox = (entry) => {
    currentEntry = entry;
    currentIndex = 0;
    renderCurrentImage();
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("menu-locked");
  };

  const closeLightbox = () => {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.classList.remove("menu-locked");
    currentEntry = null;
  };

  const showNext = () => {
    if (!currentEntry) {
      return;
    }
    currentIndex = (currentIndex + 1) % currentEntry.images.length;
    renderCurrentImage();
  };

  const showPrev = () => {
    if (!currentEntry) {
      return;
    }
    currentIndex = (currentIndex - 1 + currentEntry.images.length) % currentEntry.images.length;
    renderCurrentImage();
  };

  const openFromGalleryCard = (card) => {
    const index = Number(card.dataset.galleryIndex);
    const entry = GALLERY[index];
    if (entry) {
      openLightbox(entry);
    }
  };

  const openFromTripMedia = (media) => {
    const index = Number(media.dataset.tripIndex);
    const trip = TRIPS[index];
    if (trip) {
      openLightbox(getTripLightboxEntry(trip));
    }
  };

  galleryGrid?.addEventListener("click", (event) => {
    const card = event.target.closest(".gallery-card");
    if (card) {
      openFromGalleryCard(card);
    }
  });

  galleryGrid?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const card = event.target.closest(".gallery-card");
    if (!card) {
      return;
    }
    event.preventDefault();
    openFromGalleryCard(card);
  });

  tripGrid?.addEventListener("click", (event) => {
    const media = event.target.closest(".trip-media");
    if (media) {
      openFromTripMedia(media);
    }
  });

  tripGrid?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const media = event.target.closest(".trip-media");
    if (!media) {
      return;
    }
    event.preventDefault();
    openFromTripMedia(media);
  });

  lightbox.querySelectorAll("[data-lightbox-close]").forEach((element) => {
    element.addEventListener("click", closeLightbox);
  });

  nextBtn.addEventListener("click", showNext);
  prevBtn.addEventListener("click", showPrev);

  document.addEventListener("keydown", (event) => {
    if (!lightbox.classList.contains("is-open")) {
      return;
    }
    if (event.key === "Escape") {
      closeLightbox();
    } else if (event.key === "ArrowRight") {
      showNext();
    } else if (event.key === "ArrowLeft") {
      showPrev();
    }
  });
};

// ---------------------------------------------------------------------------
// RENDER: Depoimentos + carrossel (arraste, clique nas setas ou use o mouse)
// ---------------------------------------------------------------------------
const buildTestimonialHTML = (testimonial) => {
  const stars = "★".repeat(testimonial.rating) + "☆".repeat(5 - testimonial.rating);

  return `
    <figure class="quote-card reveal">
      <div class="quote-rating" aria-hidden="true">${stars}</div>
      <span class="quote-mark">"</span>
      <blockquote>${testimonial.quote}</blockquote>
      <figcaption>
        <div>
          <strong>${testimonial.name}</strong>
          <span>${testimonial.place}</span>
        </div>
      </figcaption>
    </figure>
  `;
};

const renderTestimonials = () => {
  const track = document.querySelector("#testimonials-track");

  if (!track) {
    return;
  }

  track.innerHTML = TESTIMONIALS.map(buildTestimonialHTML).join("");
};

const setupTestimonialCarousel = () => {
  const track = document.querySelector("#testimonials-track");
  const prevBtn = document.querySelector(".carousel-prev");
  const nextBtn = document.querySelector(".carousel-next");

  if (!track || !prevBtn || !nextBtn) {
    return;
  }

  const scrollByCard = (direction) => {
    const card = track.querySelector(".quote-card");
    if (!card) {
      return;
    }
    const cardWidth = card.getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(track).columnGap || "16");
    track.scrollBy({ left: direction * (cardWidth + gap), behavior: "smooth" });
  };

  prevBtn.addEventListener("click", () => scrollByCard(-1));
  nextBtn.addEventListener("click", () => scrollByCard(1));

  // Arrastar com o mouse (além do gesto nativo de swipe em touch/trackpad).
  let isDragging = false;
  let dragStartX = 0;
  let scrollStartLeft = 0;

  track.addEventListener("pointerdown", (event) => {
    isDragging = true;
    track.classList.add("is-dragging");
    dragStartX = event.clientX;
    scrollStartLeft = track.scrollLeft;
    track.setPointerCapture(event.pointerId);
  });

  track.addEventListener("pointermove", (event) => {
    if (!isDragging) {
      return;
    }
    track.scrollLeft = scrollStartLeft - (event.clientX - dragStartX);
  });

  const stopDragging = () => {
    isDragging = false;
    track.classList.remove("is-dragging");
  };

  track.addEventListener("pointerup", stopDragging);
  track.addEventListener("pointerleave", stopDragging);
  track.addEventListener("pointercancel", stopDragging);
};

// Renderiza tudo isso ANTES do restante do script, para que os elementos
// (.wa-link, .reveal, .trip-card[data-month]) já existam quando o resto do código for consultá-los abaixo.
// "X anos de comunidade" na stats-bar, calculado a partir do data-year do
// primeiro ponto da timeline (#sobre) — muda um valor, o outro segue junto.
const updateYearsCount = () => {
  const statEl = document.querySelector("#stat-years-count");
  const firstTimelinePoint = document.querySelector(".timeline-point[data-year]");

  if (!statEl || !firstTimelinePoint) {
    return;
  }

  const startYear = Number(firstTimelinePoint.dataset.year);

  if (!startYear) {
    return;
  }

  const years = new Date().getFullYear() - startYear;
  statEl.textContent = years > 0 ? `${years} anos` : "1º ano";
};


// PIX: gera o "Pix Copia e Cola" (BR Code, padrão do Banco Central) a partir da chave abaixo, sem embutir um valor fixo — a pessoa confirma o valor.
// Referência do formato: manual "BR Code" do Bacen (EMV/QRCPS-MPM).

const PIX_KEY = "contato@overtrip.com.br";
const PIX_MERCHANT_NAME = "OVERTRIP";
const PIX_MERCHANT_CITY = "CAMPINA GRANDE";

// Monta um campo TLV (Tag-Length-Value): id de 2 dígitos + tamanho de 2
// dígitos + o valor. É o formato básico de todo campo do BR Code.
const pixField = (id, value) => `${id}${String(value.length).padStart(2, "0")}${value}`;

// CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF) — checksum exigidos pelo Bacen no último campo do payload, senão nenhum app de banco lê o QR.
const crc16ccitt = (payload) => {
  let crc = 0xffff;

  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
};

const buildPixPayload = () => {
  const merchantAccountInfo =
    pixField("00", "br.gov.bcb.pix") + pixField("01", PIX_KEY);

  const additionalData = pixField("05", "***"); // txid genérico ("sem referência")

  const payloadWithoutCrc =
    pixField("00", "01") + // Payload Format Indicator
    pixField("26", merchantAccountInfo) + // Dados da chave Pix
    pixField("52", "0000") + // Merchant Category Code
    pixField("53", "986") + // Moeda: Real (ISO 4217)
    pixField("58", "BR") + // País
    pixField("59", PIX_MERCHANT_NAME.slice(0, 25)) +
    pixField("60", PIX_MERCHANT_CITY.slice(0, 15)) +
    pixField("62", additionalData) +
    "6304"; // ID + tamanho do próprio campo de CRC

  return payloadWithoutCrc + crc16ccitt(payloadWithoutCrc);
};

const setupPixModal = () => {
  const modal = document.querySelector("#pix-modal");
  const tripGrid = document.querySelector("#trip-grid");

  if (!modal || !tripGrid) {
    return;
  }

  const titleEl = modal.querySelector("#pix-modal-title");
  const priceEl = modal.querySelector("#pix-modal-price");
  const qrImage = modal.querySelector("#pix-qr-image");
  const qrFallback = modal.querySelector("#pix-qr-fallback");
  const keyValueEl = modal.querySelector("#pix-key-value");
  const copyBtn = modal.querySelector("#pix-copy-btn");
  const payload = buildPixPayload();
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(payload)}`;

  // Se o QR não carregar (rede bloqueada, provedor fora do ar etc.), esconde
  // a imagem quebrada e mostra o aviso — a chave/código continuam
  // funcionando normalmente, então o pagamento não fica travado por isso.
  if (qrImage) {
    qrImage.addEventListener("error", () => {
      qrImage.classList.add("has-error");
      if (qrFallback) {
        qrFallback.hidden = false;
      }
    });
    qrImage.addEventListener("load", () => {
      qrImage.classList.remove("has-error");
      if (qrFallback) {
        qrFallback.hidden = true;
      }
    });
  }

  const openPixModal = (trip) => {
    if (titleEl) {
      titleEl.textContent = trip.title;
    }
    if (priceEl) {
      priceEl.textContent = `Valor total: ${trip.priceDisplay} (ou o sinal de 50%, conforme política de reserva)`;
    }
    if (qrImage) {
    
      qrImage.classList.remove("has-error");
      if (qrFallback) {
        qrFallback.hidden = true;
      }
      qrImage.src = qrCodeUrl;
    }
    if (keyValueEl) {
      keyValueEl.textContent = PIX_KEY;
    }

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("menu-locked");
  };

  const closePixModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("menu-locked");
  };

  tripGrid.addEventListener("click", (event) => {
    const trigger = event.target.closest(".pix-trigger");
    if (!trigger) {
      return;
    }

    const index = Number(trigger.dataset.pixTripIndex);
    const trip = TRIPS[index];
    if (!trip) {
      return;
    }

    trackPixClick(trip);
    openPixModal(trip);
  });

  modal.querySelectorAll("[data-pix-close]").forEach((element) => {
    element.addEventListener("click", closePixModal);
  });

  document.addEventListener("keydown", (event) => {
    if (!modal.classList.contains("is-open")) {
      return;
    }
    if (event.key === "Escape") {
      closePixModal();
    }
  });

  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(payload);
      copyBtn.textContent = "Código copiado!";
      copyBtn.classList.add("is-copied");
    } catch (error) {
      // Clipboard API pode falhar em contexto não-seguro (http) ou permissão
      // negada — nesse caso a pessoa ainda pode selecionar a chave manualmente.
      console.warn("[pix] Não foi possível copiar automaticamente:", error);
      copyBtn.textContent = "Não deu pra copiar — selecione a chave acima";
    }

    window.setTimeout(() => {
      copyBtn.textContent = "Copiar código Pix";
      copyBtn.classList.remove("is-copied");
    }, 2500);
  });
};

renderTrips();
renderGallery();
renderTestimonials();
updateYearsCount();

// COMPORTAMENTO GERAL DO SITE


const whatsappNumber = "5583987745549";
const waLinks = document.querySelectorAll(".wa-link");
const currentYear = document.querySelector("#current-year");
const revealElements = document.querySelectorAll(".reveal");
const header = document.querySelector(".site-header");
const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".site-nav");
const menuBackdrop = document.querySelector(".menu-backdrop");
const detailsItems = document.querySelectorAll(".faq-item");
const marqueeTrack = document.querySelector(".marquee-track");
const galleryCards = document.querySelectorAll(".gallery-card");
const mediaBlocks = document.querySelectorAll(".media-block");

const setMenuOpen = (isOpen) => {
  if (!menuToggle || !header) {
    return;
  }

  menuToggle.setAttribute("aria-expanded", String(isOpen));
  header.classList.toggle("menu-open", isOpen);
  document.body.classList.toggle("menu-locked", isOpen);
};

// Usado no scroll animado dos links internos do menu.
const easeInOutCubic = (t) => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const animateScrollTo = (targetTop, duration = 850) => {
  const startTop = window.scrollY;
  const distance = targetTop - startTop;
  const startTime = performance.now();

  const step = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeInOutCubic(progress);

    window.scrollTo(0, startTop + distance * easedProgress);

    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };

  window.requestAnimationFrame(step);
};

// Mantém o mesmo efeito hover em cards que também recebem foco pelo teclado.
const bindHoverClass = (elements) => {
  elements.forEach((element) => {
    element.addEventListener("mouseenter", () => {
      element.classList.add("is-hovered");
    });

    element.addEventListener("mouseleave", () => {
      element.classList.remove("is-hovered");
    });

    element.addEventListener("focusin", () => {
      element.classList.add("is-hovered");
    });

    element.addEventListener("focusout", () => {
      element.classList.remove("is-hovered");
    });
  });
};


// Analytics: dispara um evento a cada clique em link de WhatsApp, informando em qual seção da página e em qual card/link o clique aconteceu. Funciona
// com Google Tag Manager (dataLayer) ou GA4 (gtag) — o que já estiver
// instalado no site.

const getWaLinkSection = (link) => {
  if (link.classList.contains("floating-wa")) {
    return "floating_button";
  }

  const section = link.closest("section");
  if (section?.id) {
    return section.id;
  }

  if (link.closest(".site-footer")) {
    return "footer";
  }

  if (link.closest(".site-header")) {
    return "header";
  }

  return "unknown";
};

const trackWhatsAppClick = (link) => {
  const tripCard = link.closest(".trip-card");
  const tripName = tripCard?.querySelector("h3")?.textContent?.trim();

  const eventPayload = {
    event: "whatsapp_click",
    wa_section: getWaLinkSection(link),
    wa_label: link.textContent.trim(),
    wa_trip: tripName || null,
  };

  if (window.dataLayer && typeof window.dataLayer.push === "function") {
    window.dataLayer.push(eventPayload);
  } else if (typeof window.gtag === "function") {
    window.gtag("event", "whatsapp_click", {
      section: eventPayload.wa_section,
      label: eventPayload.wa_label,
      trip: eventPayload.wa_trip,
    });
  } else {
    console.log("[analytics]", eventPayload);
  }
};

const trackPixClick = (trip) => {
  const eventPayload = {
    event: "pix_click",
    pix_trip: trip.title,
  };

  if (window.dataLayer && typeof window.dataLayer.push === "function") {
    window.dataLayer.push(eventPayload);
  } else if (typeof window.gtag === "function") {
    window.gtag("event", "pix_click", { trip: eventPayload.pix_trip });
  } else {
    console.log("[analytics]", eventPayload);
  }
};

waLinks.forEach((link) => {
  // Cada link define sua própria mensagem no atributo data-wa-message.
  const message = link.dataset.waMessage || "";
  const encodedMessage = encodeURIComponent(message);
  const hasConfiguredNumber = /^\d{12,13}$/.test(whatsappNumber);

  link.href = hasConfiguredNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodedMessage}`
    : `https://wa.me/?text=${encodedMessage}`;

  link.addEventListener("click", () => trackWhatsAppClick(link));
});

if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}

if (header) {
  // Aplica fundo no header depois que a página começa a rolar.
  const syncHeader = () => {
    header.classList.toggle("is-solid", window.scrollY > 12);
  };

  syncHeader();
  window.addEventListener("scroll", syncHeader, { passive: true });
}

if (menuToggle && nav && header) {
  menuToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const expanded = menuToggle.getAttribute("aria-expanded") === "true";
    setMenuOpen(!expanded);
  });

  menuBackdrop?.addEventListener("click", () => {
    setMenuOpen(false);
  });
}

document.addEventListener("click", (event) => {
  const link = event.target.closest('a[href^="#"]');

  if (link && link.classList.contains("wa-link")) {
    return;
  }

  if (!link) {
    return;
  }

  const targetId = link.getAttribute("href");

  if (!targetId || targetId === "#") {
    return;
  }

  const target = document.querySelector(targetId);

  if (!target) {
    return;
  }

  event.preventDefault();

  const headerOffset = header ? header.offsetHeight + 12 : 0;
  const targetTop = target.getBoundingClientRect().top + window.scrollY - headerOffset;
  animateScrollTo(targetTop);

  if (menuToggle && header) {
    setMenuOpen(false);
  }
}, { capture: true });

detailsItems.forEach((item) => {
  item.addEventListener("toggle", () => {
    if (!item.open) {
      return;
    }

    detailsItems.forEach((other) => {
      if (other !== item) {
        other.open = false;
      }
    });
  });
});

bindHoverClass(galleryCards);
bindHoverClass(mediaBlocks);
setupLightbox();
setupPixModal();
setupTestimonialCarousel();

if (marqueeTrack) {
  let groupWidth = 0;
  let frameId = 0;
  let startTime = performance.now();
  const speed = 27;

  const measureMarquee = () => {
    // Mede o primeiro bloco duplicado para o loop reiniciar sem salto visual.
    const firstGroup = marqueeTrack.querySelector(".marquee-group");
    groupWidth = firstGroup ? firstGroup.getBoundingClientRect().width : 0;
    startTime = performance.now();
  };

  const runMarquee = (now) => {
    if (groupWidth > 0) {
      const distance = ((now - startTime) / 1000) * speed;
      const offset = distance % groupWidth;
      marqueeTrack.style.transform = `translate3d(${-offset}px, 0, 0)`;
    }

    frameId = window.requestAnimationFrame(runMarquee);
  };

  measureMarquee();
  frameId = window.requestAnimationFrame(runMarquee);
  window.addEventListener("resize", measureMarquee, { passive: true });
  window.addEventListener(
    "pagehide",
    () => {
      window.cancelAnimationFrame(frameId);
    },
    { once: true }
  );
}


// Filtro de mês na grade de próximos embarques (#proxima). Os botões de mês
// são gerados automaticamente a partir dos data-month presentes nos cards, então adicionar uma trip em um mês novo já cria o botão sozinho.

const tripFilter = document.querySelector(".trip-filter");
const tripCards = document.querySelectorAll(".trip-card[data-month]");

if (tripFilter && tripCards.length) {
  const months = Array.from(
    new Set(Array.from(tripCards).map((card) => card.dataset.month))
  );

  months.forEach((month) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "trip-filter-btn";
    button.dataset.month = month;
    button.textContent = month;
    tripFilter.appendChild(button);
  });

  const filterButtons = tripFilter.querySelectorAll(".trip-filter-btn");

  const applyFilter = (month) => {
    tripCards.forEach((card) => {
      const shouldShow = month === "all" || card.dataset.month === month;
      card.classList.toggle("is-hidden", !shouldShow);
    });

    filterButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.month === month);
    });
  };

  tripFilter.addEventListener("click", (event) => {
    const button = event.target.closest(".trip-filter-btn");

    if (!button) {
      return;
    }

    applyFilter(button.dataset.month);
  });
}

if ("IntersectionObserver" in window) {
  // Revela elementos .reveal conforme entram no viewport.
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -40px 0px",
    }
  );

  revealElements.forEach((element) => {
    revealObserver.observe(element);
  });
} else {
  revealElements.forEach((element) => {
    element.classList.add("is-visible");
  });
}