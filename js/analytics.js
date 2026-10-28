// Envia o evento pro que já estiver disponível no site; se nenhum dos dois
// estiver instalado ainda, só loga no console (não quebra nada).
const pushAnalyticsEvent = (eventPayload, gtagName, gtagParams) => {
  if (window.dataLayer && typeof window.dataLayer.push === "function") {
    window.dataLayer.push(eventPayload);
  } else if (typeof window.gtag === "function") {
    window.gtag("event", gtagName, gtagParams);
  } else {
    console.log("[analytics]", eventPayload);
  }
};

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
    wa_trip: link.dataset.waTrip || tripName || null,
    wa_date: link.dataset.waDate || null,
    wa_destination: link.dataset.waDestination || null,
  };

  pushAnalyticsEvent(eventPayload, "whatsapp_click", {
    section: eventPayload.wa_section,
    label: eventPayload.wa_label,
    trip: eventPayload.wa_trip,
    date: eventPayload.wa_date,
    destination: eventPayload.wa_destination,
  });
};

const trackPixClick = (trip) => {
  const eventPayload = {
    event: "pix_click",
    pix_trip: trip.title,
  };

  pushAnalyticsEvent(eventPayload, "pix_click", { trip: eventPayload.pix_trip });
};

// Eventos do hero: hero_next_trip_view, hero_cta_click, hero_scroll_past.
// `params` já inclui a variante do teste A/B e a trip exibida.
const trackHeroEvent = (eventName, params = {}) => {
  pushAnalyticsEvent({ event: eventName, ...params }, eventName, params);
};

export { trackWhatsAppClick, trackPixClick, trackHeroEvent };
