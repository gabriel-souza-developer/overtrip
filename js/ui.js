import { trackHeroEvent } from "./analytics.js";

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const animateScrollTo = (targetTop, duration = 850) => {
  // A navegação interna mantém uma transição suave e previsível.
  // O tratamento de movimento reduzido continua aplicado às animações decorativas via CSS.
  const startTop = window.scrollY;
  const distance = targetTop - startTop;
  const startTime = performance.now();

  const step = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    window.scrollTo(0, startTop + distance * easeInOutCubic(progress));

    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };

  window.requestAnimationFrame(step);
};

// Mantém o mesmo efeito hover em cards que também recebem foco pelo teclado.
const bindHoverClass = (elements) => {
  elements.forEach((element) => {
    element.addEventListener("mouseenter", () => element.classList.add("is-hovered"));
    element.addEventListener("mouseleave", () => element.classList.remove("is-hovered"));
    element.addEventListener("focusin", () => element.classList.add("is-hovered"));
    element.addEventListener("focusout", () => element.classList.remove("is-hovered"));
  });
};

const setupNavigation = () => {
  const header = document.querySelector(".site-header");
  const menuToggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".site-nav");
  const menuBackdrop = document.querySelector(".menu-backdrop");
  const dropdownToggles = nav?.querySelectorAll(".nav-dropdown-toggle") || [];
  const detailsItems = document.querySelectorAll(".faq-item");

  const closeDropdowns = (except = null) => {
    dropdownToggles.forEach((toggle) => {
      const dropdown = toggle.closest(".nav-dropdown");
      if (dropdown !== except) {
        dropdown.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  };

  const setMenuOpen = (isOpen) => {
    if (!menuToggle || !header) {
      return;
    }
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Fechar menu" : "Abrir menu");
    header.classList.toggle("menu-open", isOpen);
    document.body.classList.toggle("menu-locked", isOpen);
    if (!isOpen) {
      closeDropdowns();
    }
  };

  if (header) {
    const syncHeader = () => header.classList.toggle("is-solid", window.scrollY > 12);
    syncHeader();
    window.addEventListener("scroll", syncHeader, { passive: true });
  }

  if (menuToggle && nav && header) {
    menuToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const expanded = menuToggle.getAttribute("aria-expanded") === "true";
      setMenuOpen(!expanded);
    });
    menuBackdrop?.addEventListener("click", () => setMenuOpen(false));
    dropdownToggles.forEach((toggle) => {
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const dropdown = toggle.closest(".nav-dropdown");
        const isOpen = dropdown.classList.contains("is-open");
        closeDropdowns(dropdown);
        dropdown.classList.toggle("is-open", !isOpen);
        toggle.setAttribute("aria-expanded", String(!isOpen));
      });
    });
    document.addEventListener("click", (event) => {
      if (!nav?.contains(event.target)) {
        closeDropdowns();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }

      const openDropdown = nav.querySelector(".nav-dropdown.is-open");
      if (openDropdown) {
        const toggle = openDropdown.querySelector(".nav-dropdown-toggle");
        closeDropdowns();
        toggle?.focus();
      } else if (menuToggle.getAttribute("aria-expanded") === "true") {
        setMenuOpen(false);
        menuToggle.focus();
      }
    });
  }

  // Scroll suave nos links internos (href="#..."), exceto links de WhatsApp.
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

  // FAQ tipo acordeão: abrir um item fecha os outros.
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

  bindHoverClass(document.querySelectorAll(".gallery-card"));
  bindHoverClass(document.querySelectorAll(".media-block"));

  const currentYear = document.querySelector("#current-year");
  if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
  }
};

const setupMarquee = () => {
  const marqueeTrack = document.querySelector(".marquee-track");
  const templateGroup = marqueeTrack?.querySelector(".marquee-group");
  if (!marqueeTrack || !templateGroup) {
    return;
  }

  let groupWidth = 0;
  let frameId = 0;
  let startTime = performance.now();
  const speed = 27;

  const measureMarquee = () => {
    groupWidth = templateGroup.getBoundingClientRect().width;

    if (!groupWidth) {
      return;
    }

    const requiredGroups = Math.ceil((window.innerWidth + groupWidth) / groupWidth);
    while (marqueeTrack.children.length < requiredGroups) {
      marqueeTrack.append(templateGroup.cloneNode(true));
    }
    while (marqueeTrack.children.length > requiredGroups) {
      marqueeTrack.lastElementChild.remove();
    }

    startTime = performance.now();
  };

  const runMarquee = (now) => {
    if (groupWidth > 0) {
      const offset = (((now - startTime) / 1000) * speed) % groupWidth;
      marqueeTrack.style.transform = `translate3d(${-offset}px, 0, 0)`;
    }
    frameId = window.requestAnimationFrame(runMarquee);
  };

  measureMarquee();
  document.fonts?.ready.then(measureMarquee);
  frameId = window.requestAnimationFrame(runMarquee);
  window.addEventListener("resize", measureMarquee, { passive: true });
  window.addEventListener("pagehide", () => window.cancelAnimationFrame(frameId), { once: true });
};


// Botões gerados a partir dos data-month presentes nos cards — uma trip
// num mês novo já cria o botão sozinha. Combinado com a busca por texto:
// um card só aparece se bater com o mês ativo E o termo digitado.
const setupMonthFilter = () => {
  const tripFilter = document.querySelector(".trip-filter");
  const tripCards = document.querySelectorAll(".trip-card[data-month]");
  const searchInput = document.querySelector("#trip-search-input");
  const tripGrid = document.querySelector("#trip-grid");

  if (!tripFilter || !tripCards.length || !tripGrid) {
    return;
  }

  const months = Array.from(new Set(Array.from(tripCards).map((card) => card.dataset.month)));

  months.forEach((month) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "trip-filter-btn";
    button.dataset.month = month;
    button.textContent = month;
    button.setAttribute("aria-pressed", "false");
    tripFilter.appendChild(button);
  });

  const filterButtons = tripFilter.querySelectorAll(".trip-filter-btn");
  let activeMonth = "all";
  const emptyState = document.createElement("p");
  emptyState.className = "trip-empty-state";
  emptyState.textContent = "Nenhum roteiro encontrado com esses filtros.";
  emptyState.hidden = true;
  tripGrid.append(emptyState);

  const applyFilters = () => {
    const term = searchInput ? searchInput.value.trim().toLowerCase() : "";
    let visibleCount = 0;

    tripCards.forEach((card) => {
      const matchesMonth = activeMonth === "all" || card.dataset.month === activeMonth;
      const matchesSearch = !term || card.textContent.toLowerCase().includes(term);
      const isVisible = matchesMonth && matchesSearch;
      card.classList.toggle("is-hidden", !isVisible);
      visibleCount += Number(isVisible);
    });

    emptyState.hidden = visibleCount > 0;
  };

  tripFilter.addEventListener("click", (event) => {
    const button = event.target.closest(".trip-filter-btn");
    if (!button) {
      return;
    }
    activeMonth = button.dataset.month;
    filterButtons.forEach((btn) => {
      const isActive = btn === button;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
    applyFilters();
  });

  searchInput?.addEventListener("input", applyFilters);
};

const setupRevealAnimation = () => {
  const revealElements = document.querySelectorAll(".reveal");

  if (!("IntersectionObserver" in window)) {
    revealElements.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18, rootMargin: "0px 0px -40px 0px" }
  );

  revealElements.forEach((element) => revealObserver.observe(element));
};

/* ==========================================================================
   HERO: TESTE A/B DE HEADLINE + MEDIÇÃO
   ========================================================================== */

// Desligado: o título do HTML ("Sua próxima história começa na estrada.") fica
// fixo pra todo mundo. Ligue (true) só pra voltar a testar a headline B.
const HERO_AB_ENABLED = false;
const HERO_AB_KEY = "overtrip_hero_variant";

// A = controle (o <h1> do HTML). B = headline focada em comunidade.
const HERO_VARIANTS = {
  A: null,
  B: "Viaje com gente que <em>vira comunidade.</em>",
};

let heroVariant = "A";

const setupHeroExperiment = () => {
  const headline = document.querySelector(".hero h1");

  // Fora da home (ex: blog) não há hero, então ninguém entra no teste.
  if (!HERO_AB_ENABLED || !headline) {
    return;
  }

  let variant = null;
  let canStore = true;

  try {
    variant = localStorage.getItem(HERO_AB_KEY);
  } catch (error) {
    canStore = false;
  }

  if (!(variant in HERO_VARIANTS)) {
    variant = Math.random() < 0.5 ? "A" : "B";
    try {
      localStorage.setItem(HERO_AB_KEY, variant);
    } catch (error) {
      canStore = false;
    }
  }

  // Sem localStorage a pessoa não manteria a mesma variante entre visitas,
  // o que bagunça a medição. Nesse caso fica sempre no controle.
  if (!canStore) {
    variant = "A";
  }

  heroVariant = variant;
  document.documentElement.dataset.heroVariant = variant;

  if (HERO_VARIANTS[variant]) {
    headline.innerHTML = HERO_VARIANTS[variant];
  }
};

// hero_next_trip_view: card visível (50%) pela primeira vez.
// hero_cta_click: clique em botão/link do hero.
// hero_scroll_past: hero saiu inteiro da tela pelo topo.
const setupHeroTracking = () => {
  const hero = document.querySelector(".hero");

  if (!hero) {
    return;
  }

  const tripCard = hero.querySelector(".hero-trip");
  const baseParams = () => ({
    hero_variant: heroVariant,
    hero_trip: tripCard?.dataset.tripTitle || null,
  });

  if ("IntersectionObserver" in window) {
    if (tripCard) {
      const viewObserver = new IntersectionObserver((entries, observer) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          trackHeroEvent("hero_next_trip_view", baseParams());
          observer.disconnect();
        }
      }, { threshold: 0.5 });
      viewObserver.observe(tripCard);
    }

    const pastObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting && entry.boundingClientRect.bottom <= 0) {
          trackHeroEvent("hero_scroll_past", baseParams());
          observer.disconnect();
        }
      });
    }, { threshold: 0 });
    pastObserver.observe(hero);
  }

  hero.addEventListener("click", (event) => {
    const cta = event.target.closest("a.button");

    if (!cta) {
      return;
    }

    trackHeroEvent("hero_cta_click", {
      ...baseParams(),
      hero_cta_label: cta.textContent.trim(),
      hero_cta_target: cta.classList.contains("wa-link") ? "whatsapp" : "anchor",
      hero_cta_in_card: Boolean(cta.closest(".hero-trip")),
    });
  });
};

// Painéis do Universo (desktop): o painel com mouse/foco/toque fica aberto.
// No mobile é uma lista estática e isto não faz nada.
const setupUniversePanels = () => {
  const wrapper = document.querySelector("#universe-panels");

  if (!wrapper) {
    return;
  }

  const panels = Array.from(wrapper.querySelectorAll(".universe-panel"));
  const desktop = window.matchMedia("(min-width: 980px)");
  const activate = (target) => {
    if (!desktop.matches) {
      return;
    }
    panels.forEach((panel) => panel.classList.toggle("is-active", panel === target));
  };

  panels.forEach((panel) => {
    panel.addEventListener("mouseenter", () => activate(panel));
    panel.addEventListener("focusin", () => activate(panel));
    panel.addEventListener("click", () => activate(panel));
  });
};

export { setupUniversePanels, setupNavigation, setupMarquee, setupMonthFilter, setupRevealAnimation, setupHeroExperiment, setupHeroTracking };
