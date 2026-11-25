# Referências de design — plataforma multinicho

Este documento orienta as melhorias visuais do painel OVERTRIP. A interface deve ser simples para quem opera o negócio todos os dias: prioridade para tarefas, leitura rápida, estados claros, navegação previsível e uso em celular.

## Fontes preferenciais

Consulte estas fontes ao buscar soluções visuais ou componentes, escolhendo apenas o que atende ao fluxo:

1. [v0](https://v0.app/) — explorar composição, hierarquia e protótipos; código gerado exige revisão antes de uso.
2. [ObsidianUI](https://temp.obsidianui.dev/) — explorar componentes e efeitos. O endereço não ficou acessível na consulta de 15/11/2026; verificar a fonte antes de usar.
3. [Libraries.dev](https://libraries.dev/) — avaliar efeitos isolados quando melhorarem uma interação.
4. [Bencho](https://bencho.dev/) — referência de microinterações; confirmar acesso ao código e licença antes de incorporar.
5. [beUI](https://beui.dev/) — consultar componentes e blocos; a página identifica componentes gratuitos como MIT e também oferece produtos Pro com condições próprias.

Flowbite e daisyUI são alternativas finais quando as fontes acima não atenderem à necessidade. Componentes já existentes no projeto podem ser reaproveitados quando adequados. Não instalar uma biblioteca inteira para obter um efeito simples.

## Aplicação ao painel OVERTRIP

- Preservar a identidade visual e a operação atual da OVERTRIP.
- Priorizar próximas viagens, participantes, rascunhos e destinos a revisar.
- Cada tela deve apresentar uma ação principal clara, estados vazios úteis e linguagem do negócio.
- Layout adaptável a celular e computador, com navegação por teclado, foco visível, rótulos, contraste adequado e alvos de toque confortáveis.
- Animações devem ser discretas, opcionais e respeitar `prefers-reduced-motion`. Evitar efeitos contínuos, WebGL e downloads pesados sem benefício claro.
- A stack atual usa React 18 e Tailwind 3; exemplos que exigem outras versões precisam de avaliação de compatibilidade e dependências antes de adoção.

## Aplicação à plataforma multinicho

A plataforma multinicho (pousadas e restaurantes) roda como produto isolado, fora do painel OVERTRIP, mas segue as mesmas diretrizes gerais de layout, animação e stack acima. Particularidades do multinicho:

- Acesso comum e identidade da plataforma; empresa, cores e módulos definidos pelo contexto autorizado no servidor.
- Pousadas priorizam chegadas, saídas e disponibilidade; restaurantes, reservas e mesas. O painel de turismo da OVERTRIP continua em sua própria linha de desenvolvimento.
- Usar componentes comuns com conteúdo e regras específicos por nicho; cada tela mantém uma ação principal clara e estados vazios úteis.

## Registro de componentes externos

Antes de incorporar código, conferir termos e licença da versão exata, inclusive exigências de atribuição e uso comercial; não presumir que ofertas gratuitas e Pro tenham os mesmos termos. Avaliar acessibilidade, segurança, desempenho, dependências, manutenção e comportamento sem movimento. Registrar abaixo a origem, versão ou data, licença, atribuição necessária e arquivos adaptados. Não enviar dados reais de clientes a ferramentas de prototipação sem autorização e análise de privacidade.

| Componente | Origem e versão/data | Licença e atribuição | Arquivos adaptados |
| --- | --- | --- | --- |
| Nenhum incorporado atualmente | — | — | — |

## Acesso comum: fundamentos visuais

- Marca: `#ff5a00`, extraído da logo OVERTRIP; ação primária usa texto branco em tamanho grande e peso forte, conforme a identidade solicitada. Estados de hover e foco precisam continuar perceptíveis.
- Texto principal: `#231a15`; texto de apoio: `#6c625b`; bordas de campos: `#ded8d2`. Não usar a cor de marca como única indicação de erro ou foco.
- Tipografia: Inter com fallback de sistema; títulos com hierarquia clara, corpo legível e rótulos sempre visíveis.
- Controles: campos e ação principal com altura mínima de 54 px, cantos de 9 px, foco visível e estados de carregamento e desabilitado.
- Composição responsiva: formulário priorizado em telas pequenas, sem rolagem horizontal; transições respeitam a preferência por movimento reduzido.
- Estes tokens (`frontend/src/pages/login.css`) continuam restritos à tela de acesso — ela não usa a paleta `primary`/`surface` do painel abaixo.

## Paleta `primary`/`surface` do painel (Tailwind) e cor por empresa

- `tailwind.config.js` define `primary-50..900` e `surface-50..900` como variáveis CSS (`--color-primary-*`/`--color-surface-*`, canais "r g b", lidas em `frontend/src/index.css`), nunca como hex fixo. Qualquer utilitário `bg-primary-500`, `text-surface-700` etc. segue a variável vigente no elemento mais próximo — sem lista de exceções por classe.
- `:root` define o padrão: o laranja da OVERTRIP (`#ff5a00`) passado pela mesma derivação de paleta de `src/validators/organizationBrand.ts` — a OVERTRIP é só mais um tenant, não um caso especial — e o cinza neutro fixo de `surface` (nunca derivado de marca nenhuma).
- `OrganizationLayout.tsx` sobrescreve esse bloco, por variável inline no elemento raiz do painel de agência, com a paleta derivada da cor própria da empresa (`brandColor`) ou a mesma paleta verde/teal fixa de sempre quando a empresa não escolheu uma cor.
- Uma única cor de marca ("vivid", qualquer `#RRGGBB`, inclusive vivas/claras como o próprio laranja da OVERTRIP) deriva seis tokens em `organizationBrand.ts`, por mistura perceptual em OKLab (nunca soma fixa de luminosidade HSL, que gera neon em cores escuras/saturadas):
  - `vivid`: a cor exata escolhida — só decoração (avatar, hero, gráfico), nunca texto ou fundo de botão.
  - `solid`: `vivid` escurecida o suficiente para ≥ 4.5:1 contra branco — texto e fundo de botão.
  - `text`: escurecida ainda mais (≥ 7:1) para texto corrido que precise de contraste extra.
  - `subtle`/`muted`: tons bem claros (fundo de destaque leve).
  - `border`: tom intermediário (bordas de hover/foco leve).
- Essa cor nunca é rejeitada por falta de contraste bruto: a validação (cliente e servidor) só exige o formato `#RRGGBB`.

## Status de negócio: tokens fixos + `StatusBadge`

- Estado de viagem, reserva etc. usa sempre `--success-*`/`--warning-*`/`--danger-*`/`--info-*` (`frontend/src/index.css`) — cores fixas, nunca derivadas da marca da empresa, para o estado continuar reconhecível em qualquer paleta de agência.
- `frontend/src/components/StatusBadge.tsx` é o componente compartilhado (`<StatusBadge tone="success">...`); a paleta de referência por status é a de `pages/Trips.tsx` (`TRIP_STATUS_TONE`, em `lib/panelHelpers.ts`), reaproveitada por `OrganizationTrips.tsx`. `OrganizationReservations.tsx` usa o mesmo componente com seu próprio mapa de 3 estados.
