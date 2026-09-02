# OVERTRIP — No Destination

Landing page da OVERTRIP, uma marca de experiências, turismo e comunidade que nasceu de viagens entre amigos saindo de Campina Grande e Pocinhos - PB.

> **Move Different. No Destination.**
> O destino é só um detalhe — o que importa é o que acontece no caminho.

---

## Sobre o projeto

A OVERTRIP não se posiciona como uma agência de turismo tradicional. A comunicação evita linguagem institucional ("excursão", "pacote") e reforça o conceito de viagem como estilo de vida — presença, conexão e memórias reais. A marca nasceu do rebranding da antiga **CG.TRIP**.

Vocabulário de marca a manter em qualquer novo texto:
- **"Expedição"**, não "excursão"
- **"Embarque"**, **"investimento"** (não "pagamento"/"preço" isolado)
- Pilares: **Agência** (execução) · **Experiência** (o diferencial) · **Lifestyle** (comunidade/produtos)

## Estrutura da página (`index.html`)

Seções na ordem em que aparecem, numeradas nos comentários do HTML e do CSS (mesma numeração nos dois arquivos, pra navegar rápido entre eles):

| # | Seção | Conteúdo |
|---|---|---|
| 3 | Header / Navegação | Menu fixo, hambúrguer no mobile |
| 6 | Hero | Slogan, CTA principal |
| 7 | Próxima trip | Grid de expedições (gerado via JS) |
| 8 | Sobre + Nossa história | Origem da marca, stats, timeline |
| 9 | Universo da marca | Expeditions / Comunidade / Store |
| 10 | Mapa | Lugares já visitados (Leaflet) |
| 11 | Como funciona | 3 passos + faixa "Move Different" |
| 12 | Galeria | Memórias de viagens anteriores |
| 13 | Vozes | Depoimentos em carrossel |
| 14 | FAQ | Dúvidas frequentes (acordeão) |
| 15 | CTA final | Chamada de fechamento |
| 16 | Footer | Marca, links, contato, créditos |
| 17 | Botão flutuante de WhatsApp | + balão de aviso |

## Tecnologia

**Stack:** HTML, CSS e JavaScript puro — sem framework, sem build step.

- **Mapa:** [Leaflet](https://leafletjs.com/) via CDN (unpkg, sem SRI — ver observação abaixo) + tiles públicas da OpenStreetMap (sem chave de API).
- **Pagamento:** Pix via BR Code (padrão Bacen), com QR code **pré-gerado como imagem estática** (`assets/images/pix-qr-overtrip.png`) — o payload é sempre o mesmo (chave, nome e cidade fixos), então gerar o QR dinamicamente a cada abertura do modal só deixava mais lento.
- **SEO:** Schema.org (`TravelAgency`, `FAQPage`, `Event` por trip), meta tags completas (Open Graph, Twitter Card).
- **Analytics:** hooks já implementados (`pushAnalyticsEvent` em `script.js`, dispara em cliques de WhatsApp e Pix) — funcionam com GTM (`dataLayer`) ou GA4 (`gtag`), o que estiver instalado. **Pendente:** nenhum dos dois está instalado ainda (ver [Pendências](#pendências)).

## Arquivos

```
index.html      Marcação e conteúdo estático (SEO, schema.org, meta tags)
styles.css      Todo o CSS, mobile-first, seções numeradas 1–19
script.js       Dados (trips/galeria/depoimentos), renderização, Pix, comportamento geral
map.js          Dados do mapa (lugares visitados + hubs) e inicialização do Leaflet
README.md       Este arquivo
```

`script.js` e `map.js` são arquivos separados de propósito (preferência de organização do projeto) e seguem o mesmo padrão de comentários em blocos nomeados que o CSS.

### Fonte única de dados

Trips, galeria e depoimentos vivem em arrays no topo do `script.js` (`TRIPS`, `GALLERY`, `TESTIMONIALS`) e são renderizados em runtime — inclusive o schema.org `Event` de cada trip é gerado a partir do mesmo array `TRIPS`, então data, preço e descrição nunca divergem entre o que a pessoa vê e o que o Google lê.

O mesmo vale para o mapa: `VISITED_PLACES` e `OVERTRIP_HUBS`, no `map.js`, alimentam tanto os pins quanto a lista lateral "Destinos & roteiros".

**Pra adicionar uma nova expedição:** adicionar um objeto no array `TRIPS` (`script.js`). Todos os campos são obrigatórios — não inventar vagas, coordenadas ou datas; confirmar com o time antes de publicar.

## Rodando localmente

Não tem build step. Basta servir os arquivos estáticos:

```bash
npx serve .
# ou
python3 -m http.server 8000
```

Abrir `http://localhost:<porta>/`.

## Deploy

Subir os quatro arquivos (`index.html`, `styles.css`, `script.js`, `map.js`) junto com a pasta `assets/` (imagens + `pix-qr-overtrip.png`) pra raiz do domínio. Não há etapa de build/compilação.

⚠️ **Sempre subir os quatro arquivos juntos.** Como não há controle de versão automatizado nesse fluxo, atualizar só um arquivo por vez já causou desencontros (ex: `script.js` antigo sobrescrevendo uma correção que só existia numa versão mais nova).

## Pendências

- [ ] **Analytics**: falta o ID do GA4 ou GTM pra ativar o tracking que já está implementado.
- [ ] **Política de cancelamento**: a resposta do FAQ sobre reembolso é genérica; falta a regra real (prazo/percentual) pra deixar mais concreta.
- [ ] **CADASTUR / CNPJ**: registro formal em andamento — nada no site menciona isso ainda (correto por enquanto).
- [ ] **Mais de uma trip ativa**: hoje só existe uma expedição no ar; vale manter 2–3 sempre visíveis (mesmo com "data a confirmar") pra não passar impressão de operação pausada.

## Decisões técnicas que vale lembrar

- **CDN do Leaflet sem SRI** (`integrity`): removido de propósito depois de causar falha silenciosa de carregamento — se for adicionar SRI de volta, testar com cuidado.
- **Tiles OpenStreetMap, não CARTO**: a CARTO passou a exigir cadastro/API key no estilo "Voyager" (antes usado); trocado pro servidor público da OSM pra não depender de conta nenhuma.
- **QR do Pix é uma imagem estática**, não gerada por API a cada abertura — ver `setupPixModal()` em `script.js`. Se a chave Pix mudar um dia, gerar um novo PNG com o novo payload e substituir o arquivo.
- **`startDateISO`** é o campo canônico de data de cada trip — toda exibição de data, o schema.org e a lógica de "vagas abertas" partem dele. Não duplicar data em outro campo.

---

Gabriel Souza | [github.com/gabriel-souza-developer](https://github.com/gabriel-souza-developer)
