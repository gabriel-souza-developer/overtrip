document.body.classList.remove("no-js");
document.body.classList.add("js");

// Edite apenas este valor quando tiver o WhatsApp oficial. Use DDI + DDD + número, sem espaços.
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