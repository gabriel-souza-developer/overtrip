# AUDITORIA SOMENTE LEITURA - OVERTRIP v6
**Data:** 28 de outubro de 2026  
**Status:** Etapa 1 - Análise completa sem alterações

---

## 1. VISÃO GERAL DO PROJETO ATUAL

### 1.1 Arquitetura
- **Tipo:** Site estático HTML/CSS/JavaScript puro
- **Stack:** HTML5 + CSS3 + Vanilla JS (ES6 modules)
- **Renderização:** Client-side (browser)
- **Deploy:** Apache com HTTPS, headers de segurança
- **Dados:** JSON estático servido via HTTP

### 1.2 Estrutura de Arquivos
```
overtrip.v6/
├── index.html                 # Home (1083 linhas)
├── trips.json                 # 4 trips (298 linhas) ⚠️ FONTE DE VERDADE
├── knowledge.json             # Contexto empresa (363 linhas)
├── js/
│   ├── data.js               # Load trips + GALLERY/TESTIMONIALS hardcoded
│   ├── render.js             # 1052 linhas - toda renderização
│   ├── map.js                # 497 linhas - VISITED_PLACES hardcoded ⚠️
│   ├── whatsapp.js           # Integração WhatsApp
│   ├── pix.js                # Modal pagamento
│   ├── ui.js                 # Interações/filtros
│   ├── analytics.js          # Tracking
│   └── main.js               # Orquestração
├── riders/index.html         # Página OVER RIDERS
├── blog/                     # Páginas de blog
└── assets/images/            # Fotos organizadas por destino
```

---

## 2. ANÁLISE DO `trips.json`

### 2.1 Estrutura de Dados
Cada trip contém **42+ campos** organizados em categorias:

#### **Identificação**
- `title`, `headlineDisplay`, `category`, `description`
- `city`, `region`

#### **Datas e Horários**
- `startDateISO` (ISO 8601: "2026-11-29" ou "2026-09-13T03:30:00-03:00")
- `endDateISO` (opcional, viagens multi-dia)
- `dateDisplay` ("Domingo, 29/11/2026 · Bate e volta")
- `departureTime` ("04h30")
- `departureTolerance` ("30 minutos")
- `returnTime` ("17h")
- `scheduleInfo` ("05h às 17h")
- `scheduleTBD` (boolean)

#### **Embarque (2 formatos)**
**Formato 1 - Ponto único:**
- `meetingCity`, `meetingPoint`, `meetingInfo`, `meetingDetails`, `meetingMapsQuery`

**Formato 2 - Múltiplos pontos:**
- `departures[]` array de objetos:
  ```json
  {
    "time": "04h30",
    "place": "Paróquia de Nossa Senhora da Conceição",
    "city": "Pocinhos - PB",
    "mapsUrl": "https://maps.app.goo.gl/..."
  }
  ```

#### **Preços**
- `priceDisplay` ("R$ 109,99")
- `priceValue` ("109.99") - para cálculos
- `priceUnit` ("por pessoa")
- `depositDisplay` ("R$ 55,00") - 50% entrada
- `remainingDisplay` ("R$ 54,99")
- `remainingDeadlineDisplay` ("27/11/2026")
- `free` (boolean) - eventos gratuitos

#### **Características**
- `intensityClass` ("moderado", "leve", "difícil")
- `intensityLabel` ("Intensidade moderada")
- `spotsLeft` (número de vagas restantes)

#### **Conteúdo**
- `includes[]` - lista de atividades/locais
- `includesHighlight` - texto destaque sobre inclusos
- `includedServices[]` - lista detalhada de serviços
- `itinerary[]` - roteiro passo a passo
- `routeNotes[]` - observações da rota
- `importantInfo[]` - informações importantes
- `supportPoint`, `supportPointInfo` - ponto de apoio
- `trailDistance` - distância da trilha

#### **Mídia**
- `media[]` array de objetos:
  ```json
  {
    "src": "assets/images/trilha-em-lucena-pb/foto.jpg",
    "alt": "Descrição acessível",
    "focus": "50% 92%", // opcional: enquadramento
    "type": "video" // opcional
  }
  ```

#### **Call-to-Action**
- `buttonLabel` ("Quero viajar")
- `buttonClass` ("button-dark", "button-rust")

#### **Status e SEO**
- `status` ("open", "completed", "cancelled", "sold_out", "closed")
- `availabilitySchema` ("https://schema.org/InStock")

### 2.2 Exemplo Real - Trilha em Lucena
```json
{
  "title": "TRILHA EM LUCENA - PB",
  "startDateISO": "2026-11-29",
  "priceDisplay": "R$ 109,99",
  "departures": [
    { "time": "04h30", "place": "Paróquia...", "city": "Pocinhos - PB" },
    { "time": "05h15", "place": "Rodoviária Nova", "city": "Campina Grande - PB" }
  ],
  "intensityClass": "moderado",
  "media": [ /* 4 imagens com alt, focus */ ],
  "status": "open"
}
```

---

## 3. CONSUMIDORES DOS DADOS

### 3.1 Mapeamento Completo

| Consumidor | Origem | Campos Usados | Propósito |
|------------|--------|---------------|-----------|
| **index.html (head preload)** | trips.json | `startDateISO`, `media[0]` | Otimização: pré-carrega foto da próxima trip |
| **Hero Section** | trips.json | Próxima trip (status="open", data futura) | Card destacado com slideshow de fotos |
| **Grid de Trips** | trips.json | Todas as trips futuras | Lista filtrada por mês/busca |
| **Lightbox Galeria** | trips.json | `media[]` | Visualização de fotos |
| **Modal Pix** | trips.json | `title`, `priceDisplay` | Pagamento via QR Code |
| **Links WhatsApp** | trips.json | `title`, `dateDisplay`, `city`, `priceDisplay`, `meetingInfo` | Mensagens personalizadas |
| **Schema.org SEO** | trips.json | Todos campos relevantes | JSON-LD para Google |
| **Galeria "Memórias"** | `js/data.js` | GALLERY hardcoded ⚠️ | Trips realizadas |
| **Mapa "Destinos"** | `js/map.js` | VISITED_PLACES hardcoded ⚠️ | 34+ destinos visitados |
| **Depoimentos** | `js/data.js` | TESTIMONIALS hardcoded | Carrossel de avaliações |

### 3.2 Números Fixos no HTML (não derivados)

**Linha 234-236 (Hero):**
```html
<li><strong><span>★</span>4.9</strong><span>20 avaliações</span></li>
<li><strong><span>+</span>100</strong><span>membros</span></li>
<li><strong>2022</strong><span>na estrada</span></li>
```

**Linha 460-488 (Stats Bar):**
```html
<strong>+100</strong> <span>Membros</span>
<strong id="stat-trips-count">+28</strong> <span>Visitas a destinos</span>
<strong id="stat-years-count">3 anos</strong> <span>de comunidade</span>
<strong>+5.000</strong> <span>Quilômetros rodados</span>
```

**Linha 759-761 (Vozes):**
```html
<strong>4.9</strong>
<span>com base em 20 avaliações no Google e Instagram</span>
```

⚠️ **PROBLEMA:** Números precisam ser atualizados manualmente em 3 lugares diferentes.

### 3.3 Dados Derivados

**Calculados em runtime (js/render.js):**
- ✅ Contagem regressiva: "Em 9 dias", "Amanhã", "Hoje"
- ✅ Formatação de datas: timezone America/Sao_Paulo
- ✅ Mês da trip: para filtros (data-month="NOV")
- ✅ Próxima trip: compara `startDateISO >= hoje`
- ✅ Anos de comunidade: 2026 - 2022 = 4 anos (linha 1048)

**Hardcoded que deveriam ser derivados:**
- ❌ Galeria de memórias (GALLERY em data.js)
- ❌ Mapa de destinos (VISITED_PLACES em map.js, 240 linhas!)
- ❌ Contagem "+28 visitas" (deveria contar trips completed)

---

## 4. FILTROS, DATAS E CONTAGENS REGRESSIVAS

### 4.1 Lógica de Filtros (js/render.js)

**Trip "futura" (renderizada no grid):**
```javascript
const isUpcomingTrip = (trip) => 
  trip.startDateISO.slice(0, 10) >= getSaoPauloDateKey()
  && trip.status !== "completed"
  && trip.status !== "cancelled";
```

**Próxima trip (hero):**
```javascript
const getNextTrip = (trips) => {
  return trips
    .filter((trip) => trip.startDateISO.slice(0, 10) >= today)
    .sort((a, b) => a.startDateISO.localeCompare(b.startDateISO))[0];
};
```

### 4.2 Contagem Regressiva

**Regra (linha 343-353):**
- 0 a 30 dias antes: "Em 9 dias", "Amanhã", "Hoje"
- Mais de 30 dias ou passado: não exibe

```javascript
const getCountdownLabel = (isoString) => {
  const diffDays = Math.round(
    (Date.parse(tripDay) - Date.parse(getSaoPauloDateKey())) / 86400000
  );
  
  if (diffDays < 0 || diffDays > 30) return "";
  
  return new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" })
    .format(diffDays, "day");
};
```

### 4.3 Timezone Consistency

✅ **Todas as operações de data usam `America/Sao_Paulo`:**
```javascript
const getSaoPauloDateKey = (date = new Date()) => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date); // "2026-10-28"
};
```

---

## 5. STATUS DAS TRIPS

### 5.1 Estados Possíveis

| Status | Significado | Exibido no Site? |
|--------|-------------|------------------|
| `open` | Disponível para reserva | ✅ Sim (grid + hero) |
| `completed` | Viagem realizada | ❌ Não (vai pra GALLERY manualmente) |
| `closed` | Encerrada (vendas fechadas) | ❌ Não |
| `sold_out` | Esgotada | ⚠️ Depende da implementação |
| `cancelled` | Cancelada | ❌ Não |

### 5.2 Trips Atuais no JSON

```
1. Trilha em Lucena 29/11/2026  → status: "open"
2. Trilha em Lucena 18/10/2026  → status: "completed" (já passou)
3. Expedição Bonito 13/09/2026  → status: "completed"
4. OVER RIDERS Pinga 20/09/2026 → status: "completed"
```

**Total:** 1 trip futura, 3 realizadas (que deveriam estar em GALLERY automaticamente).

---

## 6. SEO E SCHEMA.ORG

### 6.1 Structured Data Gerado

**TravelAgency (linhas 93-117):**
```json
{
  "@type": "TravelAgency",
  "name": "OVERTRIP",
  "address": { "addressLocality": "Campina Grande", "addressRegion": "PB" },
  "aggregateRating": { "ratingValue": "4.9", "reviewCount": "20" }
}
```

**Event (gerado por trip):**
```javascript
const buildTripSchema = (trip) => ({
  "@type": "Event",
  "name": trip.title,
  "startDate": trip.startDateISO,
  "offers": {
    "price": trip.priceValue,
    "availability": trip.availabilitySchema
  }
});
```

**FAQPage (linhas 120-166):** 5 perguntas hardcoded.

---

## 7. INTEGRAÇÃO WHATSAPP

### 7.1 Número Configurado
```javascript
const WHATSAPP_NUMBER = "5583987745549"; // (83) 98774-5549
```

### 7.2 Mensagens Personalizadas

**Para trips pagas:**
```
Olá! Tenho interesse em [TÍTULO], com destino a [CIDADE - REGIÃO], 
no dia [DATA]. Vi no site o valor de [PREÇO] por pessoa e embarque 
em [PONTO]. Pode me passar os detalhes e a disponibilidade de vagas?
```

**Para eventos gratuitos (free: true):**
```
Olá! Quero participar de [TÍTULO], no dia [DATA]. 
Pode me passar as orientações e confirmar como faço para participar?
```

### 7.3 Campos Usados
- `data-wa-trip` → title
- `data-wa-date` → dateDisplay
- `data-wa-destination` → city + region
- `data-wa-meeting` → meetingInfo
- `data-wa-price` → priceDisplay
- `data-wa-kind` → "viajar" ou "participar"

---

## 8. MODAL PIX

### 8.1 Implementação
- QR Code pré-gerado: `assets/images/pagamentos/overtrip-pix-qr.png`
- Payload BR Code calculado em runtime (js/pix.js)
- Chave: `contato@overtrip.com.br`

### 8.2 Campos da Trip Usados
```javascript
openPixModal(trip) {
  titleEl.textContent = trip.title;
  priceEl.textContent = `Valor total: ${trip.priceDisplay} 
    (ou o sinal de 50%, conforme política de reserva)`;
}
```

**Observação:** Modal não usa `depositDisplay` - calcula 50% no texto.

---

## 9. MAPA DE DESTINOS

### 9.1 Problema Crítico
**Arquivo:** `js/map.js` (linhas 6-240)

```javascript
const VISITED_PLACES = [
  { title: "Praia de Camaçari", place: "Lucena - PB", lat: -6.885, lng: -34.884 },
  { title: "Praia de Bonsucesso", place: "Lucena - PB", lat: -6.871, lng: -34.895 },
  // ... 32+ destinos hardcoded com lat/lng
];
```

❌ **34 destinos hardcoded que deveriam vir de trips.json com status="completed"**

### 9.2 Bases (pontos de partida)
```javascript
const OVERTRIP_HUBS = [
  { title: "Campina Grande - PB", code: "CG", lat: -7.238, lng: -35.895 },
  { title: "Pocinhos - PB", code: "PC", lat: -7.077, lng: -36.060 }
];
```

### 9.3 Contador Stats
```javascript
// Linha 364-371: conta VISITED_PLACES.length
const updateTripsCountStat = () => {
  statEl.textContent = `+${VISITED_PLACES.length}`; // +34 visitas
};
```

⚠️ **Deveria contar trips.json com status="completed" automaticamente.**

---

## 10. GALERIA DE MEMÓRIAS

### 10.1 Estrutura Hardcoded
**Arquivo:** `js/data.js` (linhas 40-118)

```javascript
const GALLERY = [
  {
    title: "Praia de Coqueirinho - Conde - PB",
    date: "28 de maio de 2023",
    dateISO: "2023-05-28",
    description: "Praia, falésias...",
    images: [
      { src: "assets/images/...", alt: "..." }
    ]
  },
  // ... 7 entradas hardcoded
];
```

❌ **Deveria ser gerado automaticamente de trips.json com status="completed"**

### 10.2 Renderização
- Grid bento (1 destaque + 4 cards)
- "Ver mais" carrega +4 por vez
- Ordenação: dateISO descendente (mais recente primeiro)

---

## 11. KNOWLEDGE.JSON

### 11.1 Finalidade
Base de conhecimento para o **Agente OVERTRIP** (WhatsApp virtual assistant).

### 11.2 Estrutura
- company: nome, slogan, posicionamento
- contact: WhatsApp, Instagram, website
- history: timeline 2022-2026
- reservation: regras de pagamento (50% entrada, Pix: contato@overtrip.com.br)
- boarding: ponto padrão (Rodoviária Nova, Campina Grande)
- cancellation: política de reembolso
- communityStats: +100 membros, +34 destinos, 4.9 estrelas
- virtualAssistant: instruções do agente
- faq: 15 perguntas frequentes

### 11.3 Uso Atual
❌ **Não é consumido pelo site estático atual** (apenas pelo agente WhatsApp externo).

✅ **Poderia ser fonte de:**
- Números de prova social (4.9, +100, +34)
- Chave Pix
- Política de cancelamento
- FAQs

---

## 12. RISCOS IDENTIFICADOS

### 12.1 Duplicação de Dados ⚠️⚠️⚠️

| Dado | Fonte de Verdade | Cópias | Risco |
|------|------------------|--------|-------|
| Destinos visitados | trips.json (status="completed") | VISITED_PLACES hardcoded (34 destinos) | Alto - dessincronização |
| Memórias (galeria) | trips.json (completed) | GALLERY hardcoded (7 entradas) | Alto - esquecimento |
| Contagem de visitas | Derivado de trips | "+28" hardcoded | Médio - erro manual |
| Rating 4.9 | knowledge.json | HTML em 3 lugares | Médio - inconsistência |
| Chave Pix | knowledge.json | js/pix.js hardcoded | Baixo - raramente muda |

### 12.2 Manutenção Manual Necessária

**Ao publicar uma nova trip:**
1. ✅ Adicionar ao trips.json → OK, único lugar
2. ❌ Após realização, mudar status → "completed"
3. ❌ Adicionar à GALLERY manualmente → 7 campos
4. ❌ Adicionar ao VISITED_PLACES → lat/lng manual
5. ❌ Atualizar contador "+28 visitas" → buscar em 3 lugares

**Tempo estimado:** 30-45 minutos por trip realizada.  
**Propensão a erro:** Alta (4 operações manuais).

### 12.3 Inconsistências Atuais

**Exemplo real:**
- trips.json: 3 trips com status="completed"
- GALLERY: 7 memórias (4 não estão no trips.json atual!)
- VISITED_PLACES: 34 destinos
- Contador HTML: "+28 visitas"

❓ **Qual é a verdade? 3, 7, 28 ou 34 trips realizadas?**

---

## 13. COMPARAÇÃO DE ALTERNATIVAS ARQUITETURAIS

### Opção A: JSON Gerado (PostgreSQL → trips.json)

**Descrição:**
- Backend com PostgreSQL + Prisma para CRUD
- Script gera trips.json periodicamente (cron ou webhook)
- Site estático continua servindo JSON via HTTP
- Galeria, mapa e stats são derivados automaticamente

**Arquitetura:**
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Dashboard  │────▶│  PostgreSQL  │────▶│ Gerador     │
│  (Next.js)  │     │  + Prisma    │     │ trips.json  │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                 │
                                                 ▼
                                          ┌──────────────┐
                                          │  trips.json  │
                                          │  (público)   │
                                          └──────┬───────┘
                                                 │
                                                 ▼
                                          ┌──────────────┐
                                          │ Site Estático│
                                          │ (Apache)     │
                                          └──────────────┘
```

**Vantagens:**
- ✅ Site estático permanece rápido (CDN, cache agressivo)
- ✅ Baixo custo de hosting (Apache simples)
- ✅ Zero overhead no runtime (sem queries ao visitar)
- ✅ Funciona offline após 1º carregamento
- ✅ Compatível com arquitetura atual (migração suave)
- ✅ Dados derivados gerados automaticamente (GALLERY, VISITED_PLACES)
- ✅ PostgreSQL não exposto à internet

**Desvantagens:**
- ❌ Delay entre publicação e visualização (até próximo build)
- ❌ Dois sistemas para manter (dashboard + gerador + site)
- ❌ Complexidade do pipeline de build
- ❌ Sincronização pode falhar silenciosamente

**Risco de Segurança:** 🟢 Baixo
- PostgreSQL apenas acessível pelo backend (VPC/localhost)
- trips.json é público por design (sem dados sensíveis)
- Tokens/credenciais ficam no backend

**Risco Operacional:** 🟡 Médio
- Dependência do gerador (se falhar, site fica desatualizado)
- Necessita monitoramento (alertas de falha no build)
- Rollback requer regerar JSON anterior

**Complexidade:** 🟡 Média
- Backend: Next.js + Prisma (padrão de mercado)
- Gerador: Node.js script (200-300 linhas)
- Deploy: 2 ambientes separados

**Custo:** 💰 Baixo
- Hosting frontend: $5-10/mês (Vercel/Netlify)
- PostgreSQL: $10-25/mês (Supabase/Railway)
- Total: ~$20/mês

---

### Opção B: API (PostgreSQL → API REST → Site)

**Descrição:**
- Backend expõe API REST pública (/api/trips)
- Site estático faz fetch da API em runtime
- Dados sempre atualizados em tempo real

**Arquitetura:**
```
┌─────────────┐     ┌──────────────┐
│  Dashboard  │────▶│  PostgreSQL  │
│  (Next.js)  │     │  + Prisma    │
└─────────────┘     └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  API REST    │
                    │  (pública)   │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Site Estático│
                    │ fetch() API  │
                    └──────────────┘
```

**Vantagens:**
- ✅ Dados sempre atualizados (zero delay)
- ✅ Um único backend (menos moving parts)
- ✅ Filtros e buscas podem rodar no servidor (mais rápido)
- ✅ Fácil adicionar features (webhooks, notificações)

**Desvantagens:**
- ❌ Latência em cada acesso (query + rede)
- ❌ Custo de infra mais alto (API sempre online)
- ❌ CORS, rate limiting, monitoramento
- ❌ PostgreSQL exposto via API (superfície de ataque)
- ❌ Performance do site depende da API (SPOF - Single Point of Failure)
- ❌ Sem cache agressivo (dados mudam frequentemente)

**Risco de Segurança:** 🟡 Médio
- API pública (DDoS, abuse, scraping)
- Necessita rate limiting robusto
- Exposição indireta do banco (via API)
- Risco de SQL injection se mal implementado

**Risco Operacional:** 🔴 Alto
- API down = site quebrado (loading infinito)
- Necessita monitoramento 24/7
- Custos variáveis (tráfego, requests)
- Scaling complexo (cache, CDN, load balancer)

**Complexidade:** 🔴 Alta
- Backend: autenticação, autorização, validação
- API: rotas, middleware, error handling
- Infra: cache (Redis?), rate limiting, monitoring
- Frontend: loading states, error recovery, retries

**Custo:** 💰💰 Médio-Alto
- Backend + API: $15-30/mês
- PostgreSQL: $10-25/mês
- Redis (cache): $10/mês (opcional)
- Monitoring: $10-20/mês
- Total: ~$45-85/mês

---

### Opção C: Aplicação Integrada (Next.js Full-Stack)

**Descrição:**
- Next.js com Server Components + Prisma
- Renderização híbrida (SSR + ISR)
- PostgreSQL acessível apenas pelo backend interno

**Arquitetura:**
```
┌────────────────────────────────┐
│         Next.js App            │
│  ┌─────────────────────────┐   │
│  │   Dashboard (Admin)     │   │
│  │   /admin/trips          │   │
│  └───────────┬─────────────┘   │
│              │                  │
│              ▼                  │
│  ┌─────────────────────────┐   │
│  │   Prisma ORM            │   │
│  └───────────┬─────────────┘   │
│              │                  │
│              ▼                  │
│  ┌─────────────────────────┐   │
│  │   PostgreSQL            │   │
│  └───────────┬─────────────┘   │
│              │                  │
│              ▼                  │
│  ┌─────────────────────────┐   │
│  │  Server Components      │   │
│  │  fetch(prisma)          │   │
│  └───────────┬─────────────┘   │
│              │                  │
│              ▼                  │
│  ┌─────────────────────────┐   │
│  │   Site Público          │   │
│  │   / (SSR/ISR)           │   │
│  └─────────────────────────┘   │
└────────────────────────────────┘
```

**Vantagens:**
- ✅ Arquitetura moderna e consolidada
- ✅ Um único codebase (menos contexto switching)
- ✅ Type-safety end-to-end (TypeScript + Prisma)
- ✅ ISR = performance + dados atualizados
- ✅ PostgreSQL 100% privado (localhost)
- ✅ Ecossistema rico (auth, forms, validação)

**Desvantagens:**
- ❌ Migração total (reescrever site inteiro)
- ❌ Vendor lock-in (Vercel recomendado)
- ❌ Custo mais alto que estático puro
- ❌ Complexidade de deploy (builds, envs)
- ❌ Perde simplicidade do HTML puro

**Risco de Segurança:** 🟢 Baixo
- PostgreSQL 100% privado (não exposto)
- Next.js API routes com auth embutida
- CSRF protection nativa
- Ambiente controlado (Vercel)

**Risco Operacional:** 🟡 Médio
- Dependência de plataforma (Vercel/Railway)
- Build time pode ser longo (imagens otimizadas)
- Rollback via Git (padrão)

**Complexidade:** 🔴 Alta
- Full rewrite do frontend (React + Next.js)
- Curva de aprendizado (SSR, ISR, Server Components)
- Configuração de build (next.config.js, middleware)
- Prisma migrations

**Custo:** 💰💰 Médio
- Vercel Pro: $20/mês (ou Hobby $0 com limites)
- PostgreSQL: $10-25/mês
- Total: ~$30/mês (pode ser $10 em Hobby tier)

---

## 14. MATRIZ DE DECISÃO

### 14.1 Critérios Ponderados

| Critério | Peso | Opção A | Opção B | Opção C |
|----------|------|---------|---------|---------|
| **Performance** | 25% | 10 🟢 | 5 🟡 | 8 🟢 |
| **Segurança** | 20% | 9 🟢 | 6 🟡 | 10 🟢 |
| **Manutenibilidade** | 15% | 7 🟡 | 6 🟡 | 8 🟢 |
| **Custo** | 15% | 9 🟢 | 5 🟡 | 7 🟢 |
| **Risco Operacional** | 10% | 7 🟡 | 4 🔴 | 7 🟡 |
| **Facilidade Migração** | 10% | 9 🟢 | 8 🟢 | 3 🔴 |
| **Flexibilidade Futura** | 5% | 6 🟡 | 9 🟢 | 8 🟢 |
| **TOTAL PONDERADO** | 100% | **8.25** 🥇 | **5.65** | **7.70** |

### 14.2 Análise de Casos de Uso

#### **Publicar nova trip:**
- **Opção A:** Dashboard → PostgreSQL → Trigger build → 2-5 min → Online 🟡
- **Opção B:** Dashboard → PostgreSQL → API → Instantâneo 🟢
- **Opção C:** Dashboard → PostgreSQL → Revalidate ISR → 30s 🟢

#### **Editar trip existente:**
- **Opção A:** Edita → Rebuild → 2-5 min 🟡
- **Opção B:** Edita → Instantâneo 🟢
- **Opção C:** Edita → Revalidate → 30s 🟢

#### **Site fora do ar durante deploy:**
- **Opção A:** ❌ Não (trips.json já está lá, build não derruba) 🟢
- **Opção B:** ✅ Sim (API down = site quebrado) 🔴
- **Opção C:** ✅ Sim (builds podem dar erro) 🟡

#### **Pico de tráfego (10k visitas simultâneas):**
- **Opção A:** Sem problemas (Apache + CDN) 🟢
- **Opção B:** Overload na API ($$$, scaling) 🔴
- **Opção C:** Vercel escala automático ($$) 🟡

#### **Rollback de emergência:**
- **Opção A:** Git revert → Rebuild → 5 min 🟡
- **Opção B:** Git revert → Deploy API → 2 min 🟢
- **Opção C:** Git revert → Rebuild → 5 min 🟡

---

## 15. RECOMENDAÇÃO ARQUITETURAL

### 15.1 Escolha: **Opção A - JSON Gerado** 🥇

**Justificativa:**

1. **Performance e Escala:** Site estático com CDN é imbatível em custo/performance. OVERTRIP tem picos de tráfego (lançamento de trips) que seriam caros na Opção B.

2. **Segurança:** PostgreSQL 100% isolado, sem exposição pública. Apenas o JSON (dados públicos por design) é servido.

3. **Custo-Benefício:** ~$20/mês vs $45-85/mês (Opção B) ou $30+/mês (Opção C com builds frequentes).

4. **Compatibilidade:** Migração incremental sem reescrever o frontend. Usa a arquitetura atual como base.

5. **Resiliência:** Site funciona mesmo se backend cair (último JSON publicado). Na Opção B, API down = site down.

6. **Simplicidade:** HTML/CSS/JS puro é fácil de debugar, modificar e entender. Zero dependências de frameworks frontend.

**Trade-off aceito:**
- Delay de 2-5 minutos entre publicação e visualização. Para OVERTRIP, isso é aceitável (trips não mudam a cada segundo).

---

### 15.2 Plano de Implementação (Fases)

#### **Fase 0: Validação e Preparação (1-2 dias)**
- Script Node.js para validar trips.json atual
- Gerar GALLERY e VISITED_PLACES automaticamente
- Confirmar que nenhum campo crítico está faltando

#### **Fase 1: Backend Dashboard (1 semana)**
- Next.js + Prisma + PostgreSQL
- CRUD de trips (apenas o essencial)
- Auth simples (usuário único da equipe)
- Sem publicação ainda (apenas edição)

#### **Fase 2: Gerador de JSON (3-4 dias)**
- Script que lê PostgreSQL e gera trips.json
- Derivação automática:
  - GALLERY de trips com status="completed"
  - VISITED_PLACES de trips.geoLocation (novo campo lat/lng)
  - Stats (contadores) de knowledge.json
- Webhook ou botão manual "Publicar"

#### **Fase 3: Integração e Testes (2-3 dias)**
- Deploy do dashboard
- Teste completo do fluxo: criar trip → publicar → verificar site
- Validação de SEO (Schema.org)
- Testes de performance (Lighthouse)

#### **Fase 4: Migração de Dados (1 dia)**
- Importar trips.json atual para PostgreSQL
- Importar GALLERY e VISITED_PLACES
- Validar consistência

#### **Fase 5: Go-Live (1 dia)**
- Primeira publicação real via dashboard
- Monitoramento de erros
- Rollback plan documentado

**Tempo total estimado:** 2-3 semanas (desenvolvimento part-time).

---

### 15.3 Arquitetura Detalhada Proposta

```
┌────────────────────────────────────────────────────────────┐
│                    INFRAESTRUTURA                          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────┐         ┌───────────────────┐      │
│  │  Dashboard       │         │  PostgreSQL       │      │
│  │  (Next.js)       │────────▶│  Database         │      │
│  │                  │         │  (Private)        │      │
│  │  /admin/trips    │         └─────────┬─────────┘      │
│  │  /admin/settings │                   │                │
│  └────────┬─────────┘                   │                │
│           │                             │                │
│           │ (Botão "Publicar")          │                │
│           │                             │                │
│           ▼                             │                │
│  ┌──────────────────┐                  │                │
│  │  Gerador JSON    │◀─────────────────┘                │
│  │  (Node.js)       │                                    │
│  │                  │                                    │
│  │  - Lê PostgreSQL │                                    │
│  │  - Gera trips.json                                    │
│  │  - Deriva GALLERY │                                   │
│  │  - Deriva VISITED_PLACES                              │
│  │  - Copia para /public                                 │
│  └────────┬─────────┘                                    │
│           │                                               │
│           ▼                                               │
│  ┌──────────────────┐                                    │
│  │  trips.json      │                                    │
│  │  (Gerado)        │                                    │
│  └────────┬─────────┘                                    │
│           │                                               │
│           │ (Deploy via rsync/FTP/Git)                   │
│           │                                               │
└───────────┼───────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────────┐
│                  SITE PÚBLICO (Apache)                     │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  GET /trips.json                                           │
│  ─────────────▶ trips.json (estático, cacheável)          │
│                                                            │
│  index.html + js/render.js renderizam os dados            │
│                                                            │
│  ✅ Performance: CDN + cache agressivo                     │
│  ✅ Zero queries em runtime                                │
│  ✅ Funciona offline após 1º load                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

### 15.4 Esquema PostgreSQL Proposto

```sql
-- Tabela principal de trips
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação
  title TEXT NOT NULL,
  headline_display TEXT,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  
  -- Localização
  city TEXT NOT NULL,
  region TEXT NOT NULL,
  geo_lat DECIMAL(10, 7), -- Novo: coordenadas para mapa
  geo_lng DECIMAL(10, 7),
  
  -- Datas
  start_date_iso TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date_iso TIMESTAMP WITH TIME ZONE,
  date_display TEXT, -- Gerado: "Domingo, 29/11/2026"
  schedule_tbd BOOLEAN DEFAULT false,
  
  -- Horários
  departure_time TEXT,
  departure_tolerance TEXT,
  return_time TEXT,
  schedule_info TEXT,
  
  -- Preços
  price_display TEXT,
  price_value DECIMAL(10, 2),
  price_unit TEXT DEFAULT 'por pessoa',
  deposit_display TEXT, -- Gerado: 50% arredondado
  remaining_display TEXT, -- Gerado
  remaining_deadline_display TEXT, -- Gerado
  free BOOLEAN DEFAULT false,
  
  -- Embarque
  meeting_city TEXT,
  meeting_point TEXT,
  meeting_info TEXT, -- Gerado de departures
  meeting_details TEXT, -- Gerado
  meeting_maps_query TEXT,
  
  -- Características
  intensity_class TEXT CHECK (intensity_class IN ('leve', 'moderado', 'difícil')),
  intensity_label TEXT, -- Gerado: "Intensidade moderada"
  spots_left INTEGER,
  trail_distance TEXT,
  support_point TEXT,
  support_point_info TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'open', 'completed', 'cancelled', 'sold_out', 'closed')
  ),
  availability_schema TEXT DEFAULT 'https://schema.org/InStock',
  
  -- Arrays (JSON)
  includes JSONB, -- ["Banho de rio", "Mirante"]
  includes_highlight TEXT,
  included_services JSONB,
  itinerary JSONB,
  route_notes JSONB,
  important_info JSONB,
  media JSONB, -- [{ src, alt, focus, type }]
  
  -- CTA
  button_label TEXT DEFAULT 'Quero viajar',
  button_class TEXT DEFAULT 'button-dark',
  
  -- Metadados
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  published_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de múltiplos pontos de embarque
CREATE TABLE trip_departures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  time TEXT NOT NULL,
  place TEXT NOT NULL,
  city TEXT NOT NULL,
  maps_url TEXT,
  maps_query TEXT,
  order_index INTEGER NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_start_date ON trips(start_date_iso);
CREATE INDEX idx_trip_departures_trip_id ON trip_departures(trip_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_trips_updated_at
BEFORE UPDATE ON trips
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

---

### 15.5 Campos Derivados Automaticamente

**No momento da geração do JSON:**

```javascript
// js/generator.js (conceito)
function generateTripsJSON(dbTrips) {
  return dbTrips.map(trip => ({
    // Campos do banco
    ...trip,
    
    // Derivados
    dateDisplay: formatTripDate(trip.start_date_iso),
    intensityLabel: `Intensidade ${trip.intensity_class}`,
    depositDisplay: calculateDeposit(trip.price_value, 0.5),
    remainingDisplay: calculateRemaining(trip.price_value, 0.5),
    remainingDeadlineDisplay: formatDeadline(trip.start_date_iso, -2),
    meetingInfo: trip.departures.length > 0
      ? trip.departures.map(d => `${d.city} (${d.place})`).join(' e ')
      : `${trip.meeting_city} (${trip.meeting_point})`
  }));
}

function generateGallery(dbTrips) {
  return dbTrips
    .filter(t => t.status === 'completed')
    .map(trip => ({
      title: trip.title,
      date: formatDate(trip.start_date_iso),
      dateISO: trip.start_date_iso.split('T')[0],
      description: trip.description,
      images: trip.media
    }));
}

function generateVisitedPlaces(dbTrips) {
  return dbTrips
    .filter(t => t.status === 'completed' && t.geo_lat && t.geo_lng)
    .map(trip => ({
      title: trip.title,
      place: `${trip.city} - ${trip.region}`,
      date: formatDate(trip.start_date_iso),
      lat: trip.geo_lat,
      lng: trip.geo_lng
    }));
}
```

---

### 15.6 Segurança e Validação

**Dashboard (Admin):**
- Auth: NextAuth.js com email/senha (1 usuário da equipe OVERTRIP)
- HTTPS obrigatório
- CSRF tokens
- Rate limiting em rotas sensíveis

**Gerador JSON:**
- Valida todos campos obrigatórios
- Sanitiza HTML (XSS prevention)
- Valida datas (timezone consistency)
- Valida URLs de imagens
- Testa JSON gerado antes de publicar

**PostgreSQL:**
- Constraints (CHECK, NOT NULL, FOREIGN KEY)
- Triggers para campos derivados
- Backup diário automático
- Acesso apenas via localhost/VPC

**Site Público:**
- Continua sem mudanças (HTML puro)
- trips.json tem apenas dados públicos
- Sem credenciais ou segredos

---

## 16. RISCOS E MITIGAÇÕES

### 16.1 Riscos Técnicos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Gerador JSON falha silenciosamente | Média | Alto | Logs + alertas via email/Slack |
| Delay na publicação causa confusão | Baixa | Médio | Indicador "Publicando..." no dashboard |
| trips.json corrompido | Baixa | Alto | Validação + backup antes de sobrescrever |
| Inconsistência entre PostgreSQL e JSON | Média | Alto | Hash check + re-geração forçada |
| Imagens 404 (src inválido) | Média | Médio | Validação de URLs + fallback no frontend |

### 16.2 Riscos de Negócio

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Equipe não adota dashboard | Baixa | Alto | UX simples + treinamento |
| Custo de hosting sobe | Baixa | Médio | Monitoramento de custos + alertas |
| Dependência de desenvolvedor | Média | Médio | Documentação completa + código limpo |

---

## 17. PRÓXIMOS PASSOS

### 17.1 Imediato (Esta Sprint)
1. ✅ **Auditoria concluída** (este documento)
2. 📝 Validar recomendação com stakeholders
3. 🎯 Definir campos adicionais necessários (geo_lat, geo_lng)
4. 📦 Criar script de migração trips.json → PostgreSQL

### 17.2 Sprint 1 (Semana 1)
- Setup do projeto Next.js + Prisma
- Definição do schema PostgreSQL
- Autenticação básica
- CRUD de trips (UI mínima)

### 17.3 Sprint 2 (Semana 2)
- Gerador de JSON
- Validações e derivações
- Webhook de publicação
- Testes end-to-end

### 17.4 Sprint 3 (Semana 3)
- Migração de dados
- Deploy em staging
- Testes com equipe OVERTRIP
- Ajustes de UX

### 17.5 Sprint 4 (Semana 4)
- Go-live
- Monitoramento
- Documentação final

---

## 18. CONCLUSÃO

O projeto OVERTRIP v6 está **bem estruturado** como site estático, mas sofre de **duplicação de dados** e **manutenção manual** excessiva. A transição para um backend gerenciado com **geração automática de JSON** (Opção A) resolve os problemas identificados mantendo as vantagens atuais de performance e simplicidade.

**Principais Ganhos:**
- ✅ Eliminação de duplicação (GALLERY, VISITED_PLACES)
- ✅ Campos derivados calculados automaticamente
- ✅ Redução de 30-45 min → 5 min por trip publicada
- ✅ Consistência garantida (fonte única de verdade)
- ✅ Segurança melhorada (PostgreSQL isolado)
- ✅ Mantém performance e custo baixo do estático

**Riscos Mitigados:**
- 🛡️ Delay de publicação comunicado claramente
- 🛡️ Validação rigorosa antes de gerar JSON
- 🛡️ Fallbacks e monitoramento robusto
- 🛡️ Rollback simples (Git + regeneração)

**Recomendação Final:** **Proceder com Opção A** - JSON Gerado via PostgreSQL.

---

**Documento gerado por:** Kiro AI  
**Revisão recomendada por:** Equipe técnica OVERTRIP  
**Próxima etapa:** Validação de stakeholders e aprovação para Fase 0
