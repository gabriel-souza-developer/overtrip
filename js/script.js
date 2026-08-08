document.body.classList.remove("no-js");
document.body.classList.add("js");

// ---------------------------------------------------------------------------
// DADOS
// Próximas trips, galeria de memórias e depoimentos ficam centralizados
//---------------------------------------------------------------------------

const TRIPS = [
  {
    title: "Excursão | Bonito - PE",
    // location: "Bonito - PE",
    city: "Bonito",
    region: "PE",
    // chapterLabel: "Capítulo 03 · Setembro 2026",
    month: "SET",
    dateDisplay: "13/09/2026 (domingo)",
    departure: "03h30",
    returnTime: "17h",
    meetingPoint: "Rodoviária Nova",
    meetingMapsQuery: "Rodoviária Nova, Campina Grande - PB",
    priceDisplay: "R$ 165,00 por pessoa",
    priceValue: "165.00",
    // Sem contagem de vagas informada — evite inventar um número aqui.
    statusClass: "open",
    statusLabel: "Vagas abertas",
    intensityClass: "leve",
    intensityLabel: "Intensidade leve",
    includes: [
      "Transporte climatizado (ida e volta)",
      "Seguro de viagem",
      "Assistência equipe OVERTRIP",
      "Taxa de entrada no Camping do Mágico (Day-use)",
    ],
    image: "assets/images/riacho-e-area-do-restaurante-capimgdomagico.jpg",
    imageAlt: "Piscina natural de águas claras em Bonito - PE",
    buttonLabel: "Reservar via WhatsApp",
    buttonClass: "button-dark",
    waMessage: "Fala! Tenho interesse na excursão a Bonito - PE (13/09/2026) e quero saber mais detalhes.",
    // Usado só no schema.org (Google) — não aparece no card.
    startDateISO: "2026-09-13T03:30:00-03:00",
    availabilitySchema: "https://schema.org/InStock",
  },
];

// Cada memória pode ter várias fotos — a primeira é a capa do card.
const GALLERY = [
  {
    title: "Praia de Coqueirinho - Conde - PB",
    date: "28 de maio de 2023",
    description: "Um dia de praia, estrada e boas lembranças para levar na bagagem.",
    images: [
      { src: "assets/images/praia-de-coqueirinho.jpg", alt: "Pôr do sol na praia com grupo de amigos em clima de descontração" },
      { src: "assets/images/pedacinho-da-prainha-coqueirinho.jpg", alt: "Falésias e mar na praia" },

    ],
  },
  {
    title: "Cachoeira do Paraíso - Bonito - PE",
    date: "14 de abril de 2024",
    description: "Trilha, cachoeira e um lugar que faz a gente desacelerar",
    images: [
      { src: "assets/images/cachoeira-do-paraiso-bonito-pe.jpg", alt: "Cachoeira com piscina natural em meio à vegetação, vista de cima" },
      { src: "assets/images/cachoeira-do-paraiso-bonito2-pe.jpg", alt: "Cachoeira em meio à mata fechada" },
    ],
  },
  {
    title: "Camping no Rio do Feijão - Barra de Santana - PB",
    date: "22 de julho de 2023",
    description: "Fogueira, céu estrelado e a simplicidade de estar presente",
    images: [
      { src: "assets/images/camping-rio-do-feijao.jpg", alt: "Camping à beira de rio com grupo de amigos em clima de descontração" },
      { src: "assets/images/camping-rio-do-feijao2.jpg", alt: "Barracas montadas à beira do rio ao entardecer" },
      { src: "assets/images/estrelas-camping.jpg", alt: "Estrelas à noite" },
    ],
  },
  {
    title: "Olheiro de Pureza - RN",
    date: "17 de maio de 2026",
    description: "Águas cristalinas, risadas e uma viagem para guardar na memória.",
    images: [
      { src: "assets/images/turma-olheiro-pureza.jpg", alt: "Grupo de viajantes no olheiro de Pureza" },
      { src: "assets/images/pureza-rn.jpg", alt: "Olheiro de Pureza em meio à vegetação natural" },
      { src: "assets/images/nascente-pureza-rn.jpg", alt: "Nascente de águas cristalinas entre as pedras" },
    ],
  },
];

// Depoimentos: rating de 1 a 5. Adicione quantos quiser — o carrossel
// se ajusta sozinho.
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

// ---------------------------------------------------------------------------
// RENDER: Próxima trip (cards + schema.org gerado a partir do mesmo dado)
// ---------------------------------------------------------------------------
const buildTripCardHTML = (trip) => {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.meetingMapsQuery)}`;
  const includesHTML = trip.includes.map((item) => `<li>${item}</li>`).join("");
// <p class="trip-location">${trip.location}</p>

  return `
    <article class="trip-card reveal" data-month="${trip.month}">
      <div class="trip-media">
        <img src="${trip.image}" alt="${trip.imageAlt}" loading="lazy" decoding="async">
      </div>
      <div class="trip-body">
        <div class="trip-badges">
          <span class="trip-status ${trip.statusClass}">${trip.statusLabel}</span>
          <span class="trip-intensity ${trip.intensityClass}">${trip.intensityLabel}</span>
        </div>
        <h3>${trip.title}</h3>
        

        <div class="trip-meta">
          <div class="trip-detail">
            <span>Data</span>
            <strong>${trip.dateDisplay}</strong>
          </div>
          <div class="trip-detail">
            <span>Saída</span>
            <strong>${trip.departure}</strong>
          </div>
          <div class="trip-detail">
            <span>Retorno</span>
            <strong>${trip.returnTime}</strong>
          </div>
          <div class="trip-detail">
            <span>Encontro</span>
            <a class="trip-map-link" href="${mapsUrl}" target="_blank" rel="noreferrer">${trip.meetingPoint}</a>
          </div>
        </div>

        <ul class="trip-includes">${includesHTML}</ul>

        <div class="trip-footer">
          <p class="trip-price">${trip.priceDisplay}</p>
          <a
            class="button ${trip.buttonClass} wa-link"
            data-wa-message="${trip.waMessage}"
            href="#"
            target="_blank"
            rel="noreferrer"
          >
            ${trip.buttonLabel}
          </a>
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

const renderTrips = () => {
  const grid = document.querySelector("#trip-grid");

  if (!grid) {
    return;
  }

  grid.innerHTML = TRIPS.map(buildTripCardHTML).join("");

  // Schema.org por trip: gerado a partir do mesmo array acima, então nunca
  // fica dessincronizado do que aparece visualmente no card.
  const schemaScript = document.createElement("script");
  schemaScript.type = "application/ld+json";
  schemaScript.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": TRIPS.map(buildTripSchema),
  });
  document.head.appendChild(schemaScript);
};

// ---------------------------------------------------------------------------
// RENDER: Galeria + lightbox (modal com todas as fotos de cada memória)
// ---------------------------------------------------------------------------
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

const setupLightbox = () => {
  const lightbox = document.querySelector("#gallery-lightbox");
  const grid = document.querySelector("#gallery-grid");

  if (!lightbox || !grid) {
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

  const openFromCard = (card) => {
    const index = Number(card.dataset.galleryIndex);
    const entry = GALLERY[index];
    if (entry) {
      openLightbox(entry);
    }
  };

  grid.addEventListener("click", (event) => {
    const card = event.target.closest(".gallery-card");
    if (card) {
      openFromCard(card);
    }
  });

  grid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const card = event.target.closest(".gallery-card");
    if (!card) {
      return;
    }
    event.preventDefault();
    openFromCard(card);
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
// (.wa-link, .reveal, .trip-card[data-month]) já existam quando o resto
// do código for consultá-los abaixo.
renderTrips();
renderGallery();
renderTestimonials();

// ---------------------------------------------------------------------------
// COMPORTAMENTO GERAL DO SITE
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Analytics: dispara um evento a cada clique em link de WhatsApp, informando
// em qual seção da página e em qual card/link o clique aconteceu. Funciona
// com Google Tag Manager (dataLayer) ou GA4 (gtag) — o que já estiver
// instalado no site. Se nenhum dos dois existir, só loga no console (não
// quebra nada e ajuda a testar antes de conectar um analytics de verdade).
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Filtro de mês na grade de próximos embarques (#proxima). Os botões de mês
// são gerados automaticamente a partir dos data-month presentes nos cards,
// então adicionar uma trip em um mês novo já cria o botão sozinho.
// ---------------------------------------------------------------------------
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