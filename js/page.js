// Entrada das páginas secundárias (blog e OVER RIDERS): menu, WhatsApp e ano.
// Não carrega viagens, galeria nem depoimentos, que só existem na página principal.
import { loadWhatsappNumber, setupWaLinks, setupWaTooltip } from "./whatsapp.js?v=paginas-20261110";
import { setupNavigation } from "./ui.js?v=category-20261110";

document.body.classList.remove("no-js");
document.body.classList.add("js");

const init = async () => {
  setupNavigation();
  setupWaTooltip();
  const year = document.querySelector("#current-year");
  if (year) year.textContent = String(new Date().getFullYear());

  // Os links já saem do HTML com o número de reserva; aqui aplicamos o número do painel.
  await loadWhatsappNumber();
  setupWaLinks();
};

init().catch((error) => {
  console.error("[OVERTRIP] Falha ao inicializar a página.", error);
});
