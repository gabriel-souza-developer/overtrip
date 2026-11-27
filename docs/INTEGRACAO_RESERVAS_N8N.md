# Integração de pedidos de reserva: WhatsApp (n8n) → OVERTRIP

Estado: implementado no código local (branch `feat/integracao-reservas-n8n`).
**Não publicado, migração não aplicada, workflow do n8n não alterado.**

## O que é e o que não é

- Quando a pessoa **confirma a solicitação na conversa**, o n8n envia comprador +
  quantidade de lugares. O sistema registra uma **solicitação pendente** na tela
  **Reservas**, com origem `WHATSAPP_N8N` e marca `needsReview`. Ela não ocupa
  vaga, não conta no Financeiro e não é uma reserva confirmada. É a única fila:
  não cria interessado (a aba
  Interessados está fora da navegação) nem cadastro paralelo.
- O valor total é **calculado no servidor**: preço da TRIP × lugares somente
  quando a unidade é “por pessoa” (TRIP gratuita = 0). Outras unidades (por
  casal, por carro…) gravam 0 e a nota pede que a equipe defina o valor antes
  de revisar. Preço, sinal ou status de pagamento vindos do modelo não são aceitos.
- **Não** confirma vaga, **não** cria parcela nem registra pagamento, **não**
  altera `spotsLeft`. As vagas só são **lidas** para recusar TRIP esgotada.
- O sinal exigido é **50% do valor total**. Criar ou editar a solicitação,
  marcar revisão ou lançar uma parcela prevista não conta como pagamento. Só
  parcelas com recebimento registrado (`paidAt`) contam. A solicitação continua
  fora de Contratado, A receber, lugares e parcelas do Financeiro até que a
  equipe registre ao menos 50% recebido.
- A equipe registra o recebimento no painel; o painel só permite mudar para
  **Confirmada** quando os recebimentos somam pelo menos metade do total. Retirar
  um pagamento que deixaria uma reserva confirmada abaixo desse limite também
  é bloqueado. Toda resposta traz `handoff.required: true`: a conversa vai para
  uma pessoa e não promete vaga.

## Processo e credencial separados

| | Leitura (existente) | Escrita (nova) |
|---|---|---|
| Processo | `dist/assistantPrivateServer.js` | `dist/reservationIntakeServer.js` |
| Unidade | `deploy/overtrip-assistant.service` | `deploy/overtrip-reservation-intake.service` |
| Porta (loopback) | 3010 | 3011 |
| Credencial | `ASSISTANT_SERVICE_SECRET` | `RESERVATION_INTAKE_SECRET` |
| Rotas | catálogo/FAQ (GET) | só `POST /n8n/v1/reservation-requests` |

- O token de leitura não autentica na escrita, e o de escrita não lê catálogo.
- O processo de escrita não carrega a credencial de leitura (a unidade systemd
  não lê `assistant.env`). Se ambas estiverem no mesmo ambiente (desenvolvimento),
  o servidor não inicia quando forem iguais. Na instalação, conferir com
  `sudo sh -c '. /etc/overtrip/assistant.env; a=$ASSISTANT_SERVICE_SECRET; . /etc/overtrip/reservation-intake.env; [ "$a" != "$RESERVATION_INTAKE_SECRET" ] && echo diferentes'`.
- Exatamente um cabeçalho `Authorization: Bearer <64 hex>`; comparação em tempo constante.
- Limite de 60 requisições/minuto por processo (proteção contra laço no fluxo),
  corpo JSON de no máximo 4 KB, `Content-Type: application/json` obrigatório.
- `Cache-Control: no-store` em todas as respostas. Logs sem valores da requisição.

## Contrato JSON (v1)

```
POST /n8n/v1/reservation-requests
Authorization: Bearer <RESERVATION_INTAKE_SECRET>
Content-Type: application/json
Idempotency-Key: wa1-<SHA-256 em hexadecimal minúsculo, 64 caracteres>
```

```json
{
  "tripTitle": "TRILHA EM LUCENA - PB",
  "tripStartDate": "2026-12-13",
  "name": "Nome da pessoa",
  "phone": "+55 83 9XXXX-XXXX",
  "seats": 2,
  "customerConfirmed": true,
  "privacyNoticeShown": true
}
```

- `tripTitle` e `tripStartDate` vêm **do feed privado** `/n8n/v2/trips`
  (`title` e os 10 primeiros caracteres de `startDateISO`), copiados pelo fluxo,
  nunca redigidos pelo modelo. O servidor resolve a TRIP por título exato
  (sem diferença de maiúsculas/espaços) **e** data civil exata entre as TRIPs
  `OPEN` do mesmo escopo do feed. Mais de uma → `TRIP_AMBIGUOUS`. A única
  encontrada ainda precisa ser elegível ao catálogo (data futura, dados
  completos, não esgotada) e estar no escopo da operação mostrada em Reservas.
- Preço, status de pagamento, sinal, link de pagamento e disponibilidade
  **não são aceitos**: o esquema é estrito e recusa qualquer campo extra.
- `phone`: telefone brasileiro do comprador (aceita +55, 55, 0055, 0 de
  discagem e o formato do WhatsApp sem o nono dígito, que é acrescentado);
  gravado como `+55DD9XXXXXXXX` ou `+55DDXXXXXXXX`. Estrangeiro/inválido → 422.
- `name`: 2–120 caracteres, só letras, espaço, apóstrofo, ponto e hífen (sem
  dígitos, impedindo CPF/telefone no nome).
- `seats`: inteiro 1–10, quantidade de lugares do grupo. Não retém vagas.
  Nomes, documentos e contatos de cada participante **não** entram aqui.
- `customerConfirmed` precisa ser `true`: só enviar depois que a pessoa
  confirmou TRIP, data e quantidade na conversa.
- `privacyNoticeShown` precisa ser `true`: o fluxo deve ter mostrado o aviso
  de uso dos dados antes de pedi-los. Texto sugerido: “Vou registrar seu nome e
  telefone só para a equipe OVERTRIP continuar sua reserva por aqui.”

### Respostas

Sucesso (`201` solicitação pendente nova; `200` duplicado ou repetição):

```json
{
  "requestId": "c…",
  "status": "PENDING_HUMAN",
  "recordedAs": "RESERVATION_REQUEST_PENDING_DEPOSIT",
  "outcome": "CREATED",
  "replayed": false,
  "reservationConfirmed": false,
  "paymentRegistered": false,
  "seatsHeld": false,
  "handoff": {
    "required": true,
    "reason": "RESERVATION_REQUEST",
  "customerMessage": "Recebemos sua solicitação para TRILHA EM LUCENA - PB. A equipe OVERTRIP vai confirmar o valor e orientar o pagamento do sinal de 50%. A vaga só será confirmada depois que o recebimento for conferido. Seus dados de participantes serão coletados por canal seguro."
  }
}
```

Erro (sempre com `handoff`, exceto 401; `fields` lista só nomes de campos, nunca valores):

| HTTP | `error` | Quando |
|---|---|---|
| 400 | `VALIDATION_FAILED` | corpo fora do contrato (inclui campos extras) |
| 400 | `INVALID_IDEMPOTENCY_KEY` | cabeçalho ausente, repetido ou fora do formato |
| 400 | `INVALID_JSON` | JSON malformado |
| 4xx | `INVALID_REQUEST_BODY` | charset/codificação não suportados, envio abortado |
| 401 | `UNAUTHORIZED` | credencial ausente/errada (sem `handoff`; erro de configuração) |
| 404 | `TRIP_NOT_FOUND` | nenhuma TRIP elegível com esse título e data |
| 404 | `NOT_FOUND` | rota inexistente |
| 409 | `TRIP_AMBIGUOUS` | mais de uma TRIP `OPEN` com esse título e data |
| 409 | `TRIP_SOLD_OUT` | TRIP encontrada, mas sem vagas informadas (`spotsLeft` ≤ 0) |
| 409 | `TRIP_OUT_OF_SCOPE` | TRIP de outra organização autorizada no site, fora da tela Reservas |
| 409 | `IDEMPOTENCY_KEY_REUSED` | mesma chave com conteúdo diferente |
| 413 | `PAYLOAD_TOO_LARGE` | corpo acima de 4 KB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | sem `application/json` |
| 422 | `INVALID_PHONE` | telefone não brasileiro ou inválido |
| 429 | `RATE_LIMITED` | acima de 60/min (respeitar `Retry-After`) |
| 503 | `SERVICE_UNAVAILABLE` | falha interna/banco |

Regra para o fluxo: **qualquer resposta diferente de 2xx = passar para humano**,
sem repetir automaticamente (exceto 429/503 com espera e a mesma chave).

## Idempotência e duplicados

1. **Mesma `Idempotency-Key`, mesmo conteúdo** → `200`, `replayed: true`, mesmo
   `requestId`; nada é gravado de novo (mesmo que a TRIP tenha fechado depois).
2. **Mesma chave, conteúdo diferente** → `409 IDEMPOTENCY_KEY_REUSED`.
3. **Chave nova, mesmo telefone com reserva não cancelada na mesma TRIP**
   (criada pelo n8n ou pelo painel, telefone comparado após normalização) →
   `200`, `outcome: "DUPLICATE"`: não cria outra reserva e não altera a
   existente (nem reabre a revisão de uma já revisada). A conversa vai para
   humano, que ajusta lugares se necessário. Reserva cancelada não conta.
4. Concorrência: o SQLite serializa escritas; uma transação que leu estado
   desatualizado falha com conflito/banco ocupado e é repetida até 3 vezes, já
   vendo o registro gravado (vira repetição ou duplicado). Se ainda assim
   falhar, a resposta é `503` e o fluxo pode reenviar com a mesma chave.

Chave no n8n: `wa1-` + SHA-256 (hex minúsculo) do ID da mensagem do WhatsApp em
que a pessoa confirmou o pedido. Não usar telefone, JID ou nome na chave.

## Dados pessoais

- Aceitos: nome e telefone do comprador (necessários para a equipe responder).
  Ficam somente na reserva, visível apenas para administradores.
- Recusados pelo contrato: CPF/RG, e-mail, contato de emergência, data de
  nascimento, texto livre da conversa, identificadores do WhatsApp, preço e
  qualquer status de pagamento.
- `ReservationIntakeRequest` guarda só: hash SHA-256 da chave de idempotência,
  sal + hash do conteúdo (para detectar reuso), TRIP, reserva, quantidade de
  lugares, resultado e datas. Sem nome ou telefone.
- Retenção: esses metadados são apagados após `RESERVATION_INTAKE_RETENTION_DAYS`
  (padrão 90; 7–730) na partida do serviço e a cada 24 h. O painel não exclui
  reservas (só as cancela); se uma reserva for removida no banco, os metadados
  ligados a ela saem junto (cascata).
- Respostas nunca devolvem nome/telefone; logs não contêm valores.
- Documento e contato de emergência por passageiro (hoje coletados na planilha
  de passageiros) **não** passam pelo WhatsApp/n8n/modelo: devem ser coletados
  depois, num formulário seguro com acesso restrito (pendência abaixo). O n8n
  e o modelo nunca recebem nem exibem documento de participante.

## Origem nas planilhas (análise estrutural, sem dados pessoais)

- `Forms de passageiros CG TRIP.xlsx`: respostas com nome, telefone, CPF,
  contato de emergência, e-mail opcional e carimbo de data/hora (86 respostas);
  lista de passageiros por viagem com documento, contato, emergência, presença
  e status com lista `Não pagou / 50% / 100% / 90% / RIFA`. Esses status são
  histórico de pagamento e **não** viram status de solicitação ou de reserva.
- A planilha registra passageiros por assento; o pedido pela conversa usa só
  comprador + quantidade, e o restante fica para a captura segura posterior.
- `GERAL CG TRIP.xlsx`: destinos visitados com passageiros, preço por pessoa,
  transporte, contratante, taxa, despesa total e caixa. As fórmulas de caixa
  descontam 0, 1 ou 2 participantes de formas diferentes; é histórico, não
  política a automatizar. A integração usa só o preço cadastrado na TRIP e não
  aplica cortesia, desconto, sinal nem caixa.

## Configuração operacional (quando autorizado publicar)

1. Criar o ambiente **mínimo e separado** `/etc/overtrip/reservation-intake.env`
   (root:root, modo 600). Ele substitui `/etc/overtrip/env` para este processo,
   que assim não recebe chaves de IA, JWT, Brevo, redes sociais nem a credencial
   de leitura do assistente. Conteúdo:
   - `DATABASE_URL` — o mesmo valor do ambiente da API;
   - `RESERVATION_INTAKE_SECRET` — novo, 32 bytes em hex, nunca o de leitura;
   - `PUBLIC_SITE_ORGANIZATION_IDS` e `LEGACY_TOURISM_ORGANIZATION_ID` —
     **somente se** existirem no ambiente da API, com os mesmos valores (sem
     eles o escopo de TRIPs/Reservas deste processo divergiria do painel);
   - opcional: `RESERVATION_INTAKE_RETENTION_DAYS`.

   Sem imprimir segredos na tela:

   ```sh
   sudo sh -c 'umask 077; f=/etc/overtrip/reservation-intake.env; : > "$f"
     grep -E "^(DATABASE_URL|PUBLIC_SITE_ORGANIZATION_IDS|LEGACY_TOURISM_ORGANIZATION_ID)=" /etc/overtrip/env >> "$f"
     printf "RESERVATION_INTAKE_SECRET=%s\n" "$(openssl rand -hex 32)" >> "$f"
     chown root:root "$f"; chmod 600 "$f"; cut -d= -f1 "$f"'
   ```

   O último comando lista só os nomes das variáveis. A unidade não define
   `NODE_ENV=production` de propósito: as checagens de produção de
   `src/config.ts` (JWT, recuperação de senha) são da API e exigiriam segredos
   que este processo não usa. O pacote publicado não contém `.env`.
2. Backup do SQLite e aplicar a migração `20261129040000_reservation_intake_requests`
   dentro do procedimento de `deploy/ORACLE_STATUS.md`. Atenção: `prisma migrate
   deploy` aplica **todas** as pendentes; hoje o worktree também tem
   `20261129020000_trip_profile` e `20261129030000_trip_templates`, de outra
   tarefa. Publicar a partir de um commit cujo conjunto de migrações esteja
   revisado, conferindo `prisma migrate status` antes.
   Retorno (serviço de entrada parado, backup feito):
   1. Antes, revisar ou cancelar no painel os pedidos `WHATSAPP_N8N` ainda “a
      revisar”: o código anterior não conhece `needsReview` e passaria a somar
      todos em Contratado, lugares e A receber.
   2. `DROP TABLE "ReservationIntakeRequest";`
   3. Remover as colunas, senão a próxima publicação falha com coluna
      duplicada: `ALTER TABLE "Reservation" DROP COLUMN "needsReview";` e
      `ALTER TABLE "Reservation" DROP COLUMN "source";` (exige SQLite ≥ 3.35;
      conferir `sqlite3 --version` na VM; em versão antiga, restaurar o backup).
   4. `prisma migrate resolve --rolled-back 20261129040000_reservation_intake_requests`.
   Publicar API e painel junto: o Financeiro e as rotas de reserva precisam
   do código que entende `needsReview`.
3. Instalar `deploy/overtrip-reservation-intake.service`, iniciar e conferir
   que escuta só em `127.0.0.1:3011`.
4. Transporte do n8n: mesmo modelo do serviço de leitura (tailnet, nunca Caddy/
   internet). Expor a porta 3011 só na tailnet exige decisão explícita.
5. No n8n, cadastrar a credencial como *Header Auth* no gerenciador de
   credenciais (fora do JSON exportado do workflow). Testar primeiro em cópia
   isolada do workflow, com TRIP de teste, sem notificar o grupo real.
6. Rotação: gerar novo valor, atualizar o arquivo e a credencial do n8n,
   reiniciar o serviço. Revogação: apagar o arquivo e parar o serviço.

## Workflow n8n v36 — gerado localmente, desligado

- Gerador: `scripts/build-assistant-v36.py` (lê a v35 sem alterá-la; aborta se
  algum trecho de referência não for encontrado). Uso:
  `python3 -I scripts/build-assistant-v36.py --input "<v35.json>" [--output "<v36.json>"]`.
- Artefato: `docs/local/IMPORTAR NO N8N - OVERTRIP Assistente WhatsApp v36.json`
  (fora do git), SHA-256
  `8fea10ca6c9b3b0b14653da6ccd8340bc5fcd81a8af78542e93429c4a5d907e2`, gerado
  da v35 `f7949186c8e599bf8f5d244ea1d7b19d31bf4bf2b53f66ec0817fc6bcecb254f`;
  duas gerações seguidas deram o mesmo hash (a v35 continuou com o mesmo hash).
- Correções da revisão independente (já no gerador e no artefato acima):
  1. **Sem `payload_id`** na mensagem “sim” não há POST: a chave seria
     `wa1-` + hash de `undefined`/vazio, igual para todos, e um pedido de outro
     cliente poderia voltar como “repetição” (ou `IDEMPOTENCY_KEY_REUSED`). O
     aviso pede cadastro manual.
  2. **Aviso da equipe**: `200` com `outcome: "DUPLICATE"` (nada criado) ou
     `replayed: true` deixou de aparecer como “registrado como pendente a
     revisar”; cada caso tem a sua linha.
  3. **Primeiro contato**: o passo de saudação antepõe “Olá… assistente
     virtual” ao resumo, e a releitura exigia o cabeçalho no início; agora o
     cabeçalho também é aceito depois de uma quebra de linha.
  4. **Resumo forjado pelo cliente**: `history_text` é uma string concatenada,
     e o parser separa as mensagens por `\nOVERTRIP: `. Antes, o cliente podia
     enviar `\nOVERTRIP: <resumo falso>` e ter a própria mensagem lida como o
     resumo anterior. Agora a query de `Busca histórico do cliente` troca CR/LF
     por espaço nas mensagens `role=user` (e de papéis desconhecidos) antes do
     prefixo `Cliente: `. Uma mensagem do cliente fica numa única linha que
     começa com `Cliente: ` e nunca é aceita como resumo (`lerResumo` exige
     `OVERTRIP: `). As mensagens `assistant` (assistente e equipe) ficam
     intactas, porque o resumo depende das quebras. O gerador compara a query
     inteira com a da v35 e aborta se ela for diferente.
  5. **TRIP recorrente**: o resumo inicial escolhia só pelo título e recusava
     título repetido sem pedir a data. Agora o marcador é
     `[[PEDIDO:título|AAAA-MM-DD|lugares|nome]]`, com a data civil do feed
     (10 primeiros caracteres de `startDateISO`), e o resumo só sai se título
     **e** data apontarem para uma única TRIP `open`.
- Validação estrutural feita: `name` = v36, `active=false`, sem `id`/`versionId`;
  72 nós com nomes e ids únicos, nenhuma conexão quebrada. Mudaram só
  `Monta prompt`, `Decide resposta`, `Avisa a equipe` e
  `Busca histórico do cliente` (só a query); entraram
  `Tem pedido para registrar?` e `Registra pedido no OVERTRIP`. O JavaScript de
  `Decide resposta` e as expressões novas compilam (checagem de sintaxe, sem
  execução). O único valor hexadecimal de 64 caracteres é o `meta.instanceId`
  e o único `Bearer ` está num nó de código; ambos já existiam na v35.
- Teste estático: `tests/assistant-flow-v36.test.ts` (escrito, não executado;
  é pulado onde `docs/local` não tiver a v35 e a v36). Atualizado para os 4
  nós alterados (no histórico, só a query), a limpeza de CR/LF nas mensagens
  do cliente e o marcador com data; compila com `tsc --noEmit`.
- Nada foi importado, ativado ou alterado no n8n.

### Credenciais (só nomes)

`Postgres account` (14 nós), `WAHA API Key Session` (6),
`Gemini - Agente OVERTRIP - TRIP` (4), `OVERTRIP Serviço Privado` (2, sem id),
`Groq API — OVERTRIP — TRIP` (1) e a nova
**`CONFIGURAR — OVERTRIP Entrada de Reservas`** (1, sem id, marcador).

### Marcadores não configurados

- URL do POST: `https://CONFIGURAR-ENTRADA-DE-RESERVAS.invalid/n8n/v1/reservation-requests`.
  O domínio `.invalid` nunca resolve: mesmo ativado por engano, o pedido não sai
  da máquina; a equipe recebe o aviso “Pedido NÃO registrado… cadastre manualmente”.
- Credencial: criar no n8n um *Header Auth* (`Authorization` =
  `Bearer <RESERVATION_INTAKE_SECRET>`), escolhê-la no nó ao importar e trocar a
  URL pelo endereço privado decidido para a porta 3011.

### Como o fluxo funciona

1. Ao perceber a intenção de reservar, o modelo pergunta só o nome do responsável
   e quantos lugares (até 10; grupo maior vai para a equipe), e também a data
   quando a trip tem mais de uma data aberta. Depois escreve
   `[[PEDIDO:título|AAAA-MM-DD|lugares|nome]]`, com a data copiada de
   `startDateISO`. O prompt proíbe pedir CPF, documento,
   e-mail, nascimento ou emergência.
2. `Decide resposta` só aceita título (normalizado) **e** data civil que apontem
   para **uma** TRIP `open` do feed, com lugares de 1 a 10 e nome só com letras.
   Sem data, ou com data que não bate, o código lista as datas abertas desse
   título e pergunta para qual é o pedido (ou confirma a única data aberta).
   Se houver mesmo título e mesma data em mais de uma TRIP, ele não escolhe:
   pergunta se o cliente quer falar com a equipe. Com tudo certo,
   envia um **resumo de texto fixo** (TRIP, data do feed, lugares, responsável,
   “vaga ainda não garantida”, **aviso de privacidade** e “Responda *sim*…”).
   Se algo não bater, pede os dados de novo. Sem handoff.
3. Na mensagem seguinte, o código exige que a mensagem anterior no histórico
   seja exatamente esse resumo, com o aviso, e que o cliente responda um “sim”
   (mesma lista do consentimento existente). Os dados são relidos do resumo
   enviado e a TRIP é conferida de novo no feed. `customerConfirmed` e
   `privacyNoticeShown` saem dessa checagem; o modelo não consegue criar o
   pedido (o motivo `pedido_reserva` vindo do modelo vira `outro`). “Não”
   pede a correção.
4. Confirmado: o cliente recebe um texto fixo (“pedido encaminhado… vaga ainda
   não garantida”), o bot **pausa** (motivo `pedido_reserva`) e o caminho
   existente segue: `Envia resposta` → `Precisa transferir?` → `Marca
   atendimento humano` → `Tem pedido para registrar?` → **um** POST (sem nova
   tentativa, `neverError`) → `Avisa a equipe` **uma vez**, com o pedido e o
   resultado (registrado como pendente a revisar, ou não registrado e o motivo).
5. O telefone sai do `chatId` do WAHA (`número@c.us`), nunca do modelo. Com
   `@lid` ou outro formato não há POST e o aviso pede cadastro manual. A
   `Idempotency-Key` é `wa1-` + SHA-256 do `payload_id` da mensagem “sim”.
6. Pagamentos continuam com a equipe: as regras de PIX/cartão e
   `[[HUMANO:pagamento]]` ficaram como estavam. Mudou só a intenção de reservar,
   que agora leva ao pedido em vez de apresentar logo as formas de pagamento.

### Antes de ativar (em cópia isolada)

- Confirmar que a instância aceita `.hash('sha256')` e `$('…').isExecuted` em
  expressões (sem eles o POST falha e o aviso sai como “NÃO registrado”).
- Testar: resumo com TRIP exata, título ambíguo, lugares fora do limite, “não”,
  “sim” fora de hora, `@lid`, entrada desligada (aviso de falha), entrada ligada
  (pedido em Reservas a revisar) e reentrega do webhook (repetição, sem duplicar).
- Não notificar o grupo real nos testes (trocar `EQUIPE_CHAT_ID` na cópia).

## Pendências

- Aplicar a migração e publicar (exige autorização e plano).
- Configurar URL e credencial do v36, testar em cópia isolada e só então trocar a v35.
- Definir o transporte privado do n8n até a porta 3011.
- Executar `tests/reservation-intake.test.ts` (escrito, não executado) e a
  suíte de reservas/financeiro, já que rotas e resumo financeiro mudaram.
- Opcional: referência opaca e estável da TRIP só no feed privado (ex.: HMAC do
  ID), para não depender de título+data; exige mudar o feed v2 e o fluxo.
- Formulário seguro para documento/emergência por passageiro, com acesso restrito.
- Política de retenção das reservas canceladas/antigas (fora deste escopo).
- Sem trilha de auditoria de reserva para a criação automática (a auditoria
  existente exige um usuário do painel); o rastro é o metadado do pedido.
- Pedido duplicado (inclusive com outra quantidade) não deixa sinal na tela
  Reservas: depende da pessoa que assume a conversa. Avaliar uma marca datada.
- O painel de organização não mostra o selo nem aceita `reviewed` (só importa
  com `LEGACY_TOURISM_ORGANIZATION_ID` configurado).
- Mudar a situação de um pedido no seletor também o revisa; avaliar pedir
  confirmação para “Confirmada” em pedido ainda a revisar.
- Não há exclusão de reserva no painel: pedido de teste/spam só pode ser
  cancelado, e qualquer reserva bloqueia a exclusão da TRIP.
- O PATCH legado não usa controle de versão (`expectedUpdatedAt`); duas
  edições simultâneas podem sobrescrever o valor revisado.
- `ARCHITECTURE.md` ainda descreve reservas só como registro manual (o
  `CLAUDE.md` já menciona esta integração).
- O limite de taxa é por processo e em memória.
- Telefones com código de operadora (ex.: `0 21 83 …`) são recusados (422).
