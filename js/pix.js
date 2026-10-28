import { TRIPS } from "./data.js";
import { trackPixClick } from "./analytics.js";

const PIX_KEY = "contato@overtrip.com.br";
const PIX_MERCHANT_NAME = "OVERTRIP";
const PIX_MERCHANT_CITY = "CAMPINA GRANDE";

// Campo TLV (Tag-Length-Value): id de 2 dígitos + tamanho de 2 dígitos +
// valor. É o formato básico de todo campo do BR Code (padrão Bacen).
const pixField = (id, value) => `${id}${String(value.length).padStart(2, "0")}${value}`;

// CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF) — checksum exigido
// pelo Bacen no último campo do payload, senão nenhum app de banco lê o QR.
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

// Monta o "Pix Copia e Cola" sem embutir um valor fixo — a pessoa confirma
// o valor no app do banco. Como chave/nome/cidade nunca mudam, esse payload
// é sempre o mesmo (é por isso que o QR pode ser uma imagem estática — ver
// setupPixModal abaixo).
const buildPixPayload = () => {
  const merchantAccountInfo =
    pixField("00", "br.gov.bcb.pix") + pixField("01", PIX_KEY);

  const additionalData = pixField("05", "***"); // txid genérico, sem referência

  const payloadWithoutCrc =
    pixField("00", "01") + // Payload Format Indicator
    pixField("26", merchantAccountInfo) + // Dados da chave Pix
    pixField("52", "0000") + // Merchant Category Code
    pixField("53", "986") + // Moeda: Real (ISO 4217)
    pixField("58", "BR") + // País
    pixField("59", PIX_MERCHANT_NAME.slice(0, 25)) +
    pixField("60", PIX_MERCHANT_CITY.slice(0, 15)) +
    pixField("62", additionalData) +
    "6304"; // id + tamanho do próprio campo de CRC

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
  const dialog = modal.querySelector(".pix-modal-dialog");
  const closeBtn = modal.querySelector(".lightbox-close");
  const payload = buildPixPayload();
  let modalTrigger = null;

  // QR pré-gerado (assets/images/pagamentos/overtrip-pix-qr.png) com o mesmo payload
  // de buildPixPayload(). Se um dia a chave Pix mudar, gerar um novo PNG
  // com o novo payload e substituir o arquivo.
  const qrCodeUrl = "assets/images/pagamentos/overtrip-pix-qr.png";

  // Se o QR não carregar, esconde a imagem quebrada e mostra o aviso — a
  // chave/código continuam funcionando, então o pagamento não trava por isso.
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

  const openPixModal = (trip, trigger) => {
    modalTrigger = trigger;
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
    closeBtn.focus();
  };

  const closePixModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("menu-locked");
    if (modalTrigger?.isConnected) {
      modalTrigger.focus();
    }
    modalTrigger = null;
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
    openPixModal(trip, trigger);
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
    } else if (event.key === "Tab") {
      const focusable = Array.from(dialog.querySelectorAll(
        'button:not([disabled]):not([hidden]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(payload);
      copyBtn.textContent = "Código copiado!";
      copyBtn.classList.add("is-copied");
    } catch (error) {
      // Clipboard API pode falhar em contexto não-seguro (http) ou permissão
      // negada — nesse caso a pessoa ainda pode selecionar a chave manualmente.
      console.warn("[pix] Não foi possível copiar automaticamente:", error);
      copyBtn.textContent = "Não foi possível copiar. Selecione a chave acima.";
    }

    window.setTimeout(() => {
      copyBtn.textContent = "Copiar código Pix";
      copyBtn.classList.remove("is-copied");
    }, 2500);
  });
};

export { setupPixModal };
