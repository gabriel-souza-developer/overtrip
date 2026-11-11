# Viagens, IA e Agente OVERTRIP — plano de evolução

> **Atualização de escopo (11/11/2026):** CRM e reservas já existem no código e
> o inventário registra sua publicação em produção em 10/11. Este documento
> conserva decisões de arquitetura e histórico das fases originais. A evolução
> operacional do CRM segue agora [`ROADMAP_CRM_RESERVAS.md`](ROADMAP_CRM_RESERVAS.md).
> O estado atual da VM e dos fluxos externos precisa ser confirmado diretamente
> antes de qualquer operação.

## Ideias futuras a avaliar — referência ViajaHUB

Referência consultada em 03/11/2026: [ViajaHUB](https://www.viajahub.tur.br/). As ideias abaixo são hipóteses para descoberta e priorização após o MVP atual; não são recursos prontos nem alteram as fases já definidas.

- **Evolução do CRM e das reservas:** os registros e telas base existem; avaliar aprimoramentos conforme o roadmap dedicado, sem pressupor cobrança ou controle automático de vagas.
- **Financeiro por reserva:** estudar parcelas, registro de recebimentos e avisos; considerar a premissa de sinal de 50% já discutida, sujeita à validação comercial e operacional.
- **Propostas e documentos:** investigar propostas com marca própria, compartilhamento e revisão humana, respeitando o adiamento atual de PDF/OCR.
- **Catálogo por operação:** explorar personalização de marca e catálogo; antes de oferecer a múltiplas empresas, definir isolamento de dados, permissões e implantação.
- **Experiência de implantação:** considerar um fluxo guiado para configurar informações iniciais, apoio à migração e exportação dos dados.

Os detalhes, custos, dependências e prioridade dessas possibilidades dependem de pesquisa com usuários e planejamento futuro.

## Objetivo

Uma viagem é um único registro operacional no banco. Site, painel e Agente
OVERTRIP usam projeções desse registro; o site público lê viagens de
`/api/public/trips` e não depende de `trips.json`. Arquivos JSON antigos podem
ser formatos de compatibilidade de integrações privadas, não fontes de edição
ou publicação do site.

## Estado atual (novembro de 2026)

- `Trip` no SQLite/Prisma é a fonte de dados; o site já a lê por
  `/api/public/trips`.
- O painel aceita rascunho com IA a partir de texto livre. A IA retorna dados
  candidatos e avisos; não publica nem altera status.
- O status legado (`DRAFT`, `OPEN`, `SOLD_OUT`, `CLOSED`, `COMPLETED`,
  `CANCELLED`) ainda mistura publicação, venda e operação.
- Há código e referências a fluxos de atendimento/WhatsApp separados, mas este
  documento não comprova qual automação ou credencial está ativa hoje. Consulte
  o inventário com evidências atuais antes de alterar qualquer integração. O
  fluxo de PDFs depende de preparação e validação no ambiente antes da ativação.

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

### Fase 1 — fundação segura (implementada no fluxo de viagens)

- Centralizar regras de prontidão no backend e refletir os avisos no painel.
- Registrar embarque “a confirmar” explicitamente.
- Criar uma projeção interna de catálogo para atendimento, sem expô-la por
  HTTP e sem integrar WhatsApp.
- Cobrir as regras com testes.

### Fase 2 — experiência do formulário (implementada; histórico abaixo)

- Transformar a primeira tela em criação de rascunho + painel de pendências.
- Mover preço, capa, resumo e embarque para bloco “Preparar publicação”.
- Mover CTA, estilo e unidade para padrões globais; preservar exceções. ✅ Concluído: os padrões são configuráveis no painel e só se aplicam a novas viagens; as existentes mantêm seus valores legados.
- Adicionar prévia do card/página e estados de revisão. ✅ Prévia do card e estado interno `REVIEW` concluídos; `REVIEW` não é público e só um administrador pode publicar.

### Fase 3 — documentos e IA

**Adiada:** a ativação e os ajustes de PDF serão retomados mais adiante.

- Definir armazenamento privado, retenção, limite de tamanho, antivírus e
  exclusão de PDFs antes de aceitar upload. ✅ Política e modelo de metadados
  definidos em `docs/FASE_3_DOCUMENTOS.md`; rotas privadas, integração ClamAV e
  limpeza automática implementadas. Ativação depende de configuração do ambiente.
- Criar `TripDocument`, extração assíncrona, OCR opcional e referências de
  página/trecho por sugestão.
- Exigir revisão humana de cada sugestão e impedir publicação automática.

#### Infraestrutura a avaliar na retomada

- Começar pela máquina prevista no deploy, se houver capacidade: API e worker
  separados, SQLite, diretório privado de documentos, Poppler e ClamAV locais.
  Medir memória e carga; 4 GiB de RAM é apenas ponto inicial de avaliação.
- Instalar e validar o ClamAV real, executar a migração e testar o fluxo com
  PDF real. O worker precisa ser supervisionado e compartilhar banco e arquivos
  privados com a API. OCR permanece pendente.
- Complementar o backup SQLite com os PDFs, cópia externa, retenção compatível
  e teste de restauração; verificar exclusão e retenção também nos backups.
- Para IA, avaliar modelo econômico e plano pago, termos de dados e qualidade;
  medir tokens, tentativas e custo reais antes de estimar despesas. Manter o
  envio mediante ação explícita e aviso. Comparar preços vigentes na retomada.
- Monitorar memória, disco, falhas de varredura e fila. Considerar banco e
  armazenamento de objetos separados somente quando as medições justificarem;
  essa mudança requer adaptação do código.

### Fase 4 — Agente OVERTRIP no WhatsApp

- O protótipo local de referência `docs/OVERTRIP Assistente WhatsApp v31.json` usa n8n, WAHA e PostgreSQL para receber mensagens, consultar viagens e FAQ, manter contexto, transcrever áudio e transferir para a equipe. Seu arquivo exportado não é versionado por conter referências operacionais. É referência de comportamento e integração, não arquitetura final nem autorização para conectar o novo sistema.
- Decisão posterior: usar WAHA/n8n do protótipo; o grupo de avisos já está configurado. O fluxo ativo não deve ser alterado antes de adaptar e validar as fontes e resolver a duplicidade do estado de atendimento, conforme `docs/FASE_4_AGENTE.md`.
- Preservar no desenho futuro os comportamentos úteis do protótipo: resposta humanizada baseada em fatos aprovados, consulta de disponibilidade, transferência explícita ao humano quando solicitada ou necessária e retorno controlado ao assistente.
- Criar autenticação serviço-a-serviço, catálogo privado, conhecimento
  versionado e auditoria de respostas.
- Base inicial: catálogo interno sem HTTP e gestão administrativa de versões
  completas de conhecimento aprovadas por administrador. Autenticação entre
  serviços e auditoria de respostas ainda estão pendentes; detalhes em
  `docs/FASE_4_AGENTE.md`.
- Definir responsável humano, política de opt-in, limites de automação e o fluxo de handoff antes de integrar qualquer canal externo.

## Critérios de segurança antes de cada fase

- Não expor segredos, tokens ou dados de clientes em prompts, logs ou APIs
  públicas. O texto de um documento de viagem pode ser enviado ao provedor de
  IA configurado exclusivamente quando um administrador solicitar sugestões,
  após o aviso de privacidade no painel; nunca enviar automaticamente.
- Validar entradas no servidor e aplicar limite de requisições/tamanho.
- Versionar conhecimento e registrar a versão usada pelo agente.
- Testar regras de publicação no HTTP real, não apenas na interface.
- Não integrar canal externo, upload ou deploy sem aprovação específica.

## Próximo ponto de retomada

As Fases 1 e 2 foram implementadas e revisadas. Na Fase 3, o worker e a revisão
de sugestões foram implementados; ativação, validação real e OCR estão adiados.
O envio ao provedor externo foi autorizado mediante ação explícita e aviso.
O usuário optou por adiar a integração do WhatsApp e priorizar o MVP do site e
painel: criação de viagens, prévia durante o preenchimento, publicação, dados
públicos corretos, revisão de segurança, testes e preparação de infraestrutura.
A prévia é ilustrativa e acompanha o formulário sem salvar ou publicar. O
fluxo WAHA/n8n existente permanece em uso separado; a entrada é de 50%, mas a
ficha do protótipo precisará ser atualizada e validada em etapa posterior.

Antes de colocar o MVP no ar, validar o ambiente real, cópia de backup fora do
servidor e restauração nesse ambiente. Os testes locais não substituem essa
verificação; PDFs e a nova integração de WhatsApp continuam adiados.
