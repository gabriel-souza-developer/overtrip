#!/usr/bin/env bash
set -u -o pipefail

# Verificação de compatibilidade, para quem vai operar o deploy, entre a
# sandbox real de extração de imagens de PDF (bwrap + prlimit + systemd-run,
# ver src/services/pdfEmbeddedImages.ts) e as diretivas de hardening JÁ
# presentes em deploy/overtrip-api.service e
# deploy/overtrip-document-worker.service: NoNewPrivileges=true,
# PrivateTmp=true, ProtectSystem=strict, ProtectHome=true.
#
# ORIGEM: uma análise independente testou manualmente, nesta mesma máquina,
# uma unidade transitória systemd --user com essas proteções e viu o bwrap
# falhar ao criar namespaces com cada proteção isolada; viu também que
# `systemd-run --user --scope` (usado por assertMemoryIsolationAvailable
# para o cgroup memory.max da decodificação) só funciona com
# XDG_RUNTIME_DIR/DBUS_SESSION_BUS_ADDRESS de uma sessão ativa, ausentes numa
# unidade de sistema típica. Este script torna essa análise reproduzível:
# nenhuma unidade real é criada, alterada ou lida; nenhuma proteção é
# afrouxada; nenhum documento real ou segredo é usado — só um PDF sintético
# de poucos bytes, gerado em memória a cada execução
# (scripts/lib/sandboxCompatProbe.ts), e unidades transitórias descartáveis
# (--collect), sempre limpas ao sair.
#
# O QUE ISTO NÃO É: uma validação da unidade de produção. A unidade real
# roda como processo de SISTEMA (User=overtrip, instalada por root em
# multi-user.target); este script, sem privilégio de root, só consegue
# reproduzir uma unidade --user equivalente nas MESMAS quatro diretivas —
# uma aproximação, não o mesmo domínio de privilégio. Se for executado como
# root (ou via sudo), também tenta a unidade de SISTEMA real (ainda
# transitória e descartável) para uma aproximação mais próxima; sem isso,
# o relatório final deixa isto explícito e o código de saída nunca afirma
# mais do que foi de fato exercitado.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$REPO_ROOT" || exit 2

BWRAP_PATH="${SANDBOX_CHECK_BWRAP_PATH:-/usr/bin/bwrap}"
LIMITER_PATH="${SANDBOX_CHECK_LIMITER_PATH:-/usr/bin/prlimit}"
SYSTEMD_RUN_PATH="${SANDBOX_CHECK_SYSTEMD_RUN_PATH:-/usr/bin/systemd-run}"
PDFIMAGES_PATH="${SANDBOX_CHECK_PDFIMAGES_PATH:-/usr/bin/pdfimages}"
# memória pequena só para a sonda do bus (nunca decodifica nada aqui): o
# mesmo valor que assertMemoryIsolationAvailable usa para provar que
# systemd-run --user --scope consegue mesmo criar o cgroup, não apenas
# aceitar a opção como sintaticamente válida.
PROBE_MEMORY_MAX=268435456
# Limite de relógio também cobre systemd-run ou bus travados.
PROBE_TIMEOUT_SECONDS=40

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/overtrip-sandbox-check.XXXXXX")" || exit 2
UNITS_CREATED=()
SYSTEM_UNIT_NAME=""
RUN_ID="$$-$(date +%s)"

cleanup() {
  local unit
  for unit in "${UNITS_CREATED[@]:-}"; do
    [ -n "$unit" ] || continue
    timeout 5s systemctl --user stop "$unit" >/dev/null 2>&1 || true
  done
  # Unidade de SISTEMA transitória (passo 5, só root): gerenciador separado
  # do --user acima, por isso limpa à parte; some mesmo sem isto por ser
  # --collect, mas o trap cobre uma interrupção a meio do caminho.
  [ -n "$SYSTEM_UNIT_NAME" ] && timeout 5s systemctl stop "$SYSTEM_UNIT_NAME" >/dev/null 2>&1 || true
  rm -rf "$TMP_ROOT" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

log()  { printf '%s\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
fail_closed() { printf '\033[31m%s\033[0m\n' "$*" >&2; }

OVERALL_OK=1

# --- 1. Dependências --------------------------------------------------------
# Nunca segue adiante com uma dependência ausente tratada como "talvez dê":
# cada uma destas é exigida por src/services/pdfEmbeddedImages.ts em produção.
missing=()
for bin in "$BWRAP_PATH" "$LIMITER_PATH" "$SYSTEMD_RUN_PATH" "$PDFIMAGES_PATH"; do
  [ -x "$bin" ] || missing+=("$bin")
done
if ! command -v node >/dev/null 2>&1; then missing+=("node (no PATH)"); fi
if [ ! -f "$REPO_ROOT/node_modules/tsx/dist/cli.mjs" ]; then missing+=("node_modules/tsx (rode npm install)"); fi
if [ "${#missing[@]}" -gt 0 ]; then
  fail_closed "Dependência ausente, verificação não executada (fail closed): ${missing[*]}"
  exit 2
fi
NODE_BIN="$(realpath "$(command -v node)")"
TSX_BIN="$(realpath "$REPO_ROOT/node_modules/tsx/dist/cli.mjs")"
DRIVER="$(realpath "$REPO_ROOT/scripts/check-sandbox-compat.ts")"

if ! command -v systemctl >/dev/null 2>&1 || ! command -v timeout >/dev/null 2>&1; then
  fail_closed "systemctl ou timeout indisponível; verificação não executada (fail closed)."
  exit 2
fi
USER_MANAGER_AVAILABLE=0
if timeout 5s systemctl --user show-environment >/dev/null 2>&1; then
  USER_MANAGER_AVAILABLE=1
elif [ "$(id -u)" -eq 0 ]; then
  warn "Sem gerenciador systemd --user: etapa de usuário será omitida; a etapa de sistema ainda será tentada."
else
  fail_closed "Sem um gerenciador systemd --user ativo nesta sessão; verificação não executada (fail closed)."
  exit 2
fi

# ProtectHome oculta esses caminhos para a unidade transitória. Informar o
# problema ANTES da sonda impede classificá-lo erroneamente como incompatibilidade
# do bwrap. Não copiar dependências nem alterar o ambiente real de implantação.
PROTECTED_PATHS=()
for candidate in "$REPO_ROOT" "$NODE_BIN" "$TSX_BIN" "$DRIVER" "$BWRAP_PATH" "$LIMITER_PATH" "$SYSTEMD_RUN_PATH" "$PDFIMAGES_PATH"; do
  resolved="$(realpath "$candidate" 2>/dev/null || printf '%s' "$candidate")"
  case "$resolved" in
    /home|/home/*|/root|/root/*|/run/user|/run/user/*) PROTECTED_PATHS+=("$resolved (ProtectHome)");;
    /tmp|/tmp/*|/var/tmp|/var/tmp/*) PROTECTED_PATHS+=("$resolved (PrivateTmp)");;
  esac
done
PATHS_ACCESSIBLE=1
if [ "${#PROTECTED_PATHS[@]}" -gt 0 ]; then
  PATHS_ACCESSIBLE=0
  warn "INCONCLUSIVO: ProtectHome/PrivateTmp podem ocultar caminhos necessários: ${PROTECTED_PATHS[*]}"
  warn "Execute a sonda a partir de uma instalação com runtime e projeto acessíveis à unidade protegida."
fi

# --- 2. Sonda de namespace: cada diretiva isolada, depois combinadas -------
# Mesmo binário e MESMOS argumentos de sandboxArgs() em
# src/services/pdfEmbeddedImages.ts (--unshare-all, --cap-drop ALL, uid/gid
# 65534, só /usr + /proc + /dev visíveis) — uma sonda com argumentos
# diferentes provaria outra coisa. Mantido em sincronia manualmente; se
# sandboxArgs() mudar, revise este bloco também.
BWRAP_BASE_ARGS=(
  --ro-bind /usr /usr --symlink usr/bin /bin --symlink usr/lib /lib --symlink usr/lib64 /lib64
  --proc /proc --dev /dev
  --unshare-all --die-with-parent --new-session
  --clearenv --setenv PATH /usr/bin:/bin --setenv LANG C.UTF-8
  --cap-drop ALL --uid 65534 --gid 65534
  -- /usr/bin/true
)

# $1 = rótulo; $2.. = propriedades -p (pode ser nenhuma, para a linha de base)
probe_namespace() {
  local label="$1"; shift
  local unit="sandbox-check-ns-${RUN_ID}-$((RANDOM))"
  UNITS_CREATED+=("$unit.service")
  local out
  out="$(timeout --kill-after=5s "${PROBE_TIMEOUT_SECONDS}s" "$SYSTEMD_RUN_PATH" --user --unit="$unit" --collect --wait --pipe "$@" -- "$BWRAP_PATH" "${BWRAP_BASE_ARGS[@]}" 2>&1)"
  local rc=$?
  if [ "$rc" -eq 0 ]; then
    log "  [OK]   $label"
    return 0
  elif printf '%s' "$out" | grep -qi 'no permissions to create new namespace'; then
    log "  [FALHA] $label — bwrap não conseguiu criar namespace (unprivileged userns negado sob esta diretiva)"
    return 1
  else
    log "  [FALHA] $label — motivo inesperado, saída abaixo:"
    printf '%s\n' "$out" | sed 's/^/           /'
    return 1
  fi
}

E2E_OK=0
MEM_WITH_SESSION_OK=0
MEM_WITHOUT_SESSION_OK=0
NS_COMBINED_OK=0
if [ "$USER_MANAGER_AVAILABLE" -eq 1 ]; then
log "== 1/3: criação de namespace (bwrap) sob cada diretiva do unit real =="
NS_BASELINE_OK=0; probe_namespace "sem nenhuma diretiva (linha de base)" && NS_BASELINE_OK=1
NS_NNP_OK=0;      probe_namespace "NoNewPrivileges=true (isolada)"        -p NoNewPrivileges=true && NS_NNP_OK=1
NS_TMP_OK=0;      probe_namespace "PrivateTmp=true (isolada)"             -p PrivateTmp=true && NS_TMP_OK=1
NS_SYS_OK=0;      probe_namespace "ProtectSystem=strict (isolada)"        -p ProtectSystem=strict && NS_SYS_OK=1
NS_HOME_OK=0;     probe_namespace "ProtectHome=true (isolada)"            -p ProtectHome=true && NS_HOME_OK=1
NS_COMBINED_OK=0; probe_namespace "as quatro juntas (igual ao unit real)" \
  -p NoNewPrivileges=true -p PrivateTmp=true -p ProtectSystem=strict -p ProtectHome=true && NS_COMBINED_OK=1

if [ "$NS_BASELINE_OK" -ne 1 ]; then
  fail_closed "bwrap não cria namespace nem SEM nenhuma proteção: hospedeiro não oferece a isolação que a sandbox exige, independente das diretivas testadas nesta sessão."
  warn "As sondas restantes ainda serão executadas para diagnóstico independente."
fi

# --- 3. Sonda de isolamento de memória (cgroup via systemd-run --user --scope / bus) ---
log ""
log "== 2/3: systemd-run --user --scope (cgroup memory.max da decodificação) =="
MEM_WITH_SESSION_OK=0
if timeout --kill-after=5s "${PROBE_TIMEOUT_SECONDS}s" "$SYSTEMD_RUN_PATH" --user --scope --quiet --collect -p "MemoryMax=$PROBE_MEMORY_MAX" -- /usr/bin/true >/dev/null 2>&1; then
  MEM_WITH_SESSION_OK=1
  log "  [OK]   com XDG_RUNTIME_DIR/DBUS_SESSION_BUS_ADDRESS desta sessão"
else
  log "  [FALHA] mesmo com a sessão atual — nem a aproximação deste script consegue o cgroup"
fi
MEM_WITHOUT_SESSION_OK=0
if timeout --kill-after=5s "${PROBE_TIMEOUT_SECONDS}s" env -u XDG_RUNTIME_DIR -u DBUS_SESSION_BUS_ADDRESS "$SYSTEMD_RUN_PATH" --user --scope --quiet --collect -p "MemoryMax=$PROBE_MEMORY_MAX" -- /usr/bin/true >/dev/null 2>&1; then
  MEM_WITHOUT_SESSION_OK=1
  log "  [OK]   mesmo SEM essas variáveis (não esperado para uma unidade de sistema típica)"
else
  log "  [FALHA] sem XDG_RUNTIME_DIR/DBUS_SESSION_BUS_ADDRESS — o que uma unidade de sistema sem linger/sessão vê"
fi

# --- 4. Prova final: a cadeia REAL de extração+variantes, sob as quatro diretivas juntas ---
log ""
log "== 3/3: extractEmbeddedImages + processPdfCandidateSandboxed reais, sob as quatro diretivas juntas =="
if [ "$PATHS_ACCESSIBLE" -eq 1 ]; then
E2E_UNIT="sandbox-check-e2e-${RUN_ID}"
UNITS_CREATED+=("$E2E_UNIT.service")
E2E_OUTPUT="$(timeout --kill-after=5s "${PROBE_TIMEOUT_SECONDS}s" "$SYSTEMD_RUN_PATH" --user --unit="$E2E_UNIT" --collect --wait --pipe \
  -p NoNewPrivileges=true -p PrivateTmp=true -p ProtectSystem=strict -p ProtectHome=true \
  --setenv="SANDBOX_CHECK_BWRAP_PATH=$BWRAP_PATH" \
  --setenv="SANDBOX_CHECK_LIMITER_PATH=$LIMITER_PATH" \
  --setenv="SANDBOX_CHECK_SYSTEMD_RUN_PATH=$SYSTEMD_RUN_PATH" \
  --setenv="SANDBOX_CHECK_PDFIMAGES_PATH=$PDFIMAGES_PATH" \
  -- "$NODE_BIN" "$TSX_BIN" "$DRIVER" 2>&1)"
E2E_RC=$?
# O driver (scripts/check-sandbox-compat.ts) escreve exatamente uma linha de
# JSON em stdout: a última linha não vazia é o contrato, mesmo que
# systemd-run intercale avisos próprios ("Running as unit: ...") antes dela.
E2E_JSON="$(printf '%s\n' "$E2E_OUTPUT" | grep -o '{.*}' | tail -n1)"
E2E_OK=0
if [ "$E2E_RC" -eq 0 ] && [ -n "$E2E_JSON" ] && printf '%s' "$E2E_JSON" | "$NODE_BIN" -e 'process.exit(JSON.parse(require("fs").readFileSync(0,"utf8")).ok === true ? 0 : 1)' <<<"$E2E_JSON"; then
  E2E_OK=1
  log "  [OK]   $E2E_JSON"
else
  log "  [FALHA] exit=$E2E_RC ${E2E_JSON:-nenhum JSON recebido; saída completa abaixo}"
  if [ -z "$E2E_JSON" ]; then printf '%s\n' "$E2E_OUTPUT" | sed 's/^/           /'; fi
fi
else
  log "  [NÃO EXECUTADA] caminhos ocultos por ProtectHome/PrivateTmp; resultado inconclusivo."
fi
else
  log "== Sondas --user omitidas: gerenciador indisponível =="
fi

# --- 5. Unidade de SISTEMA real (só se já estiver executando como root) ----
SYSTEM_UNIT_OK=""
if [ "$(id -u)" -eq 0 ]; then
  log ""
  log "== extra: mesma prova, como unidade de SISTEMA transitória (root) =="
  SYS_UNIT="sandbox-check-sys-${RUN_ID}"
  SYSTEM_UNIT_NAME="$SYS_UNIT.service"
  if [ "$PATHS_ACCESSIBLE" -eq 1 ]; then
  SYS_OUTPUT="$(timeout --kill-after=5s "${PROBE_TIMEOUT_SECONDS}s" "$SYSTEMD_RUN_PATH" --unit="$SYS_UNIT" --collect --wait --pipe \
    -p NoNewPrivileges=true -p PrivateTmp=true -p ProtectSystem=strict -p ProtectHome=true \
    --setenv="SANDBOX_CHECK_BWRAP_PATH=$BWRAP_PATH" \
    --setenv="SANDBOX_CHECK_LIMITER_PATH=$LIMITER_PATH" \
    --setenv="SANDBOX_CHECK_SYSTEMD_RUN_PATH=$SYSTEMD_RUN_PATH" \
    --setenv="SANDBOX_CHECK_PDFIMAGES_PATH=$PDFIMAGES_PATH" \
    -- "$NODE_BIN" "$TSX_BIN" "$DRIVER" 2>&1)"
  SYS_RC=$?
  timeout 5s systemctl stop "$SYS_UNIT.service" >/dev/null 2>&1 || true
  SYS_JSON="$(printf '%s\n' "$SYS_OUTPUT" | grep -o '{.*}' | tail -n1)"
  if [ "$SYS_RC" -eq 0 ] && [ -n "$SYS_JSON" ] && printf '%s' "$SYS_JSON" | "$NODE_BIN" -e 'process.exit(JSON.parse(require("fs").readFileSync(0,"utf8")).ok === true ? 0 : 1)' <<<"$SYS_JSON"; then
    SYSTEM_UNIT_OK=1
    log "  [OK]   $SYS_JSON"
  else
    SYSTEM_UNIT_OK=0
    log "  [FALHA] exit=$SYS_RC ${SYS_JSON:-nenhum JSON recebido; saída completa abaixo}"
    if [ -z "$SYS_JSON" ]; then printf '%s\n' "$SYS_OUTPUT" | sed 's/^/           /'; fi
  fi
  else
    SYSTEM_UNIT_OK=skipped
    log "  [NÃO EXECUTADA] caminhos ocultos por ProtectHome/PrivateTmp; resultado inconclusivo."
  fi
fi

# --- 6. Relatório final ------------------------------------------------------
log ""
log "===================== RESULTADO ====================="
if [ "$USER_MANAGER_AVAILABLE" -eq 0 ]; then
  log "INCONCLUSIVO (aproximação --user): gerenciador indisponível; somente a prova de sistema pode ser avaliada."
elif [ "$PATHS_ACCESSIBLE" -eq 0 ]; then
  OVERALL_OK=0
  log "INCONCLUSIVO: caminhos necessários ocultos por ProtectHome/PrivateTmp; não há diagnóstico sobre o sandbox."
elif [ "$E2E_OK" -eq 1 ]; then
  log "COMPATÍVEL (aproximação --user): a extração e a geração de variantes reais"
  log "completaram sob NoNewPrivileges=true + PrivateTmp=true + ProtectSystem=strict"
  log "+ ProtectHome=true juntas, nesta máquina."
else
  OVERALL_OK=0
  log "INCOMPATÍVEL (aproximação --user): a extração/geração de variantes real FALHOU"
  log "sob as quatro diretivas do unit real, nesta máquina. NÃO afrouxe"
  log "ProtectSystem/ProtectHome/PrivateTmp/NoNewPrivileges no unit real para"
  log "'corrigir' isto — isso reduziria a proteção que esse hardening existe para"
  log "dar. Trate como bloqueador de implantação deste recurso neste host até"
  log "quem decide a arquitetura de implantação revisar o mecanismo de sandbox."
  [ "$NS_COMBINED_OK" -eq 1 ] || log "  Causa provável: criação de namespace do bwrap (ver item 1/3 acima)."
  [ "$MEM_WITH_SESSION_OK" -eq 1 ] || log "  Causa provável: cgroup/bus do systemd-run --user --scope (ver item 2/3 acima)."
fi
if [ "$USER_MANAGER_AVAILABLE" -eq 1 ] && [ "$MEM_WITHOUT_SESSION_OK" -ne 1 ]; then
  warn "Aviso separado: sem XDG_RUNTIME_DIR/DBUS_SESSION_BUS_ADDRESS de sessão,"
  warn "systemd-run --user --scope falha (visto acima) — o que uma unidade de"
  warn "sistema típica, sem linger configurado, enxergaria. Isto é esperado e é"
  warn "exatamente por isto que assertMemoryIsolationAvailable testa isto a cada"
  warn "chamada em produção, em vez de assumir."
fi
log ""
warn "LIMITAÇÃO, sempre válida (nunca trate isto como validação de produção):"
warn "a prova --user, quando disponível, usa uma unidade transitória desta sessão"
warn "(uid $(id -u)), nunca a unidade real (processo de SISTEMA, User=overtrip,"
warn "instalada por root em multi-user.target) — domínios de privilégio"
warn "diferentes, que podem se comportar diferente quanto a namespaces/cgroups."
if [ "$(id -u)" -eq 0 ] && [ -n "$SYSTEM_UNIT_OK" ]; then
  if [ "$SYSTEM_UNIT_OK" = "skipped" ]; then
    OVERALL_OK=0
    log "A prova de sistema NÃO FOI EXECUTADA: caminhos ocultos pelas proteções."
    log "O resultado é inconclusivo; use uma instalação acessível à unidade."
  elif [ "$SYSTEM_UNIT_OK" -eq 1 ]; then
    log "A prova extra como unidade de SISTEMA transitória (acima) TAMBÉM passou,"
    log "o que é uma aproximação mais próxima da unidade real — ainda assim não é"
    log "a unidade real com User=overtrip instalada; peça a quem tem autorização"
    log "para repetir isto no host de destino antes de habilitar o worker em produção."
  else
    OVERALL_OK=0
    log "A prova extra como unidade de SISTEMA transitória (acima) FALHOU — sinal"
    log "mais forte de incompatibilidade real, já que esse domínio de privilégio é"
    log "mais próximo do unit real do que a aproximação --user."
  fi
else
  warn "Não executado como root nesta chamada: a aproximação de unidade de SISTEMA"
  warn "(mais próxima do unit real) não foi tentada. Repita com sudo/root, no host"
  warn "de destino, por quem tenha autorização, antes de alegar validação de produção."
fi
log "======================================================="

[ "$OVERALL_OK" -eq 1 ] && exit 0
exit 1
