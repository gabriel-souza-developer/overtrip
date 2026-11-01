# Viagens, IA e Agente OVERTRIP — plano de evolução

## Objetivo

Uma viagem é um único registro operacional no banco. Site, painel e Agente
OVERTRIP usam projeções desse registro; `trips.json` é somente fallback do
site, nunca fonte para atendimento ou operação.

## Estado atual (novembro de 2026)

- `Trip` no SQLite/Prisma é a fonte de dados; o site já a lê por
  `/api/public/trips`.
- O painel aceita rascunho com IA a partir de texto livre. A IA retorna dados
  candidatos e avisos; não publica nem altera status.
- O status legado (`DRAFT`, `OPEN`, `SOLD_OUT`, `CLOSED`, `COMPLETED`,
  `CANCELLED`) ainda mistura publicação, venda e operação.
- O WhatsApp hoje é apenas um número configurável. Não existe integração de
  bot, upload de PDF, armazenamento de documentos ou credencial de canal.

## Decisões de arquitetura

1. **Um agregado Trip, projeções distintas.** Não duplicar viagens para site,
   operação e agente. Cada consumidor recebe só os campos que pode usar.
2. **Estado será separado gradualmente.** O campo legado continua compatível
   enquanto a migração ocorrer. O destino é `publicationStatus` (rascunho,
   revisão, publicada, arquivada), `salesStatus` (disponível, esgotada,
   encerrada) e `tripStatus` (planejada, realizada, cancelada).
3. **Ausência não significa “a confirmar”.** Informações incertas precisam de
   sinal explícito. A primeira implementação adiciona `meetingTBD`; datas e
   disponibilidade terão equivalentes quando o fluxo permitir rascunhos ainda
   mais curtos.
4. **A IA propõe; uma pessoa confirma.** Extração de texto/PDF produz campos
   candidatos, avisos e origem. Ela nunca publica, confirma reserva ou muda
   preço/vaga.
5. **A API do agente é privada.** Não criar endpoints públicos
   `/api/assistant/*`. O futuro conector de WhatsApp autentica-se como serviço
   e recebe catálogo deliberadamente reduzido. Rascunhos, custos, notas,
   documentos e dados de clientes ficam fora dele.

## Regras de prontidão

| Objetivo | Necessário |
| --- | --- |
| Salvar rascunho | nome, cidade, UF e data de saída (regra atual, mantida nesta fase) |
| Publicar no site | rascunho + foto, preço ou gratuidade, resumo e embarque definido ou marcado “a confirmar” |
| Responder com segurança no agente | publicação + viagem disponível + informações comunicáveis aprovadas; dados ausentes geram encaminhamento humano |

Os elementos de comunicação padrão — CTA, unidade “por pessoa”, estilo do
card, mensagem de WhatsApp e regra de vagas — não devem ser editados em cada
viagem. Exceções permanecem em ajustes avançados até serem movidas para
configurações globais.

## Fluxo do painel alvo

1. Criar rascunho: nome e importação de texto/PDF.
2. Preparar publicação: destino, data, valor/gratuita, capa, resumo e
   embarque; exibir pendências e prévia.
3. Detalhes para viajante: inclusos, roteiro, intensidade, retorno e preparo.
4. Operação e exceções: múltiplos embarques, mapas, tolerâncias e ajustes
   avançados.

## Fases de implementação

### Fase 1 — fundação segura (em implementação nesta branch)

- Centralizar regras de prontidão no backend e refletir os avisos no painel.
- Registrar embarque “a confirmar” explicitamente.
- Criar uma projeção interna de catálogo para atendimento, sem expô-la por
  HTTP e sem integrar WhatsApp.
- Cobrir as regras com testes.

### Fase 2 — experiência do formulário

- Transformar a primeira tela em criação de rascunho + painel de pendências.
- Mover preço, capa, resumo e embarque para bloco “Preparar publicação”.
- Mover CTA, estilo e unidade para padrões globais; preservar exceções.
- Adicionar prévia do card/página e estados de revisão.

### Fase 3 — documentos e IA

- Definir armazenamento privado, retenção, limite de tamanho, antivírus e
  exclusão de PDFs antes de aceitar upload.
- Criar `TripDocument`, extração assíncrona, OCR opcional e referências de
  página/trecho por sugestão.
- Exigir revisão humana de cada sugestão e impedir publicação automática.

### Fase 4 — Agente OVERTRIP no WhatsApp

- Escolher Cloud API da Meta ou BSP, responsável humano, política de opt-in e
  fluxo de handoff.
- Criar autenticação serviço-a-serviço, catálogo privado, conhecimento
  versionado e auditoria de respostas.
- O agente recomenda somente viagens publicadas e disponíveis; não confirma
  pagamento/reserva sem fluxo transacional próprio.

## Critérios de segurança antes de cada fase

- Não expor segredo, token, documento ou dado de cliente em prompt/log/API
  pública.
- Validar entradas no servidor e aplicar limite de requisições/tamanho.
- Versionar conhecimento e registrar a versão usada pelo agente.
- Testar regras de publicação no HTTP real, não apenas na interface.
- Não integrar canal externo, upload ou deploy sem aprovação específica.

## Próximo ponto de retomada

Ao continuar, conclua e revise a Fase 1 antes de iniciar Fase 2. A decisão
pendente para Fase 3 é onde PDFs serão guardados e por quanto tempo. Para a
Fase 4, decidir provedor do WhatsApp, dono do atendimento e quando o agente
deve transferir a conversa para uma pessoa.
