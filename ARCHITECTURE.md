# OVERTRIP v6 — Arquitetura do Projeto

## Visão Geral

**OVERTRIP** é um site estático de agência de ecoturismo e aventura construído com HTML5, CSS3 puro e JavaScript modular (ES modules). O projeto prioriza performance, acessibilidade e experiência do usuário com uma abordagem de **content-driven design**.

- **Modelo:** Site estático (sem backend, hosting em servidor Apache)
- **Stack:** HTML + CSS + Vanilla JS
- **Renderização:** Client-side com dados de `trips.json`
- **Deploy:** Apache com HTTPS, headers de segurança e cache inteligente

---

## Estrutura de Diretórios

```
overtrip.v6/
├── index.html                 # Página principal (home)
├── trips.json                 # Base de dados de expedições (JSON)
├── knowledge.json             # Contexto e informações da empresa
├── robots.txt                 # SEO: instruções para crawlers
├── sitemap.xml                # SEO: mapa do site
├── site.webmanifest           # PWA: manifesto e metadados
├── .htaccess                  # Apache: HTTPS, headers de segurança, cache
│
├── css/                       # Folhas de estilo modularizadas
│   ├── base.css               # Reset, variáveis CSS, elementos base
│   ├── header.css             # Header + navegação
│   ├── hero.css               # Hero section (próxima viagem)
│   ├── trips.css              # Cards de trips + filtros + lightbox
│   ├── content.css            # Seções genéricas (galeria, testimonials, etc)
│   ├── footer.css             # Footer
│   └── responsive.css         # Media queries (mobile-first)
│
├── js/                        # JavaScript modular (ES6 modules)
│   ├── main.js                # Orquestração: inicialização e sequência
│   ├── data.js                # Dados estáticos e carregamento de JSON
│   ├── render.js              # Renderização de HTML (1000+ linhas)
│   ├── ui.js                  # Interações e animações
│   ├── whatsapp.js            # Integração WhatsApp (links + tooltip)
│   ├── pix.js                 # Modal de pagamento Pix
│   ├── analytics.js           # Rastreamento de eventos
│   └── map.js                 # Integração com Leaflet (mapas)
│
├── assets/
│   ├── brand/                 # Logo, favicon (SVG + PNG)
│   ├── images/
│   │   ├── bonito-pe/         # Fotos de destino (com variações WebP)
│   │   ├── cachoeira-do-pinga-pb/
│   │   ├── trilha-em-lucena-pb/
│   │   ├── olheiro-de-pureza-rn/
│   │   ├── coqueirinho-conde-pb/
│   │   ├── geral/             # Fotos gerais (grupo, vans)
│   │   ├── riders/            # Fotos da comunidade OVER RIDERS
│   │   ├── blog/              # Imagens para posts
│   │   ├── overtrip-store/    # Loja/equipamentos
│   │   └── pagamentos/        # QR code Pix
│
├── blog/                      # Subpáginas de blog
│   ├── index.html
│   ├── agente-overtrip/
│   ├── primeira-expedicao/
│   ├── overtrip-riders/
│   └── ...
│
├── riders/                    # Página dedicada à comunidade
│   └── index.html
│
└── tools/                     # Scripts auxiliares (geração de imagens, etc)
```

---

## Arquitetura da Aplicação

### 1. **Camada de Dados (`data.js` + `trips.json`)**

```
trips.json (servidor)
    ↓
loadTrips() → TRIPS[] (memória)
    ↓
GALLERY[] (memórias de viagens passadas)
TESTIMONIALS[] (depoimentos de clientes)
knowledge.json (contexto da empresa)
```

**Dados principais:**
- **TRIPS**: Array de expedições futuras com campos como:
  - `title`, `category`, `description`
  - `startDateISO`, `endDateISO`, `scheduleTBD`
  - `priceDisplay`, `priceValue`, `free`
  - `departureTime`, `returnTime`, `departures[]` (múltiplos pontos de embarque)
  - `includes[]`, `includesHighlight`
  - `media[]` (fotos, vídeos com srcset para WebP)
  - `intensityLabel`, `spotsLeft`, `availabilitySchema`

- **GALLERY**: Memórias de viagens realizadas (galeria bento)
  - `title`, `date`, `dateISO`, `description`
  - `images[]` com alt text descritivo

- **TESTIMONIALS**: Depoimentos com rating de 1-5 estrelas

---

### 2. **Camada de Renderização (`render.js` ~ 1000 linhas)**

Responsável por todo HTML gerado dinamicamente:

```
renderTrips()
  ├─ formatTripDate() → "15/11/2026 (domingo)"
  ├─ formatTripMonth() → "NOV"
  ├─ buildTripCardHTML() → <article class="trip-card">
  └─ buildTripSchema() → Schema.org Event JSON-LD

renderHeroNextTrip()
  ├─ getNextTrip() → trip mais próxima
  ├─ buildHeroTripHTML() → card destacado no hero
  └─ showHeroTripPhoto() → slideshow de fotos com preload

renderGallery()
  ├─ Ordena GALLERY por dateISO (recente → antiga)
  ├─ Primeiro batch: 5 cards (1 em destaque + 4 normais)
  └─ "Ver mais" carrega mais 4 em batches

renderTestimonials()
  └─ buildTestimonialHTML() → carrossel de depoimentos

setupLightbox()
  └─ Modal de galeria com navegação (←/→, ESC, swipe)
```

**Formatações de data:**
- Usa `Intl.DateTimeFormat` com timezone `America/Sao_Paulo` para consistência
- Formatos: ISO (AAAA-MM-DD), legível (DD/MM/AAAA), mês (NOV), relativa ("Em 3 dias")

**Srcset para responsividade de imagens:**
```
Versões WebP: -w640, -w960, -w1280
Fallback: JPG original se WebP não existir
Sizes: diferentes para hero vs cards vs mobile
```

---

### 3. **Camada de Interação (`ui.js` ~ 430 linhas)**

Manipulação do DOM, navegação, filtros e animações:

```
setupNavigation()
  ├─ Menu mobile: toggle + backdrop
  ├─ Dropdowns: apenas um aberto por vez
  ├─ Smooth scroll: links internos (#...)
  ├─ FAQs: acordeão (abre um, fecha outros)
  └─ Hover states: sincroniza mouse e teclado

setupMonthFilter()
  ├─ Extrai meses dos cards (data-month)
  ├─ Cria botões dinamicamente
  ├─ Busca + filtro por mês (AND logic)
  └─ Empty state: "Nenhum roteiro encontrado"

setupMarquee()
  ├─ Carrossel infinito de logos/brands
  ├─ Usa transform + requestAnimationFrame
  └─ Adapta quantidade de clones à tela

setupHeroExperiment()
  ├─ A/B test de headline (desligado por padrão)
  ├─ Persiste em localStorage
  └─ Tracking: hero_variant

setupHeroTracking()
  ├─ trackHeroEvent("hero_next_trip_view")
  ├─ trackHeroEvent("hero_cta_click")
  └─ trackHeroEvent("hero_scroll_past")

setupRevealAnimation()
  ├─ IntersectionObserver para .reveal
  ├─ Adiciona .is-visible ao entrar na tela
  └─ Respeita prefers-reduced-motion

setupUniversePanels()
  ├─ Painéis desktop interativos
  └─ Mobile: lista estática
```

**Easing functions:**
- `easeInOutCubic`: animações suaves de scroll

**Acessibilidade:**
- `aria-expanded`, `aria-pressed`, `aria-label`, `aria-hidden`
- Navegação por teclado (Tab, Escape, Enter, Setas)
- `prefers-reduced-motion` respeitado

---

### 4. **Integrações (`whatsapp.js`, `pix.js`, `analytics.js`)**

#### **WhatsApp (`whatsapp.js`)**
```
setupWaLinks()
  ├─ Monta mensagem com variáveis do card
  ├─ Substitui placeholders: {trip}, {date}, {destination}, etc
  ├─ Abre https://wa.me/5583987745549 com texto
  └─ Rastreia clicks

setupWaTooltip()
  └─ Tooltip com número de WhatsApp
```

Formato da mensagem:
```
Oi! Quero viajar/participar na {trip}
Data: {date}
Destino: {destination}
Ponto de embarque: {meeting}
Preço: {price}
```

#### **Pix (`pix.js`)**
```
setupPixModal()
  ├─ Copia chave Pix ao clipboard
  ├─ Exibe QR code: assets/images/pagamentos/overtrip-pix-qr.png
  └─ Modal com instruções de pagamento
```

#### **Analytics (`analytics.js`)**
```
trackHeroEvent(event, params)
  ├─ hero_next_trip_view: card 50% visível
  ├─ hero_cta_click: clique em botão do hero
  ├─ hero_scroll_past: hero saiu da tela
  └─ Pode enviar para Google Analytics, Mixpanel, etc
```

---

### 5. **Camada de Apresentação (`css/` ~ 2000 linhas)**

**Arquitetura CSS:**

```
base.css
  ├─ :root { --bone, --rust, --moss, --radius-xl, ... }
  ├─ Reset (*, html, body, img, a, button)
  ├─ Tipografia (Inter 400-800)
  └─ Componentes atômicos

header.css
  ├─ .site-header { position: sticky; }
  ├─ .site-nav { dropdowns, menu mobile }
  ├─ Sincroniza scroll: header fica sólida em scroll

hero.css
  ├─ .hero { position: relative; overflow: hidden; }
  ├─ .hero-photo { slideshow de fotos animado }
  ├─ .hero-trip { card da próxima viagem destacado }
  ├─ Estados: is-loading-trip, has-trip-photo, show-fallback

trips.css
  ├─ .trip-card { grid responsivo, hover states }
  ├─ .trip-includes-toggle { <details> estilizado }
  ├─ .trip-filter { botões de mês }
  ├─ .trip-search { busca por texto }
  └─ Lightbox: .gallery-lightbox

content.css
  ├─ .section-head { títulos e subtítulos }
  ├─ .gallery-card { layout bento, feature 2x2 }
  ├─ .quote-card { testimonials com estrelas }
  ├─ .marquee { carrossel infinito }
  └─ .reveal { animação de entrada

footer.css
  ├─ .site-footer { sticky na base }
  ├─ Links de redes sociais
  └─ Copyright + ano dinâmico (#current-year)

responsive.css
  ├─ Mobile-first (320px → desktop)
  ├─ Breakpoints: 720px, 980px
  ├─ Grid de trips: 1 col (mobile) → 2 cols (tablet) → 3 cols (desktop)
  ├─ Gallery bento: redimensiona em mobile
  └─ Esconde/mostra elementos conforme viewport
```

**Cores (OKLCH):**
```
--bone:      #F5F3EF  (fundo principal)
--paper:     #F0EDE7  (cards, fundo secundário)
--ink:       #292621  (texto principal)
--moss:      #5A8A5A  (acentos verdes)
--rust:      #FF4500  (tema, CTAs)
--line:      rgba(17, 17, 17, 0.1)
--text-soft: #72706D
```

**Escala de espaçamento (rem):**
```
--section-y:           clamp(4.8rem, 8vw, 6.3rem)
--section-head-space:  clamp(2.25rem, 4vw, 2.8rem)
--radius-xl:           1.5rem
--radius-lg:           1rem
--radius-md:           0.6rem
```

---

## Fluxo de Inicialização

```
index.html carregado
  ↓
<head>
  ├─ Prefetch de /trips.json (window.__tripsRequest)
  ├─ Preload de primeira foto da hero (srcset + imagesrcset)
  └─ Schema.org TravelAgency JSON-LD
  ↓
<body> classes removidas/adicionadas (no-js → js)
  ↓
main.js init()
  ├─ [SÍNCRONO] renderGallery() → GALLERY
  ├─ [SÍNCRONO] renderTestimonials() → TESTIMONIALS
  ├─ [SÍNCRONO] updateYearsCount()
  ├─ [SÍNCRONO] setupNavigation(), setupLightbox(), etc
  ├─ [ASYNC] await loadTrips() → /trips.json
  ├─ renderHeroNextTrip() → card + slideshow
  ├─ await renderTrips() → grid completa
  ├─ setupWaLinks(), setupPixModal(), setupMonthFilter()
  ├─ setupRevealAnimation() → IntersectionObserver
  ├─ setupHeroTracking() → analytics
  └─ setupUniversePanels() → painéis interativos
```

**Por que essa ordem?**
1. Renderização síncrona não bloqueia: gallery, testimonials, years
2. Setup de interações genéricas: menu, lightbox, carousel
3. Espera o JSON (pode ser lento)
4. Hero renderiza **antes** da grid (máxima prioridade)
5. Só depois configura recursos que dependem dos cards (filtro, tracking)

---

## Performance & Otimizações

### **Carregamento de Imagens**

```
Hero:
  1. Prefetch primeira foto no <head> (fetchpriority="high")
  2. Próximas fotos carregadas conforme slideshow avança
  3. Versões WebP leves: -w640, -w960, -w1280
  4. Fallback JPG original

Cards de trip:
  1. Loading: "lazy" (loaded when near viewport)
  2. Decoding: "async" (não bloqueia render)
  3. Srcset responsivo

Galeria:
  1. Primeira imagem de cada card lazy-loaded
  2. Lightbox carrega full-res ao abrir
  3. Fotos extras na galeria só carregadas em "Ver mais"
```

### **Cache (.htaccess)**

```
HTML (sempre verificar):
  Cache-Control: no-cache, no-store, must-revalidate

CSS/JS/Assets (navegador cache):
  Implícito; pode usar ?v=hash em produção

/trips.json (dinâmico):
  Cache-Control: no-cache
  Revalida no servidor a cada request
```

### **Segurança (.htaccess)**

```
HTTPS:       Força redirect
CORS:        X-Frame-Options: SAMEORIGIN
MIME sniff:  X-Content-Type-Options: nosniff
Referrer:    strict-origin-when-cross-origin
Permissions: Bloqueia camera, microphone, geolocation
HSTS:        1 ano (sem preload por segurança)
```

---

## Estrutura de Dados: `trips.json`

```json
[
  {
    "title": "TRILHA EM LUCENA - PB",
    "category": "TRILHA, NATUREZA E PATRIMÔNIO",
    "description": "Banho de rio, mirante, ruínas...",
    "city": "Lucena",
    "region": "PB",
    "startDateISO": "2026-11-29T05:30:00-03:00",
    "endDateISO": "2026-11-29T17:00:00-03:00",
    "scheduleTBD": false,
    "departureTime": "04h30",
    "returnTime": "17h",
    "free": false,
    "priceDisplay": "R$ 109,99",
    "priceValue": "109.99",
    "priceUnit": "por pessoa",
    "spotsLeft": 5,
    "status": "scheduled",
    "availabilitySchema": "https://schema.org/InStock",
    "intensityLabel": "Intensidade moderada",
    "includes": ["Banho de rio", "Mirante de Lucena", ...],
    "includesHighlight": "Inclui guia credenciado, transporte...",
    "meetingCity": "Campina Grande - PB",
    "meetingPoint": "Rodoviária Nova",
    "meetingInfo": "Pocinhos - PB às 04h30 e Campina Grande - PB às 05h15",
    "meetingMapsQuery": "Rodoviária Nova, Campina Grande - PB",
    "departures": [
      {
        "time": "04h30",
        "place": "Paróquia de Nossa Senhora da Conceição",
        "city": "Pocinhos - PB",
        "mapsUrl": "https://maps.app.goo.gl/..."
      }
    ],
    "media": [
      {
        "type": "image",
        "src": "assets/images/trilha-em-lucena-pb/trilha-em-lucena-pb-ruinas-bom-sucesso.jpg",
        "alt": "Ruínas da Igreja de Bom Sucesso em Lucena - PB",
        "focus": "50% 60%"
      }
    ],
    "buttonLabel": "Viajar com a OVERTRIP",
    "buttonClass": "button-rust"
  }
]
```

---

## Componentes Reutilizáveis

### **Trip Card**
- Foto com badge de intensidade
- Título, descrição
- Data, horário, embarque(s)
- Preço, botões (WhatsApp, Pix)
- Acordeão: "Ver roteiro & o que inclui"

### **Gallery Card (Bento Layout)**
- Feature card: 2x2, com descrição
- Cards normais: 1x1, só foto + titulo
- Foto com badge de quantidade de imagens
- Click/Enter: abre lightbox

### **Testimonial Card**
- Estrelas (rating 1-5)
- Quote
- Nome + localização
- Carrossel com drag

### **Filter Button**
- Data: "NOV", "DEZ", etc
- "Todos os meses"
- Aria-pressed true/false

---

## Decisões Arquiteturais Chave

### **1. Client-Side Rendering**
✅ Vantagem: Dados dinâmicos (trips.json) sem rebuild
❌ Trade-off: Precisa do JSON antes de renderizar os cards

### **2. Vanilla JS (Sem Framework)**
✅ Vantagem: Zero dependências, bundle pequeno, performance máxima
❌ Trade-off: Mais código boilerplate que React/Vue

### **3. ES Modules**
✅ Vantagem: Modularização clara (data, render, ui)
❌ Trade-off: Requer `type="module"` no HTML

### **4. Static HTML + Apache**
✅ Vantagem: Simples, rápido, hospedagem barata (cPanel)
❌ Trade-off: Sem SSR/SSG, sem dynamic routes

### **5. OKLCH para Cores**
✅ Vantagem: Espaço de cor perceptual, melhor consistência visual
❌ Trade-off: Alguns navegadores antigos não suportam

---

## Extensibilidade & Manutenção

### **Adicionar uma Nova Trip**
1. Adiciona objeto em `trips.json`
2. Gera WebP -w640, -w960, -w1280 via `tools/gerar-imagens-hero.py`
3. Commit → Deploy automático

### **Novo Blog Post**
1. Cria `blog/novo-post/index.html`
2. Reutiliza CSS do base (mobile-first)
3. Mesmas variáveis CSS globais

### **Modificar Estilo**
1. Edita `css/base.css` para mudanças globais
2. Edita arquivo específico (header.css, trips.css, etc)
3. Mobile-first: regras gerais → breakpoints maiores

### **Adicionar Feature JS**
1. Novo módulo em `js/feature.js`
2. Exporta função `setupFeature()`
3. Importa e chama em `main.js init()`

---

## Checklist de Produção

- ✅ HTTPS configurado (.htaccess)
- ✅ Headers de segurança (X-Frame-Options, HSTS, etc)
- ✅ Cache control (HTML: no-cache, Assets: browser cache)
- ✅ Robots.txt + sitemap.xml
- ✅ Schema.org JSON-LD (TravelAgency + Event)
- ✅ OG tags + Twitter cards
- ✅ PWA manifest (site.webmanifest)
- ✅ Favicon (SVG + PNG)
- ✅ Mobile viewport meta
- ✅ Alt text em todas as imagens
- ✅ Acessibilidade ARIA
- ✅ Navegação por teclado
- ✅ prefers-reduced-motion respeitado

---

## Stack & Dependências

### **Frontend**
- HTML5 (semântico)
- CSS3 (Grid, Flexbox, Container Queries quando aplicável)
- JavaScript ES6+ (Modules, async/await, Intl API)

### **Externos**
- **Google Fonts:** Inter (400-800)
- **Leaflet:** Mapas (se usado em `map.js`)
- **WhatsApp API:** Links wa.me
- **Analytics:** Slot para Google Analytics, Mixpanel, etc

### **Build/Deploy**
- Apache + PHP 8.4 (cPanel)
- Sem build step (HTML/CSS/JS servidos direto)
- Geração de imagens WebP: `tools/gerar-imagens-hero.py`

---

## Próximos Passos & Melhorias

1. **Service Worker (PWA):** Cache offline, modo dark
2. **Lazy-load do trips.json:** Infinite scroll ou pagination
3. **Admin dashboard:** UI para editar trips.json
4. **Email confirmação:** Validar lista de espera
5. **Análise de dados:** Tracks de conversão, funnel
6. **Multilíngue:** PT-BR, EN (i18n)
7. **Modo Dark:** CSS variable toggle
8. **Social proof:** Reviews, fotos dos usuários
9. **Blog CMS:** Integração com headless CMS
10. **Integração de pagamento:** Stripe, PagSeguro direto

---

**Versão:** 6.0  
**Última atualização:** Outubro 2026  
**Responsável:** OVERTRIP
