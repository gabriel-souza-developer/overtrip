#!/usr/bin/env python3
"""Gera o fluxo n8n v35 do Assistente WhatsApp a partir da v34.

A v35 muda só a origem dos dados: viagens e base de conhecimento passam a vir do
serviço privado da Oracle (contrato /n8n/v2), pela tailnet, com credencial de
cabeçalho guardada no n8n. Estado, avisos e IA ficam iguais à v34.

Arquivos:
- docs/local/OVERTRIP Assistente WhatsApp v34.json  real, fora do git (opcional)
- docs/local/IMPORTAR NO N8N - OVERTRIP Assistente WhatsApp v35.json  real, para importar no n8n
- docs/OVERTRIP Assistente WhatsApp v34 (modelo).json e v35 (modelo).json  com marcadores, no git (NÃO importar)

Sem a v34 real, o script trabalha só com as versões com marcadores.
Uso: python3 -I scripts/build-assistant-v35.py
"""
import copy
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / "docs" / "local"
NAME = "OVERTRIP Assistente WhatsApp {}.json"
# No git ficam só modelos com marcadores; o nome do arquivo e do fluxo avisam para não importar.
MODEL_NAME = "OVERTRIP Assistente WhatsApp {} (modelo).json"
IMPORT_NAME = "IMPORTAR NO N8N - OVERTRIP Assistente WhatsApp v35.json"
MODEL_FLOW_SUFFIX = " — MODELO (não importar)"

# Marcadores no lugar de dados da rede e da conta (ver deploy/README.md).
TAILNET_HOST = "__TAILNET_HOST__"
RULES = [
    (re.compile(r"\b(?:10|127|192\.168|172\.(?:1[6-9]|2\d|3[01]))(?:\.\d{1,3}){1,3}\b"), "__WAHA_HOST__"),
    (re.compile(r"\b[a-z0-9-]+\.tail[0-9a-f]+\.ts\.net\b"), TAILNET_HOST),
    (re.compile(r"\b\d{12,}@g\.us\b"), "__TEAM_GROUP_ID__@g.us"),
]
CREDENTIAL_NAME = "OVERTRIP Serviço Privado"
GROUP_TRIPS_CODE = """// Com alwaysOutputData, uma lista vazia chega como um item vazio; ele não é viagem.
return [
  {
    json: {
      trips: $input.all().map(item => item.json).filter(trip => trip && trip.title)
    }
  }
];"""


def _scrub(value):
    if isinstance(value, str):
        for pattern, placeholder in RULES:
            value = pattern.sub(placeholder, value)
        return value
    if isinstance(value, list):
        return [_scrub(item) for item in value]
    if isinstance(value, dict):
        return {key: _scrub(item) for key, item in value.items()}
    return value


def sanitize(flow: dict) -> dict:
    """Remove o que identifica a rede, a conta n8n e o endereço do webhook."""
    flow = _scrub(copy.deepcopy(flow))
    if not flow["name"].endswith(MODEL_FLOW_SUFFIX):
        flow["name"] += MODEL_FLOW_SUFFIX
    flow.get("meta", {}).pop("instanceId", None)
    for key in ("id", "versionId"):
        flow.pop(key, None)
    for node in flow["nodes"]:
        node.pop("webhookId", None)
        if node["type"].endswith(".webhook"):
            node["parameters"]["path"] = "__WEBHOOK_PATH__"
        for credential in (node.get("credentials") or {}).values():
            credential.pop("id", None)
    return flow


def tailnet_host(flow: dict) -> str:
    """O host da VM na tailnet é o mesmo que o fluxo já usa para o Qwen."""
    match = re.search(r"https://([a-z0-9-]+\.tail[0-9a-f]+\.ts\.net)", json.dumps(flow))
    return match.group(1) if match else TAILNET_HOST


def to_v35(v34: dict) -> dict:
    flow = copy.deepcopy(v34)
    nodes = {node["name"]: node for node in flow["nodes"]}
    base = f"https://{tailnet_host(v34)}:8443"

    def private_get(node: dict, path: str) -> None:
        node["parameters"] = {
            "url": base + path,
            "authentication": "genericCredentialType",
            "genericAuthType": "httpHeaderAuth",
            "options": {"timeout": 10000},
        }
        # O n8n pede para escolher a credencial ao importar; o segredo nunca entra no arquivo.
        node["credentials"] = {"httpHeaderAuth": {"name": CREDENTIAL_NAME}}
        node["retryOnFail"] = True
        node["maxTries"] = 3
        node["waitBetweenTries"] = 2000

    private_get(nodes["Consulta trips do site"], "/n8n/v2/trips")
    # Sem viagens abertas a resposta é [], e o n8n não emitiria item algum, parando o fluxo.
    nodes["Consulta trips do site"]["alwaysOutputData"] = True
    nodes["Agrupa trips do site"]["parameters"]["jsCode"] = GROUP_TRIPS_CODE
    private_get(nodes["Consulta base de conhecimento"], "/n8n/v2/knowledge")

    flow["name"] = "OVERTRIP Assistente WhatsApp v35"
    # Importa como fluxo novo e desligado: a v34 continua até a v35 ser testada.
    flow["active"] = False
    for key in ("id", "versionId"):
        flow.pop(key, None)
    return flow


def write(path: Path, flow: dict) -> None:
    path.write_text(json.dumps(flow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"gerado: {path.relative_to(ROOT)}")


def main() -> None:
    real_v34 = LOCAL / NAME.format("v34")
    if real_v34.exists():
        v34 = json.loads(real_v34.read_text(encoding="utf-8"))
        write(LOCAL / IMPORT_NAME, to_v35(v34))
        write(ROOT / "docs" / MODEL_NAME.format("v34"), sanitize(v34))
    v34_public = json.loads((ROOT / "docs" / MODEL_NAME.format("v34")).read_text(encoding="utf-8"))
    write(ROOT / "docs" / MODEL_NAME.format("v35"), sanitize(to_v35(v34_public)))


if __name__ == "__main__":
    main()
