#!/usr/bin/env python3
"""Gera o fluxo n8n v36 do Assistente WhatsApp a partir do arquivo de importação v35.

A v36 acrescenta o PEDIDO DE RESERVA confirmado pelo cliente:
1. o modelo só sugere `[[PEDIDO:título|lugares|nome]]`;
2. o código de "Decide resposta" valida contra o feed (/n8n/v2/trips) e envia um
   resumo de texto fixo, com aviso de privacidade e pedido de confirmação;
3. só quando a mensagem SEGUINTE do cliente é um "sim" e a mensagem anterior do
   assistente é exatamente esse resumo, o código monta o pedido a partir do
   resumo enviado (não do modelo), pausa o bot (handoff `pedido_reserva`),
4. faz um único POST para a entrada de reservas e avisa a equipe uma vez, com o
   resultado do registro. Pagamentos continuam transferidos para a equipe.

Endereço e credencial da entrada ficam como MARCADORES NÃO CONFIGURADOS:
o host termina em `.invalid` (nunca resolve) e a credencial é só um nome, sem id.
O arquivo sai desligado (`active=false`) e sem `id`/`versionId`, para importar
como fluxo novo. Este script não chama a API do n8n.

Entrada padrão: docs/local/IMPORTAR NO N8N - OVERTRIP Assistente WhatsApp v35.json
Saída padrão:   docs/local/IMPORTAR NO N8N - OVERTRIP Assistente WhatsApp v36.json
Uso: python3 -I scripts/build-assistant-v36.py [--input V35.json] [--output V36.json]
"""
import argparse
import copy
import hashlib
import json
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / "docs" / "local"
V35_NAME = "IMPORTAR NO N8N - OVERTRIP Assistente WhatsApp v35.json"
V36_NAME = "IMPORTAR NO N8N - OVERTRIP Assistente WhatsApp v36.json"

INTAKE_URL = "https://CONFIGURAR-ENTRADA-DE-RESERVAS.invalid/n8n/v1/reservation-requests"
INTAKE_CREDENTIAL = "CONFIGURAR — OVERTRIP Entrada de Reservas"
IF_NODE = "Tem pedido para registrar?"
POST_NODE = "Registra pedido no OVERTRIP"
NAMESPACE = uuid.UUID("6f1d2c1e-2b7a-4f6e-9a51-7d0c3b9e8a36")


def replace_once(text: str, old: str, new: str, where: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{where}: trecho de referência encontrado {count} vez(es) (esperado 1); nada foi gerado")
    return text.replace(old, new)


PROMPT_OLD_INTENT = (
    '- Quando o cliente demonstrar intenção de reservar (por exemplo "quero reservar", "pode ser" ou "sim" depois de você falar da reserva), '
    "apresente já na mesma mensagem as formas de pagamento da base de conhecimento, sem esperar o cliente perguntar: PIX e cartão."
)
PROMPT_NEW_INTENT = (
    '- Quando o cliente demonstrar intenção de reservar (por exemplo "quero reservar", "pode ser" ou "sim" depois de você falar da reserva), '
    "não apresente ainda as formas de pagamento nem a chave PIX: pergunte, se ainda não souber, o nome do responsável pela reserva e quantos lugares ele quer. "
    "Se houver mais de uma data aberta para a mesma trip, pergunte também para qual data é o pedido. "
    "Quando souber a trip, a data, a quantidade de lugares e o nome, escreva na ÚLTIMA linha, sozinha, a marcação "
    "[[PEDIDO:título exato da trip|AAAA-MM-DD|lugares|nome do responsável]], com a data copiada dos 10 primeiros caracteres de startDateISO dessa trip "
    "(exemplo: [[PEDIDO:TRILHA EM LUCENA - PB|2026-12-13|2|Maria Souza]]). O sistema mostra o resumo e pede a confirmação do cliente; depois a equipe continua com vagas, valores e pagamento.\n"
    "- Para mais de 10 lugares, não use a marcação de pedido: use [[HUMANO:sem_resposta]] (grupo grande).\n"
    "- Nunca peça CPF, RG, documento, e-mail, data de nascimento ou contato de emergência pela conversa: a equipe pede os dados dos participantes depois, por canal seguro."
)
PROMPT_OLD_EXCEPTIONS = "e da ficha da trip ([[FICHA:título]])"
PROMPT_NEW_EXCEPTIONS = "da ficha da trip ([[FICHA:título]]) e do pedido de reserva ([[PEDIDO:título|AAAA-MM-DD|lugares|nome]])"

TEXTOS_ANCHOR = "  outro: 'Em breve nossa equipe irá prosseguir com seu atendimento, tudo bem?'\n};"
TEXTOS_NEW = (
    "  pedido_reserva: 'Perfeito! Seu pedido foi encaminhado para a equipe OVERTRIP, que vai confirmar por aqui vagas, valores, pagamento e os dados dos participantes. "
    "Sua vaga ainda não está garantida. Em breve nossa equipe irá prosseguir com seu atendimento, tudo bem?',\n" + TEXTOS_ANCHOR
)
MOTIVOS_ANCHOR = "  outro: 'Outro motivo'\n};"
MOTIVOS_NEW = "  pedido_reserva: 'Pedido de reserva confirmado pelo cliente',\n" + MOTIVOS_ANCHOR

SAIDA_SIG_OLD = "function saida(reply, handoff, reason) {"
SAIDA_SIG_NEW = "function saida(reply, handoff, reason, pedido = null) {"
SAIDA_AVISO_OLD = "        `*Motivo:* ${MOTIVOS[reason] || MOTIVOS.outro}`,\n"
SAIDA_AVISO_NEW = SAIDA_AVISO_OLD + "        ...(pedido ? [pedido.resumoEquipe] : []),\n"
SAIDA_RET_OLD = "return [{ json: { reply, handoff, pausar, reason, aviso, equipeChatId: EQUIPE_CHAT_ID, guardaValor, diagnosticoAudio, usouReserva } }];"
SAIDA_RET_NEW = "return [{ json: { reply, handoff, pausar, reason, aviso, equipeChatId: EQUIPE_CHAT_ID, guardaValor, diagnosticoAudio, usouReserva, pedido } }];"

MARCA_OLD = "const razaoMarcaSegura = razaoMarca === 'falha' ? 'outro' : razaoMarca;"
MARCA_NEW = (
    "// \"falha\" e \"pedido_reserva\" nunca vêm do modelo: o pedido só nasce da confirmação do resumo (v36)\n"
    "const razaoMarcaSegura = (razaoMarca === 'falha' || razaoMarca === 'pedido_reserva') ? 'outro' : razaoMarca;"
)

CONFIRM_ANCHOR = "// 2) Resposta do Gemini + marcação de transferência [[HUMANO:motivo]]"
CONFIRM_BLOCK = r"""// ===== PEDIDO DE RESERVA (v36) =====
// O resumo é montado SÓ por este código, a partir do feed. A confirmação é a
// mensagem seguinte do cliente ("sim") logo depois do resumo; os dados do
// pedido são relidos do resumo enviado, nunca da resposta do modelo.
const PEDIDO_CABECALHO = '📝 *Resumo do pedido de reserva*';
const PEDIDO_AVISO = 'Privacidade: vou registrar só o nome do responsável e este número de WhatsApp, para a equipe OVERTRIP continuar sua reserva. Documentos e contatos dos participantes serão pedidos depois pela equipe, por canal seguro.';
const PEDIDO_PERGUNTA = 'Responda *sim* para eu registrar o pedido ou *não* para corrigir.';
const PEDIDO_INCOMPLETO = 'Para registrar seu pedido, preciso da TRIP, da quantidade de lugares (até 10) e do nome do responsável. Pode me confirmar?';
const PEDIDO_CORRIGIR = 'Sem problemas! Me diga o que quer corrigir: a TRIP, a quantidade de lugares ou o nome do responsável.';
const NOME_OK = (x) => /^[\p{L}\p{M}' .-]{2,120}$/u.test(x) && (x.match(/\p{L}/gu) || []).length >= 2;
const dataCivil = (t) => String(t.startDateISO || '').slice(0, 10);
const dataBR = (iso) => String(iso).split('-').reverse().join('/');
const tripsAbertasCom = (titulo, data) => lerTrips().filter((t) => t.status === 'open' && norm(t.title) === norm(titulo) && (!data || dataCivil(t) === data));
function resumoPedido(trip, lugares, nomeResp) {
  return [PEDIDO_CABECALHO, '', `*TRIP:* ${trip.title}`, `*Data:* ${dataBR(dataCivil(trip))}`, `*Lugares:* ${lugares}`, `*Responsável:* ${nomeResp}`, '',
    'Sua vaga ainda não está garantida: vagas, valores e pagamento são confirmados pela equipe.', PEDIDO_AVISO, '', PEDIDO_PERGUNTA].join('\n');
}
function lerResumo(texto) {
  // No primeiro contato o passo 5 antepõe a saudação ao resumo: o cabeçalho pode vir depois de uma quebra de linha.
  const comCabecalho = texto.startsWith('OVERTRIP: ' + PEDIDO_CABECALHO) || (texto.startsWith('OVERTRIP: ') && texto.includes('\n' + PEDIDO_CABECALHO + '\n'));
  if (!comCabecalho || !texto.includes(PEDIDO_AVISO) || !texto.trim().endsWith(PEDIDO_PERGUNTA)) return null;
  const campo = (rotulo) => { const m = texto.match(new RegExp('^\\*' + rotulo + ':\\* (.+)$', 'm')); return m ? m[1].trim() : ''; };
  const titulo = campo('TRIP'); const data = campo('Data'); const lugares = Number(campo('Lugares')); const nomeResp = campo('Responsável');
  if (!titulo || !/^\d{2}\/\d{2}\/\d{4}$/.test(data) || !Number.isInteger(lugares) || lugares < 1 || lugares > 10 || !NOME_OK(nomeResp)) return null;
  return { titulo, data: data.split('/').reverse().join('-'), lugares, nomeResp };
}
{
  const partes = historico.split(/\n(?=(?:Cliente|OVERTRIP|Atendente \(equipe\)): )/);
  const anterior = historicoOk ? (partes[partes.length - 1] || '') : '';
  const resumo = lerResumo(anterior);
  if (resumo && RESPOSTAS_NAO.test(tl)) return saida(PEDIDO_CORRIGIR, false, '');
  if (resumo && RESPOSTAS_SIM.test(tl)) {
    const achadas = tripsAbertasCom(resumo.titulo, resumo.data);
    const trip = achadas.length === 1 ? achadas[0] : null;
    const tel = String(base.chatId || '').match(/^(\d{10,15})@(c\.us|s\.whatsapp\.net)$/);
    // Sem payload_id a chave de idempotência seria a mesma para todos (hash de "undefined"/""): sem POST.
    const idMensagem = String(base.payload_id || '').trim();
    const motivoManual = !trip ? 'a TRIP não está mais aberta ou ficou ambígua no catálogo'
      : !tel ? 'telefone não identificado (WhatsApp sem número visível)'
      : !idMensagem ? 'mensagem de confirmação sem identificador (payload_id)' : '';
    const resumoEquipe = `*Pedido:* ${resumo.titulo} — ${dataBR(resumo.data)} — ${resumo.lugares} lugar(es) — responsável: ${resumo.nomeResp}`
      + (motivoManual ? `\n⚠️ Não registrado automaticamente: ${motivoManual}. Cadastre em Reservas manualmente.` : '');
    const pedido = {
      registrar: !motivoManual,
      resumoEquipe,
      body: motivoManual ? null : {
        tripTitle: trip.title, tripStartDate: dataCivil(trip), name: resumo.nomeResp,
        phone: '+' + tel[1], seats: resumo.lugares, customerConfirmed: true, privacyNoticeShown: true,
      },
    };
    return saida(TEXTOS.pedido_reserva, true, 'pedido_reserva', pedido);
  }
}

"""

# Busca histórico do cliente: o history_text é uma string concatenada e o parser do
# resumo divide por "\nOVERTRIP: ". Texto livre do cliente com CR/LF poderia forjar
# uma linha "OVERTRIP: <resumo>"; por isso CR/LF das mensagens role=user (e de papéis
# desconhecidos) viram espaço. Mensagens assistant ficam intactas: o resumo precisa das quebras.
HISTORY_QUERY_V35 = (
    "WITH recent_history AS (\n    SELECT id, role, push_name, message, created_at\n    FROM messages\n"
    "    WHERE chat_id = $1\n      AND id < $2\n    ORDER BY id DESC\n    LIMIT 10\n)\nSELECT COALESCE(\n"
    "    string_agg(\n        CASE\n            WHEN role = 'user' THEN 'Cliente: ' || message\n"
    "            WHEN role = 'assistant' AND push_name = 'Atendente' THEN 'Atendente (equipe): ' || message\n"
    "            WHEN role = 'assistant' THEN 'OVERTRIP: ' || message\n"
    "            ELSE role || ': ' || message\n        END,\n        E'\\n'\n        ORDER BY id ASC\n    ),\n"
    "    ''\n) AS history_text\nFROM recent_history;"
)
HISTORY_USER_OLD = "WHEN role = 'user' THEN 'Cliente: ' || message\n"
HISTORY_USER_NEW = "WHEN role = 'user' THEN 'Cliente: ' || regexp_replace(message, E'[\\r\\n]+', ' ', 'g')\n"
HISTORY_ELSE_OLD = "ELSE role || ': ' || message\n"
HISTORY_ELSE_NEW = "ELSE role || ': ' || regexp_replace(message, E'[\\r\\n]+', ' ', 'g')\n"

SUMMARY_ANCHOR ="// 3) Sem transferência, a frase de transferência não pode aparecer"
SUMMARY_BLOCK = r"""// 2d) Pedido sugerido pelo modelo ([[PEDIDO:título|AAAA-MM-DD|lugares|nome]]): o texto ao cliente é o resumo fixo (v36)
//     Título E data civil do feed precisam apontar para UMA TRIP aberta; com datas recorrentes, o cliente escolhe a data.
const marcaPedido = bruto.match(/\[\[\s*PEDIDO\s*:\s*([^\]]*?)\s*\]\]/i);
if (marcaPedido && !handoff) {
  const p = marcaPedido[1].split('|').map((x) => x.trim());
  // Sem data (marcador antigo de 3 campos) o pedido segue para a escolha da data, nunca para o resumo.
  const [tituloPed, dataPed, lugaresPed, nomePed] = p.length === 4 ? p : p.length === 3 ? [p[0], '', p[1], p[2]] : ['', '', '', ''];
  const dataOk = /^\d{4}-\d{2}-\d{2}$/.test(dataPed);
  const doTitulo = tituloPed ? tripsAbertasCom(tituloPed, '') : [];
  const achadas = dataOk ? tripsAbertasCom(tituloPed, dataPed) : [];
  const lugares = /^\d{1,2}$/.test(lugaresPed) ? Number(lugaresPed) : NaN;
  const nomeResp = String(nomePed || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const dadosOk = Number.isInteger(lugares) && lugares >= 1 && lugares <= 10 && NOME_OK(nomeResp);
  const datasAbertas = [...new Set(doTitulo.map((t) => dataCivil(t)).filter(Boolean))].sort().map(dataBR);
  if (achadas.length === 1 && dadosOk) {
    reply = resumoPedido(achadas[0], lugares, nomeResp);
  } else if (achadas.length > 1) {
    // Mesmo título e mesma data em mais de uma TRIP aberta: o código não escolhe; oferece a equipe (consentimento).
    reply = 'Encontrei mais de uma saída com esse nome e essa data. ' + FRASE_CONSENTIMENTO + ' para te ajudar?';
  } else if (!achadas.length && datasAbertas.length > 1) {
    reply = `A ${doTitulo[0].title} tem mais de uma data aberta: ${datasAbertas.join(', ')}. Para qual data é o pedido?`;
  } else if (!achadas.length && datasAbertas.length === 1) {
    reply = `A ${doTitulo[0].title} está aberta para ${datasAbertas[0]}. O pedido é para essa data?`;
  } else {
    reply = PEDIDO_INCOMPLETO;
  }
}

"""

AVISO_TEXT = (
    "={{ $('Decide resposta').first().json.aviso + ($('" + POST_NODE + "').isExecuted ? (() => { "
    "const r = $('" + POST_NODE + "').first().json || {}; const s = Number(r.statusCode); "
    "const b = (r.body && typeof r.body === 'object') ? r.body : {}; const ok = s >= 200 && s < 300; "
    # 200 também responde duplicado (nada criado) e repetição da mesma chave: não dizer "registrado".
    "if (ok && b.outcome === 'DUPLICATE') return '\\n\\nℹ️ Já existe reserva deste telefone nesta TRIP: nada novo foi criado. Confira em Reservas.'; "
    "if (ok && b.replayed === true) return '\\n\\nℹ️ Pedido já recebido antes (repetição da mesma mensagem): confira em Reservas.'; "
    "return ok ? '\\n\\n✅ Pedido registrado em Reservas como pendente a revisar.' "
    ": '\\n\\n⚠️ Pedido NÃO registrado no painel (' + String((r.body && r.body.error) || s || 'sem conexão').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) + '). Cadastre em Reservas manualmente.'; "
    "})() : '') }}"
)


def node_id(name: str) -> str:
    return str(uuid.uuid5(NAMESPACE, name))


def to_v36(v35: dict) -> dict:
    flow = copy.deepcopy(v35)
    nodes = {node["name"]: node for node in flow["nodes"]}
    for required in ("Decide resposta", "Monta prompt", "Marca atendimento humano", "Avisa a equipe", "Extrai dados da mensagem",
                     "Busca histórico do cliente"):
        if required not in nodes:
            raise SystemExit(f"nó '{required}' ausente na v35; nada foi gerado")
    if IF_NODE in nodes or POST_NODE in nodes:
        raise SystemExit("a entrada já contém os nós da v36; use o arquivo da v35")

    # Prompt: coleta mínima e marcação de pedido; pagamentos seguem com a equipe.
    prompt = nodes["Monta prompt"]["parameters"]["assignments"]["assignments"][0]
    text = replace_once(prompt["value"], PROMPT_OLD_INTENT, PROMPT_NEW_INTENT, "prompt (intenção de reservar)")
    prompt["value"] = replace_once(text, PROMPT_OLD_EXCEPTIONS, PROMPT_NEW_EXCEPTIONS, "prompt (exceções de colchetes)")

    # Histórico: mensagem do cliente nunca gera uma linha "OVERTRIP:" (anti-spoofing do resumo).
    hist = nodes["Busca histórico do cliente"]["parameters"]
    if hist.get("query") != HISTORY_QUERY_V35:
        raise SystemExit("query de 'Busca histórico do cliente' diferente da referência v35; nada foi gerado")
    query = replace_once(hist["query"], HISTORY_USER_OLD, HISTORY_USER_NEW, "histórico (mensagens do cliente)")
    hist["query"] = replace_once(query, HISTORY_ELSE_OLD, HISTORY_ELSE_NEW, "histórico (outros papéis)")

    # Decide resposta: resumo, confirmação determinística e pedido.
    code = nodes["Decide resposta"]["parameters"]["jsCode"]
    for old, new, where in (
        (TEXTOS_ANCHOR, TEXTOS_NEW, "TEXTOS"),
        (MOTIVOS_ANCHOR, MOTIVOS_NEW, "MOTIVOS"),
        (SAIDA_SIG_OLD, SAIDA_SIG_NEW, "saida()"),
        (SAIDA_AVISO_OLD, SAIDA_AVISO_NEW, "aviso da equipe"),
        (SAIDA_RET_OLD, SAIDA_RET_NEW, "retorno de saida()"),
        (MARCA_OLD, MARCA_NEW, "motivo seguro"),
        (CONFIRM_ANCHOR, CONFIRM_BLOCK + CONFIRM_ANCHOR, "confirmação"),
        (SUMMARY_ANCHOR, SUMMARY_BLOCK + SUMMARY_ANCHOR, "resumo"),
    ):
        code = replace_once(code, old, new, f"Decide resposta ({where})")
    nodes["Decide resposta"]["parameters"]["jsCode"] = code

    # Aviso único à equipe, com o resultado do registro quando houver.
    for param in nodes["Avisa a equipe"]["parameters"]["bodyParameters"]["parameters"]:
        if param["name"] == "text":
            if param["value"] != "={{ $('Decide resposta').first().json.aviso }}":
                raise SystemExit("texto do aviso da equipe diferente do esperado na v35; nada foi gerado")
            param["value"] = AVISO_TEXT
            break
    else:
        raise SystemExit("parâmetro text do aviso da equipe não encontrado; nada foi gerado")

    x, y = nodes["Marca atendimento humano"]["position"]
    flow["nodes"].append({
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 3},
                "conditions": [{
                    "id": node_id(IF_NODE + ":cond"),
                    "leftValue": "={{ $('Decide resposta').first().json.pedido?.registrar === true }}",
                    "rightValue": "",
                    "operator": {"type": "boolean", "operation": "true", "singleValue": True},
                }],
                "combinator": "and",
            },
            "options": {},
        },
        "id": node_id(IF_NODE), "name": IF_NODE, "type": "n8n-nodes-base.if", "typeVersion": 2.3,
        "position": [x + 112, y + 220],
    })
    flow["nodes"].append({
        "parameters": {
            "method": "POST",
            "url": INTAKE_URL,
            "authentication": "genericCredentialType",
            "genericAuthType": "httpHeaderAuth",
            "sendHeaders": True,
            "headerParameters": {"parameters": [{
                "name": "Idempotency-Key",
                "value": "={{ 'wa1-' + String($('Extrai dados da mensagem').first().json.payload_id).hash('sha256') }}",
            }]},
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify($('Decide resposta').first().json.pedido.body) }}",
            "options": {"timeout": 10000, "response": {"response": {"fullResponse": True, "neverError": True}}},
        },
        "id": node_id(POST_NODE), "name": POST_NODE, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.5,
        "position": [x + 336, y + 220],
        # Credencial só pelo nome, sem id: o n8n pede para escolher ao importar.
        "credentials": {"httpHeaderAuth": {"name": INTAKE_CREDENTIAL}},
        # Uma única tentativa: dados pessoais nunca são reenviados automaticamente.
        "retryOnFail": False,
        "onError": "continueRegularOutput",
        "alwaysOutputData": True,
    })

    conns = flow["connections"]
    if conns.get("Marca atendimento humano") != {"main": [[{"node": "Avisa a equipe", "type": "main", "index": 0}]]}:
        raise SystemExit("ligação 'Marca atendimento humano' → 'Avisa a equipe' diferente do esperado; nada foi gerado")
    conns["Marca atendimento humano"] = {"main": [[{"node": IF_NODE, "type": "main", "index": 0}]]}
    conns[IF_NODE] = {"main": [
        [{"node": POST_NODE, "type": "main", "index": 0}],
        [{"node": "Avisa a equipe", "type": "main", "index": 0}],
    ]}
    conns[POST_NODE] = {"main": [[{"node": "Avisa a equipe", "type": "main", "index": 0}]]}

    flow["name"] = "OVERTRIP Assistente WhatsApp v36"
    # Importa como fluxo novo e desligado: a v35 continua até a v36 ser testada.
    flow["active"] = False
    for key in ("id", "versionId"):
        flow.pop(key, None)
    flow["pinData"] = {}
    return flow


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--input", type=Path, default=LOCAL / V35_NAME)
    parser.add_argument("--output", type=Path, default=LOCAL / V36_NAME)
    args = parser.parse_args()
    if not args.input.exists():
        raise SystemExit(f"falta o arquivo de importação da v35 em {args.input}")
    flow = to_v36(json.loads(args.input.read_text(encoding="utf-8")))
    data = json.dumps(flow, ensure_ascii=False, indent=2) + "\n"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(data, encoding="utf-8")
    print(f"gerado: {args.output.name} sha256={hashlib.sha256(data.encode('utf-8')).hexdigest()}")


if __name__ == "__main__":
    main()
