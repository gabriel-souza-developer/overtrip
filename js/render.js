import { TRIPS, GALLERY, TESTIMONIALS, loadTrips, getTripsLoadError } from "./data.js";

const formatTripDate = (isoString) => {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(isoString) ? `${isoString}T12:00:00-03:00` : isoString);
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

const getSaoPauloDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const formatTripShortDate = (isoString) => {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(isoString) ? `${isoString}T12:00:00-03:00` : isoString);
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  }).formatToParts(date);
  const day = parts.find(({ type }) => type === "day")?.value || "";
  const month = parts.find(({ type }) => type === "month")?.value.replace(".", "").toUpperCase() || "";
  return `${day} ${month}`;
};

// Data sem hora ("AAAA-MM-DD") não tem horário: devolve "" (o rótulo some).
const formatTripTime = (isoString) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoString)) {
    return "";
  }
  const date = new Date(isoString);
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(date);
  return formatted.replace(":", "h");
};

const formatTripMonth = (isoString) => {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(isoString) ? `${isoString}T12:00:00-03:00` : isoString);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date).replace(".", "").toUpperCase();
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
// stroke="currentColor" de propósito — herda a cor verde do container
// (.trip-includes-highlight-icon). Não trocar por um ícone com fill fixo.
const TRIP_ICON_SHIELD = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3Z"/>
    <path d="m9 12 2 2 4-4"/>
  </svg>
`;
const PIX_BUTTON_ICON = `
  <svg class="button-pix-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
    <path d="M14 14h3v3h-3ZM19 14h2M14 19h2M19 19h2"/>
  </svg>
`;

/* ==========================================================================
   EMBARQUE: um ou mais pontos de partida
   Trips com um ponto só usam meetingInfo / meetingCity + meetingPoint.
   Trips com mais de um ponto declaram `departures` no trips.json:
   [{ time, place, city, mapsUrl | mapsQuery }], na ordem em que o ônibus passa.
   ========================================================================== */

const getMapsHref = (point) => point.mapsUrl
  || (point.mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point.mapsQuery)}` : "");

// Texto único do embarque (mensagem do WhatsApp, aria-label).
const getMeetingLabel = (trip) => {
  if (trip.meetingInfo) {
    return trip.meetingInfo;
  }
  if (trip.meetingCity && trip.meetingPoint) {
    return `${trip.meetingCity} (${trip.meetingPoint})`;
  }
  return trip.meetingCity || trip.meetingPoint || "Local a combinar";
};

// A API (e o painel) podem devolver null ou deixar campos vazios, por exemplo
// uma viagem sem fotos. Normaliza só o que o HTML dos cards trata como texto
// ou lista, sem alterar viagens completas.
const text = (value, fallback = "") => (typeof value === "string" ? value : fallback);
const list = (value) => (Array.isArray(value) ? value : []);

const normalizeTrip = (trip) => ({
  ...trip,
  title: text(trip.title),
  description: text(trip.description),
  category: text(trip.category),
  city: text(trip.city),
  region: text(trip.region),
  intensityLabel: text(trip.intensityLabel),
  includes: list(trip.includes).filter((item) => typeof item === "string"),
  includesHighlight: text(trip.includesHighlight),
  media: list(trip.media).filter((item) => item && typeof item.src === "string" && item.src),
  departures: list(trip.departures),
  priceUnit: text(trip.priceUnit, "por pessoa"),
  priceDisplay: text(trip.priceDisplay, "Consulte"),
  buttonLabel: text(trip.buttonLabel, "Quero viajar"),
  buttonClass: text(trip.buttonClass, "button-dark"),
});

// Esgotada ou encerrada: continua na lista, mas não vende (sem Pix, botão vira aviso).
const CLOSED_NOTICES = { sold_out: "Esgotado", closed: "Inscrições encerradas" };
const getClosedNotice = (trip) => CLOSED_NOTICES[String(trip.status || "").toLowerCase()] || "";
const buildClosedNoticeHTML = (notice) =>
  notice ? `<p class="trip-closed-notice" role="status">${notice}</p>` : "";

const hasDepartures = (trip) => Array.isArray(trip.departures) && trip.departures.length > 0;

const buildDeparturesHTML = (trip) => {
  const items = trip.departures.map((point) => {
    const href = getMapsHref(point);
    const place = href
      ? `<a class="trip-map-link" href="${href}" target="_blank" rel="noreferrer" aria-label="Abrir ${point.place}, ${point.city}, no Google Maps, em nova aba">${point.place}</a>`
      : `<span>${point.place}</span>`;
    return `<li class="trip-boarding-item">
              <time class="trip-boarding-time">${point.time}</time>
              <span class="trip-boarding-place">${place}<small>${point.city}</small></span>
            </li>`;
  }).join("");
  const count = trip.departures.length;

  return `<div class="trip-meta-row trip-meta-row--boarding">
            <span class="trip-meta-icon trip-meta-icon--muted" aria-hidden="true">${TRIP_ICON_PIN}</span>
            <div class="trip-boarding">
              <p class="trip-boarding-title">${count > 1 ? `Embarque em ${count} pontos` : "Embarque"}</p>
              <ol class="trip-boarding-list">${items}</ol>
            </div>
          </div>`;
};

const buildTripCardHTML = (rawTrip, tripIndex) => {
  const trip = normalizeTrip(rawTrip);
  const includesHTML = trip.includes
    .map((item) => `<li><span class="trip-includes-icon" aria-hidden="true">${TRIP_ICON_CHECK_CIRCLE}</span><span>${item}</span></li>`)
    .join("");
  const dateDisplay = formatTripDate(trip.startDateISO);
  const departure = trip.departureTime || (trip.scheduleTBD ? "" : formatTripTime(trip.startDateISO));
  const levelWord = trip.intensityLabel.replace(/^Intensidade\s*/i, "");

  const cover = trip.media.find((item) => item.type !== "video") || trip.media[0] || null;
  const mediaCount = trip.media.length;
  const photoBadge = mediaCount > 1
    ? `<span class="gallery-photo-dots" aria-hidden="true">${trip.media.map((_, index) => `<i class="${index === 0 ? "is-active" : ""}"></i>`).join("")}</span>`
    : "";
  const scheduleLabel = trip.scheduleInfo || [departure, trip.returnTime].filter(Boolean).join(" às ");
  const scheduleHTML = scheduleLabel
    ? `<div class="trip-meta-row">
            <span class="trip-meta-icon trip-meta-icon--muted" aria-hidden="true">${TRIP_ICON_CLOCK}</span>
            <span>${scheduleLabel}</span>
          </div>`
    : "";
  const meetingLabel = getMeetingLabel(trip);
  const meetingHTML = trip.meetingMapsQuery
    ? `<a class="trip-map-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.meetingMapsQuery)}" target="_blank" rel="noreferrer" aria-label="Abrir ${meetingLabel} no Google Maps, em nova aba">${meetingLabel}</a>`
    : `<span>${meetingLabel}</span>`;
  // Um ponto: linha simples com pin. Vários pontos: bloco com horário em cada um.
  const boardingHTML = hasDepartures(trip)
    ? buildDeparturesHTML(trip)
    : `<div class="trip-meta-row">
            <span class="trip-meta-icon trip-meta-icon--muted" aria-hidden="true">${TRIP_ICON_PIN}</span>
            ${meetingHTML}
          </div>`;
  const intensityHTML = levelWord
    ? `<span class="trip-media-intensity">Nível: ${levelWord}</span>`
    : "";

  const closedNotice = getClosedNotice(trip);

  return `
    <article class="trip-card reveal" data-month="${formatTripMonth(trip.startDateISO)}">
      <button
        type="button"
        class="trip-media${cover ? "" : " trip-media--empty"}"${cover ? "" : ' style="background: var(--moss)"'}
        data-trip-index="${tripIndex}"
        aria-label="Abrir galeria de ${trip.title}"
      >
        ${cover ? `<img src="${cover.src}"${getHeroSrcset(cover.src) ? ` srcset="${getHeroSrcset(cover.src)}" sizes="${TRIP_CARD_IMG_SIZES}"` : ""} alt="${text(cover.alt)}" loading="lazy" decoding="async" fetchpriority="low">` : ""}
        <span class="trip-media-category">${trip.category}</span>
        ${intensityHTML}
        ${photoBadge}
      </button>
      <div class="trip-body">
        ${buildClosedNoticeHTML(closedNotice)}<h3 id="trip-title-${tripIndex}">${trip.title}</h3>
        <p class="trip-description">${trip.description}</p>

        <div class="trip-meta-list">
          <div class="trip-meta-row">
            <span class="trip-meta-icon" aria-hidden="true">${TRIP_ICON_CALENDAR}</span>
            <span>${dateDisplay}</span>
          </div>
          ${scheduleHTML}
          ${boardingHTML}
        </div>

        <details class="trip-includes-toggle">
          <summary><span class="trip-includes-toggle-label">Ver roteiro &amp; o que inclui</span></summary>
          <div class="trip-includes-body">
            <p class="trip-includes-heading">O que você vai viver</p>
            <ul class="trip-includes">${includesHTML}</ul>
            ${trip.includesHighlight ? `<div class="trip-includes-highlight">
              <span class="trip-includes-highlight-icon" aria-hidden="true">${TRIP_ICON_SHIELD}</span>
              <span>${trip.includesHighlight}</span>
            </div>` : ""}
          </div>
        </details>

        <div class="trip-footer">
          ${trip.free
            ? `<div class="trip-price-block trip-price-block--free">
            <span class="trip-price-info">
              <span class="trip-price-label">Investimento</span>
              <span class="trip-price-unit">por pessoa</span>
            </span>
            <span class="trip-price-value">Gratuito</span>
          </div>`
            : `<div class="trip-price-block">
            <span class="trip-price-info">
              <span class="trip-price-label">Investimento</span>
              <span class="trip-price-unit">${trip.priceUnit}</span>
            </span>
            <span class="trip-price-value">${trip.priceDisplay}</span>
          </div>`}
          <div class="trip-footer-actions">
            <a
              class="button ${trip.buttonClass} wa-link"
              data-wa-trip="${trip.title}"
              data-wa-date="${dateDisplay}"
              data-wa-destination="${trip.city} - ${trip.region}"
              data-wa-meeting="${meetingLabel}"
              data-wa-price="${trip.free ? "Gratuito" : trip.priceDisplay}"
              data-wa-kind="${closedNotice ? "avisar" : trip.free ? "participar" : "viajar"}"${closedNotice ? ` data-wa-notice="${closedNotice}"` : ""}
              aria-labelledby="trip-title-${tripIndex}"
              href="#"
              target="_blank"
              rel="noreferrer"
            >
              ${closedNotice ? "Avise-me da próxima" : trip.buttonLabel}
            </a>
            ${trip.free || closedNotice ? "" : `<button
              type="button"
              class="button button-pix pix-trigger"
              data-pix-trip-index="${tripIndex}"
            >
              ${PIX_BUTTON_ICON}
              Pagar Pix
            </button>`}
          </div>
        </div>
      </div>
    </article>
  `;
};

const buildTripSchema = (rawTrip) => {
  const trip = normalizeTrip(rawTrip);
  const schema = {
    "@type": "Event",
    name: trip.title,
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
      price: trip.free ? "0" : trip.priceValue,
      priceCurrency: "BRL",
      availability: getClosedNotice(trip) ? "https://schema.org/SoldOut" : trip.availabilitySchema,
      url: "https://overtrip.com.br/#proxima",
    },
  };

  if (trip.endDateISO) {
    schema.endDate = trip.endDateISO;
  }

  return schema;
};

const updateProximaStatus = (nextTrip) => {
  const statusEl = document.querySelector("#proxima-status");

  if (!statusEl) {
    return;
  }

  const titleEl = document.querySelector("#proxima-title");
  if (titleEl) {
    titleEl.textContent = nextTrip
      ? "Próximas viagens"
      : "Ainda não temos uma nova data confirmada.";
  }

  const contentHTML = nextTrip
    ? `<span class="status-pill-content"><span class="status-pill-label">Próximo embarque</span><strong class="status-pill-date">${formatTripShortDate(nextTrip.startDateISO)}</strong></span>`
    : `<span class="status-pill-content"><span class="status-pill-label">Novas datas em breve</span></span>`;
  statusEl.innerHTML = `<span class="status-pill-dot" aria-hidden="true"></span>${contentHTML}`;
  statusEl.hidden = false;
};

// Troca o texto do "Ver roteiro & o que inclui" -> "Ocultar detalhes" (e
// vice-versa) conforme cada <details> do card é aberto/fechado. Cada card é
// independente — abrir um não fecha os outros (diferente do FAQ).
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

/* ==========================================================================
   HERO: CARD "PRÓXIMA TRIP"
   Usa a mesma regra da seção de trips: a trip com data de hoje em diante
   mais próxima, vinda de /trips.json. Sem trip futura, o hero fica como era.
   ========================================================================== */

// Trip que ainda não aconteceu: data de hoje em diante e sem status de
// encerrada/cancelada. Mesma regra de dia do hero (America/Sao_Paulo).
const isUpcomingTrip = (trip) => trip.startDateISO.slice(0, 10) >= getSaoPauloDateKey()
  && trip.status !== "completed"
  && trip.status !== "cancelled";

const getNextTrip = (trips) => {
  const today = getSaoPauloDateKey();
  return trips
    .filter((trip) => trip.startDateISO.slice(0, 10) >= today)
    .sort((a, b) => a.startDateISO.localeCompare(b.startDateISO))[0] || null;
};

// "Em 9 dias" / "Amanhã" / "Hoje". Só de 0 a 30 dias antes da saída; fora
// disso o card mostra apenas a data. Compara dias do calendário em
// America/Sao_Paulo, pra não errar por causa do horário de saída.
const getCountdownLabel = (isoString) => {
  const tripDay = /^\d{4}-\d{2}-\d{2}$/.test(isoString) ? isoString : getSaoPauloDateKey(new Date(isoString));
  const diffDays = Math.round((Date.parse(tripDay) - Date.parse(getSaoPauloDateKey())) / 86400000);

  if (diffDays < 0 || diffDays > 30) {
    return "";
  }

  const label = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" }).format(diffDays, "day");
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const buildHeroTripHTML = (rawTrip) => {
  const trip = normalizeTrip(rawTrip);
  const levelWord = trip.intensityLabel.replace(/^Intensidade\s*/i, "");
  const countdown = getCountdownLabel(trip.startDateISO);
  const dateDisplay = formatTripDate(trip.startDateISO);
  const departure = trip.departureTime || (trip.scheduleTBD ? "" : formatTripTime(trip.startDateISO));
  const scheduleLabel = trip.scheduleInfo || [departure, trip.returnTime].filter(Boolean).join(" às ");
  const meetingLabel = getMeetingLabel(trip);
  const closedNotice = getClosedNotice(trip);
  const spotsNote = !closedNotice && Number(trip.spotsLeft) > 0 ? ` Restam ${Number(trip.spotsLeft)} vagas.` : "";
  const priceNote = [trip.free ? "" : trip.priceUnit, levelWord ? `nível ${levelWord.toLowerCase()}` : ""]
    .filter(Boolean)
    .join(", ");

  return `
    <aside class="hero-trip" data-trip-title="${trip.title}" aria-label="Próxima viagem: ${trip.title}">
      <div class="hero-trip-top">
        <p class="hero-trip-label"><span class="hero-trip-dot" aria-hidden="true"></span>Próxima viagem</p>
        ${countdown ? `<span class="hero-trip-countdown">${countdown}</span>` : ""}
      </div>
      <p class="hero-trip-title">${trip.title}</p>
      <div class="trip-meta-list">
        <div class="trip-meta-row">
          <span class="trip-meta-icon" aria-hidden="true">${TRIP_ICON_CALENDAR}</span>
          <span>${dateDisplay}${scheduleLabel ? `, ${scheduleLabel}` : ""}</span>
        </div>
        ${hasDepartures(trip)
          ? buildDeparturesHTML(trip)
          : `<div class="trip-meta-row">
          <span class="trip-meta-icon trip-meta-icon--muted" aria-hidden="true">${TRIP_ICON_PIN}</span>
          <span>${meetingLabel}</span>
        </div>`}
      </div>
      ${buildClosedNoticeHTML(closedNotice)}<div class="hero-trip-footer">
        <span class="hero-trip-price">
          <strong>${trip.free ? "Gratuito" : trip.priceDisplay}</strong>
          <small>${priceNote ? `${priceNote}.` : ""}${spotsNote}</small>
        </span>
        <a
          class="button button-rust hero-trip-cta wa-link"
          data-wa-trip="${trip.title}"
          data-wa-date="${dateDisplay}"
          data-wa-destination="${trip.city} - ${trip.region}"
          data-wa-meeting="${meetingLabel}"
          data-wa-price="${trip.free ? "Gratuito" : trip.priceDisplay}"
          data-wa-kind="${closedNotice ? "avisar" : trip.free ? "participar" : "viajar"}"${closedNotice ? ` data-wa-notice="${closedNotice}"` : ""}
          href="#"
          target="_blank"
          rel="noreferrer"
        >${closedNotice ? "Avise-me da próxima" : trip.buttonLabel}</a>
      </div>
    </aside>
  `;
};

// Slideshow do hero: as fotos da próxima trip passam sozinhas, pra a pessoa
// ver o que vai viver mesmo enquanto lê. Sem controles na tela.
// A foto de grupo do HTML fica escondida (CSS) e só aparece se a trip não
// existir ou a primeira foto falhar. Cada foto nova entra POR CIMA da
// anterior, então nada transparece no meio da troca. As demais fotos só
// são baixadas quando chega a vez delas, e o loop pausa com a aba escondida
// ou com o hero fora da tela.
// Versões leves das fotos (WebP em 640/960/1280px, geradas por
// tools/gerar-imagens-hero.py). O navegador escolhe a menor que serve pra
// largura da foto na tela. Se a versão leve não existir, cai no JPG original.
const HERO_IMG_WIDTHS = [640, 960, 1280];
const HERO_IMG_SIZES = "(min-width: 980px) 560px, (min-width: 720px) calc(100vw - 6rem), calc(100vw - 2rem)";

// Largura do card de trip no grid (até 400px) ou a tela toda no mobile.
const TRIP_CARD_IMG_SIZES = "(min-width: 720px) 400px, calc(100vw - 2rem)";

const getHeroSrcset = (src) => {
  if (!/\.(jpe?g|png)$/i.test(src)) {
    return "";
  }
  const base = src.replace(/\.(jpe?g|png)$/i, "");
  return HERO_IMG_WIDTHS.map((width) => `${base}-w${width}.webp ${width}w`).join(", ");
};

const HERO_SLIDE_INTERVAL = 2100; // ms que cada foto fica na tela

const showHeroTripPhoto = (hero, trip) => {
  const photo = hero.querySelector(".hero-photo");
  const items = (trip.media || []).filter((item) => item.type !== "video");

  if (!photo || !items.length) {
    hero.classList.add("show-fallback");
    return;
  }

  const baseImage = photo.querySelector(".hero-photo-base");
  const anchor = photo.querySelector(".hero-photo-note");
  const slides = items.map((item) => {
    const img = new Image();
    img.className = "hero-photo-trip";
    img.alt = item.alt;
    img.decoding = "async";
    img.setAttribute("aria-hidden", "true");
    // Enquadramento da foto dentro da caixa (campo opcional "focus" no
    // trips.json, ex: "50% 80%" = mostra mais a parte de baixo da foto).
    if (item.focus) {
      img.style.objectPosition = item.focus;
    }
    photo.insertBefore(img, anchor);
    return img;
  });

  const requests = new Map();
  const failed = new Set();
  const load = (index) => {
    if (!requests.has(index)) {
      requests.set(index, new Promise((resolve) => {
        const img = slides[index];
        const item = items[index];
        const srcset = getHeroSrcset(item.src);
        let triedOriginal = !srcset;

        // Só mostra depois de decodificada: fotos grandes não "piscam" em branco.
        img.addEventListener("load", () => {
          if (img.decode) {
            img.decode().then(() => resolve(true), () => resolve(true));
          } else {
            resolve(true);
          }
        });
        img.addEventListener("error", () => {
          if (!triedOriginal) {
            // versão WebP não existe (trip nova): usa o JPG original
            triedOriginal = true;
            img.removeAttribute("srcset");
            img.removeAttribute("sizes");
            img.src = item.src;
            return;
          }
          failed.add(index);
          resolve(false);
        });

        // A primeira foto é a que importa pro hero: prioridade alta.
        if (index === 0) {
          img.fetchPriority = "high";
        }
        if (srcset) {
          img.sizes = HERO_IMG_SIZES;
          img.srcset = srcset;
        }
        img.src = item.src;
      }));
    }
    return requests.get(index);
  };

  let current = -1;
  let timer = 0;
  let inView = true;

  const nextIndex = (from) => {
    for (let step = 1; step <= slides.length; step += 1) {
      const candidate = (from + step) % slides.length;
      if (!failed.has(candidate)) {
        return candidate;
      }
    }
    return from;
  };

  // A nova foto fica por cima (is-top) e a anterior vira a base (is-under);
  // as demais voltam a ficar invisíveis.
  const show = (index) => {
    slides.forEach((slide, position) => {
      slide.classList.toggle("is-top", position === index);
      slide.classList.toggle("is-under", position !== index && position === current);
      slide.setAttribute("aria-hidden", String(position !== index));
    });
    current = index;
  };

  const isRunning = () => slides.length > 1 && inView && !document.hidden;

  const schedule = () => {
    window.clearTimeout(timer);
    if (isRunning()) {
      timer = window.setTimeout(advance, HERO_SLIDE_INTERVAL);
    }
  };

  const advance = async () => {
    const target = nextIndex(current);
    if (target === current) {
      return;
    }
    if (await load(target)) {
      show(target);
      load(nextIndex(target)); // adianta a próxima foto
    }
    schedule();
  };

  if (slides.length > 1) {
    document.addEventListener("visibilitychange", schedule);

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        inView = entries.some((entry) => entry.isIntersecting);
        schedule();
      }, { threshold: 0.25 }).observe(hero);
    }
  }

  load(0).then((ok) => {
    if (!ok) {
      hero.classList.add("show-fallback");
      return;
    }

    hero.classList.add("has-trip-photo");
    // Evita leitor de tela descrever a foto de grupo escondida.
    baseImage?.setAttribute("alt", "");
    baseImage?.setAttribute("aria-hidden", "true");
    show(0);

    if (slides.length > 1) {
      load(1); // adianta a segunda foto
    }
    schedule();
  });
};

// Chamar DEPOIS de `await renderTrips()` (as trips vêm do JSON) e ANTES de
// setupWaLinks(), pra o botão do card receber o link do WhatsApp.
const renderHeroNextTrip = () => {
  const hero = document.querySelector(".hero");
  const visual = hero?.querySelector(".hero-visual");

  if (!hero || !visual) {
    return;
  }

  // Tira o estado de carregamento (espaço reservado e brilho; ver hero.css).
  hero.classList.remove("is-loading-trip");

  const trip = safely("próxima viagem", null, () => getNextTrip(TRIPS), null);
  if (!trip) {
    // Sem trip futura (ou JSON com erro): libera a foto de grupo do HTML.
    hero.classList.add("show-fallback");
    return;
  }

  const heroHTML = safely("hero", trip, () => buildHeroTripHTML(trip), "");
  if (!heroHTML) {
    hero.classList.add("show-fallback");
    return;
  }
  visual.insertAdjacentHTML("afterbegin", heroHTML);
  hero.classList.add("has-trip");
  showHeroTripPhoto(hero, trip);
};

// Uma viagem com dados ruins não pode derrubar as outras: roda a etapa
// isolada e, se falhar, registra um aviso e devolve `fallback`.
const safely = (step, trip, fn, fallback) => {
  try {
    return fn();
  } catch (error) {
    console.warn(`[OVERTRIP] Viagem ignorada (${step}): ${trip?.title ?? "sem título"}.`, error);
    return fallback;
  }
};

const buildTripCardsHTML = (listedTrips) => listedTrips
  .map(({ trip, index }) => safely("card", trip, () => buildTripCardHTML(trip, index), ""))
  .join("");

const renderTrips = async () => {
  const grid = document.querySelector("#trip-grid");

  if (!grid) {
    return;
  }

  const trips = await loadTrips();
  // Só trips que ainda vão acontecer: as realizadas viram memória na galeria
  // (GALLERY em data.js). Da data mais próxima para a mais distante. O
  // `index` original é mantido porque o lightbox e o Pix buscam a trip em
  // TRIPS por ele.
  const listedTrips = trips
    .map((trip, index) => ({ trip, index }))
    .filter(({ trip }) => safely("filtrar", trip, () => isUpcomingTrip(trip), false))
    .sort((a, b) => a.trip.startDateISO.slice(0, 10).localeCompare(b.trip.startDateISO.slice(0, 10)));
  const hasTrips = listedTrips.length > 0;
  const today = getSaoPauloDateKey();
  const nextTrip = listedTrips
    .map(({ trip }) => trip)
    .filter((trip) => trip.startDateISO.slice(0, 10) >= today)
    .sort((a, b) => a.startDateISO.localeCompare(b.startDateISO))[0] || null;

  if (!hasTrips) {
    const failedLoad = getTripsLoadError();
    grid.innerHTML = failedLoad
      ? '<p class="trip-empty-state">Não foi possível carregar as expedições no momento. Tente novamente em alguns instantes ou fale com a OVERTRIP pelo WhatsApp.</p>'
      : '<p class="trip-empty-state">Nenhuma expedição com embarque agendado no momento. Acompanhe nossos canais para saber das próximas datas.</p>';
  } else {
    grid.innerHTML = buildTripCardsHTML(listedTrips);
  }

  document.querySelector(".trip-search")?.toggleAttribute("hidden", !hasTrips);
  document.querySelector(".trip-filter")?.toggleAttribute("hidden", !hasTrips);
  updateProximaStatus(nextTrip);
  bindTripIncludesToggles();

  // Se a versão leve (WebP) de alguma capa não existir (trip nova), cai no JPG.
  grid.querySelectorAll(".trip-media img[srcset]").forEach((img) => {
    img.addEventListener("error", () => {
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
    }, { once: true });
  });

  if (hasTrips) {
    const schemaScript = document.createElement("script");
    schemaScript.type = "application/ld+json";
    schemaScript.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": listedTrips
        .map(({ trip }) => safely("schema", trip, () => buildTripSchema(trip), null))
        .filter(Boolean),
    });
    document.head.appendChild(schemaScript);
  }
};

/* ==========================================================================
   GALERIA (memórias): bento + "ver mais"
   Da mais recente para a mais antiga (campo `dateISO` de cada item de
   GALLERY). Começa com 1 destaque + 4 (fecha duas linhas de 4 no desktop) e
   cada clique em "Ver mais memórias" abre mais 4 (uma linha cheia no desktop
   e duas no mobile). Layout inspirado no padrão "Interactive Bento Gallery"
   do 21st.dev, reescrito em HTML/CSS/JS puro.
   ========================================================================== */

const GALLERY_FIRST_BATCH = 5;
const GALLERY_BATCH = 4;

const buildGalleryCardHTML = (entry, index, { reveal = false, delay = 0 } = {}) => {
  const isFeature = index === 0;
  const cover = entry.images[0];
  const extraCount = entry.images.length - 1;
  const badge = extraCount > 0
    ? `<span class="gallery-photo-count">+${extraCount} foto${extraCount > 1 ? "s" : ""}</span>`
    : "";
  const classes = ["gallery-card", isFeature ? "gallery-card--feature" : "", reveal ? "reveal" : "is-entering"]
    .filter(Boolean)
    .join(" ");

  return `
    <article
      class="${classes}"
      data-gallery-index="${index}"
      ${delay ? `style="--enter-delay: ${delay}ms"` : ""}
      tabindex="0"
      role="button"
      aria-label="Ver fotos de ${entry.title}"
    >
      <div class="gallery-image">
        <img src="${cover.src}" alt="${cover.alt}" loading="lazy" decoding="async">
        ${badge}
      </div>
      <div class="gallery-copy">
        <p class="gallery-date">${entry.date}</p>
        <h3>${entry.title}</h3>
        ${isFeature ? `<p class="gallery-desc">${entry.description}</p>` : ""}
      </div>
    </article>
  `;
};

const renderGallery = () => {
  const grid = document.querySelector("#gallery-grid");

  if (!grid) {
    return;
  }

  // Ordena no lugar: o lightbox lê GALLERY[index], então a ordem da tela e a
  // do array precisam ser a mesma.
  GALLERY.sort((a, b) => b.dateISO.localeCompare(a.dateISO));

  const total = GALLERY.length;
  const controls = document.querySelector("#gallery-more");
  const button = controls?.querySelector(".gallery-more-button");
  const label = controls?.querySelector(".gallery-more-label");
  const amount = controls?.querySelector(".gallery-more-amount");
  const status = controls?.querySelector(".gallery-more-status");
  let visible = Math.min(GALLERY_FIRST_BATCH, total);

  grid.innerHTML = GALLERY
    .slice(0, visible)
    .map((entry, index) => buildGalleryCardHTML(entry, index, { reveal: true }))
    .join("");

  if (!controls || !button) {
    return;
  }

  const sync = () => {
    const remaining = total - visible;
    controls.hidden = total <= GALLERY_FIRST_BATCH;
    status.textContent = `Mostrando ${visible} de ${total} memórias`;
    button.dataset.mode = remaining > 0 ? "more" : "less";
    label.textContent = remaining > 0 ? "Ver mais memórias" : "Mostrar menos";
    amount.textContent = remaining > 0 ? `+${Math.min(remaining, GALLERY_BATCH)}` : "";
    amount.hidden = remaining <= 0;
    button.setAttribute("aria-expanded", String(remaining <= 0));
  };

  button.addEventListener("click", () => {
    if (button.dataset.mode === "more") {
      const start = grid.children.length;
      visible = Math.min(visible + GALLERY_BATCH, total);
      // Só acrescenta os novos: os cards que já estão na tela não recarregam.
      grid.insertAdjacentHTML(
        "beforeend",
        GALLERY.slice(start, visible)
          .map((entry, offset) => buildGalleryCardHTML(entry, start + offset, { delay: offset * 70 }))
          .join("")
      );
      grid.children[start]?.focus();
    } else {
      // Recolhe de volta ao primeiro lote e devolve a pessoa ao topo da seção.
      Array.from(grid.children).slice(GALLERY_FIRST_BATCH).forEach((card) => card.remove());
      visible = Math.min(GALLERY_FIRST_BATCH, total);
      document.querySelector("#galeria .section-head")?.scrollIntoView({ block: "start" });
      button.focus({ preventScroll: true });
    }
    sync();
  });

  sync();
};

// Traduz uma trip pro mesmo formato { title, description, images } da
// galeria, pra reaproveitar o mesmo lightbox nas fotos do card de trip.
const getTripLightboxEntry = (trip) => ({
  title: trip.title,
  description: trip.free
    ? formatTripDate(trip.startDateISO)
    : `${formatTripDate(trip.startDateISO)} · ${trip.priceDisplay ?? "Consulte"}`,
  images: trip.media,
});

const setupLightbox = () => {
  const lightbox = document.querySelector("#gallery-lightbox");
  const galleryGrid = document.querySelector("#gallery-grid");
  const tripGrid = document.querySelector("#trip-grid");

  if (!lightbox || (!galleryGrid && !tripGrid)) {
    return;
  }

  const imageEl = lightbox.querySelector(".lightbox-image");
  const videoEl = lightbox.querySelector(".lightbox-video");
  const counterEl = lightbox.querySelector(".lightbox-counter");
  const titleEl = lightbox.querySelector(".lightbox-title");
  const descEl = lightbox.querySelector(".lightbox-desc");
  const prevBtn = lightbox.querySelector(".lightbox-prev");
  const nextBtn = lightbox.querySelector(".lightbox-next");

  let currentEntry = null;
  let currentIndex = 0;
  let lightboxTrigger = null;
  const closeButton = lightbox.querySelector(".lightbox-close");
  const dialog = lightbox.querySelector(".lightbox-dialog");

  const renderCurrentImage = () => {
    if (!currentEntry) {
      return;
    }

    const media = currentEntry.images[currentIndex];
    const isVideo = media.type === "video";
    imageEl.hidden = isVideo;
    videoEl.hidden = !isVideo;
    if (isVideo) {
      imageEl.removeAttribute("src");
      videoEl.src = media.src;
      videoEl.setAttribute("aria-label", media.alt);
      videoEl.load();
    } else {
      videoEl.pause();
      videoEl.removeAttribute("src");
      videoEl.load();
      imageEl.src = media.src;
      imageEl.alt = media.alt;
    }
    counterEl.textContent = `${currentIndex + 1} / ${currentEntry.images.length}`;
    titleEl.textContent = currentEntry.title;
    descEl.textContent = currentEntry.description;

    const hasMultiple = currentEntry.images.length > 1;
    prevBtn.hidden = !hasMultiple;
    nextBtn.hidden = !hasMultiple;
  };

  const openLightbox = (entry, trigger) => {
    currentEntry = entry;
    currentIndex = 0;
    lightboxTrigger = trigger;
    renderCurrentImage();
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("menu-locked");
    closeButton.focus();
  };

  const closeLightbox = () => {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.classList.remove("menu-locked");
    videoEl.pause();
    videoEl.removeAttribute("src");
    videoEl.load();
    currentEntry = null;
    if (lightboxTrigger?.isConnected) {
      lightboxTrigger.focus();
    }
    lightboxTrigger = null;
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
      openLightbox(entry, card);
    }
  };

  const openFromTripMedia = (media) => {
    const index = Number(media.dataset.tripIndex);
    const trip = TRIPS[index];
    // Viagem sem fotos: não há o que abrir.
    if (trip && Array.isArray(trip.media) && trip.media.length) {
      openLightbox(getTripLightboxEntry(trip), media);
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
    } else if (event.key === "Tab") {
      const focusable = Array.from(dialog.querySelectorAll(
        'button:not([disabled]):not([hidden]), video[controls]'
      )).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
};

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

  // Arrastar com o mouse, além do gesto nativo de swipe em touch/trackpad.
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

export { formatTripTime, buildTripSchema, normalizeTrip, buildTripCardHTML, buildHeroTripHTML, buildTripCardsHTML, renderHeroNextTrip, renderTrips, renderGallery, renderTestimonials, updateYearsCount, setupLightbox, setupTestimonialCarousel };
