import { trackWhatsAppClick } from "./analytics.js";

const FALLBACK_WHATSAPP_NUMBER = "5583987745549";
const WHATSAPP_SETTINGS_URL = "/api/public/settings/whatsapp";
let whatsappNumber = FALLBACK_WHATSAPP_NUMBER;

const buildTripMessage = (link) => {
  const { waTrip, waDate, waDestination, waMeeting, waPrice, waKind } = link.dataset;
  if (!waTrip) return link.dataset.waMessage || "";

  if (waKind === "avisar") {
    const situation = link.dataset.waNotice === "Esgotado" ? "está esgotada" : "está com as inscrições encerradas";
    return `Olá! Vi no site que ${waTrip} ${situation}. Quero ser avisado(a) quando abrir a próxima viagem.`;
  }

  if (waKind === "participar") {
    return `Olá! Quero participar de ${waTrip}, no dia ${waDate}. Pode me passar as orientações e confirmar como faço para participar?`;
  }

  return `Olá! Tenho interesse em ${waTrip}, com destino a ${waDestination}, no dia ${waDate}. Vi no site o valor de ${waPrice} por pessoa e embarque em ${waMeeting}. Pode me passar os detalhes e a disponibilidade de vagas?`;
};

const setupWaLinks = () => {
  const waLinks = document.querySelectorAll(".wa-link");
  const hasConfiguredNumber = /^\d{12,13}$/.test(whatsappNumber);

  waLinks.forEach((link) => {
    const message = buildTripMessage(link);
    const encodedMessage = encodeURIComponent(message);
    link.href = hasConfiguredNumber
      ? `https://wa.me/${whatsappNumber}?text=${encodedMessage}`
      : `https://wa.me/?text=${encodedMessage}`;

    if (link.dataset.waTrip) {
      link.setAttribute("aria-label", `${link.textContent.trim()}: ${link.dataset.waTrip} pelo WhatsApp, em nova aba`);
    }
    link.addEventListener("click", () => trackWhatsAppClick(link));
  });
};

const loadWhatsappNumber = async (fetchFn = fetch, { timeoutMs = 3000, warn = console.warn } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(WHATSAPP_SETTINGS_URL, { cache: "no-cache", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (/^\d{12,13}$/.test(payload?.defaultWhatsapp)) whatsappNumber = payload.defaultWhatsapp;
  } catch (error) {
    warn(`[OVERTRIP] WhatsApp do painel indisponível (${error?.message || error}); usando o número de reserva do site.`);
  } finally {
    clearTimeout(timer);
  }
  return whatsappNumber;
};

const setupWaTooltip = () => {
  const tooltip = document.querySelector("#wa-tooltip");
  const closeBtn = document.querySelector("#wa-tooltip-close");
  const floatingButton = document.querySelector(".floating-wa");
  const STORAGE_KEY = "overtrip_wa_tooltip_dismissed";
  if (!tooltip || !closeBtn) return;

  const wasDismissed = () => {
    try { return sessionStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  };
  if (wasDismissed()) return;

  const dismiss = () => {
    tooltip.classList.remove("is-visible");
    try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch {}
  };

  window.setTimeout(() => {
    tooltip.hidden = false;
    window.requestAnimationFrame(() => tooltip.classList.add("is-visible"));
  }, 2500);
  closeBtn.addEventListener("click", dismiss);
  floatingButton?.addEventListener("click", dismiss);
};

export { FALLBACK_WHATSAPP_NUMBER, WHATSAPP_SETTINGS_URL, setupWaLinks, setupWaTooltip, loadWhatsappNumber };
