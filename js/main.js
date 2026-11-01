import { renderHeroNextTrip, renderTrips, renderGallery, renderTestimonials, updateYearsCount, setupLightbox, setupTestimonialCarousel } from "./render.js";
import { loadTrips } from "./data.js";
import { loadWhatsappNumber, setupWaLinks, setupWaTooltip } from "./whatsapp.js";
import { setupNavigation, setupMarquee, setupMonthFilter, setupRevealAnimation, setupHeroExperiment, setupHeroTracking, setupUniversePanels } from "./ui.js";
import { setupPixModal } from "./pix.js";

document.body.classList.remove("no-js");
document.body.classList.add("js");

const init = async () => {
  // Hero: reserva o espaço do card e já aplica a variante do teste A/B.
  document.querySelector(".hero")?.classList.add("is-loading-trip");
  setupHeroExperiment();

  // Conteúdos síncronos podem ser renderizados imediatamente.
  // A galeria vem da API (até 3 s); a promessa é aguardada antes do reveal.
  const galleryReady = renderGallery();
  const whatsappReady = loadWhatsappNumber();
  renderTestimonials();
  updateYearsCount();

  // Recursos que não dependem dos cards de trips podem iniciar sem esperar o JSON.
  setupNavigation();
  setupLightbox();
  setupWaTooltip();
  setupTestimonialCarousel();
  setupMarquee();

  // As trips agora vêm de /trips.json. É necessário aguardar a renderização
  // antes de configurar recursos que consultam os cards já existentes no DOM.
  // O hero vem primeiro: assim que o JSON chega o card aparece e a foto da
  // trip já começa a baixar, sem esperar a montagem da grade de trips.
  await loadTrips();
  renderHeroNextTrip();
  await renderTrips();

  await Promise.all([galleryReady, whatsappReady]);

  setupWaLinks();
  setupPixModal();
  setupMonthFilter();
  setupRevealAnimation();
  setupHeroTracking();
  setupUniversePanels();
};

init().catch((error) => {
  console.error("[OVERTRIP] Falha inesperada ao inicializar o site.", error);
});
