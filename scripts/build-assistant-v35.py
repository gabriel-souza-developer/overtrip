#!/usr/bin/env python3
"""Gera o fluxo n8n v35 do Assistente WhatsApp, pronto para importar, a partir da v34 real.

A v35 muda só a origem dos dados: viagens e base de conhecimento passam a vir do
serviço privado da Oracle (contrato /n8n/v2), pela tailnet, com a credencial de
cabeçalho "OVERTRIP Serviço Privado" do n8n. Endereços do WAHA, webhook, grupo
da equipe e credenciais ficam exatamente como na v34 real.

Entrada: docs/local/OVERTRIP Assistente WhatsApp v34.json (exportado do n8n)
Saída:   docs/local/IMPORTAR NO N8N - OVERTRIP Assistente WhatsApp v35.json
docs/local/ fica fora do git porque contém endereços internos e IDs da conta.
Uso: python3 -I scripts/build-assistant-v35.py
"""
import copy
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / "docs" / "local"
NAME = "OVERTRIP Assistente WhatsApp {}.json"
IMPORT_NAME = "IMPORTAR NO N8N - OVERTRIP Assistente WhatsApp v35.json"

CREDENTIAL_NAME = "OVERTRIP Serviço Privado"
GROUP_TRIPS_CODE = """// Com alwaysOutputData, uma lista vazia chega como um item vazio; ele não é viagem.
return [
  {
    json: {
      trips: $input.all().map(item => item.json).filter(trip => trip && trip.title)
    }
  }
];"""


def tailnet_host(flow: dict) -> str:
    """O host da VM na tailnet é o mesmo que o fluxo já usa para o Qwen."""
    match = re.search(r"https://([a-z0-9-]+\.tail[0-9a-f]+\.ts\.net)", json.dumps(flow))
    if not match:
        raise SystemExit("não achei o host da VM na tailnet (nó do Qwen) na v34; nada foi gerado")
    return match.group(1)


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
    if not real_v34.exists():
        raise SystemExit(f"falta o fluxo real da v34 em {real_v34.relative_to(ROOT)} (exporte do n8n)")
    v34 = json.loads(real_v34.read_text(encoding="utf-8"))
    write(LOCAL / IMPORT_NAME, to_v35(v34))


if __name__ == "__main__":
    main()
