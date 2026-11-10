#!/usr/bin/env bash
# Verificação local sem acesso ao conteúdo do banco ou das credenciais.
set -u -o pipefail
status=0
checks=()
# Se HEALTH_STATUS_FILE estiver definido, o resultado também vai para um JSON lido pelo painel.
record() { local text=${2//\\/\\\\}; checks+=("{\"status\":\"$1\",\"message\":\"${text//\"/\\\"}\"}"); }
fail() { printf 'ALERTA: %s\n' "$*"; record alert "$*"; status=1; }
ok() { printf 'OK: %s\n' "$*"; record ok "$*"; }
write_status() {
  [ -n "${HEALTH_STATUS_FILE:-}" ] || return 0
  local tmp ok_json=true joined
  (( status == 0 )) || ok_json=false
  joined=$(IFS=,; printf '%s' "${checks[*]}")
  tmp=$(mktemp "${HEALTH_STATUS_FILE}.XXXXXX") || return 0
  printf '{"checkedAt":"%s","ok":%s,"checks":[%s]}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ok_json" "$joined" > "$tmp" &&
    chmod 640 "$tmp" && mv -f "$tmp" "$HEALTH_STATUS_FILE" || rm -f "$tmp"
}
trap write_status EXIT

for service in overtrip-api.service caddy.service tailscaled.service overtrip-backup.timer; do
  if systemctl is-active --quiet "$service"; then ok "$service ativo"; else fail "$service inativo"; fi
done

disk=$(df -P /var/lib/overtrip | awk 'NR==2 {gsub(/%/, "", $5); print $5}')
if [[ "$disk" =~ ^[0-9]+$ ]] && (( disk < 85 )); then ok "disco utilizado: ${disk}%"; else fail "disco utilizado: ${disk:-desconhecido}% (limite 85%)"; fi
memory=$(awk '/MemTotal:/ {total=$2} /MemAvailable:/ {available=$2} END {if (total>0) printf "%d", 100*available/total}' /proc/meminfo)
if [[ "$memory" =~ ^[0-9]+$ ]] && (( memory >= 10 )); then ok "memória disponível: ${memory}%"; else fail "memória disponível: ${memory:-desconhecida}% (mínimo 10%)"; fi
load=$(awk '{print $1}' /proc/loadavg)
cpus=$(getconf _NPROCESSORS_ONLN)
printf 'MÉTRICA: carga 1 minuto=%s; CPUs=%s\n' "$load" "$cpus"
record metric "carga 1 minuto=${load}; CPUs=${cpus}"

if find /var/backups/overtrip -maxdepth 1 -type f -name 'overtrip-*.db.gz' -mmin -1800 -print -quit 2>/dev/null | grep -q .; then
  ok 'backup local encontrado nas últimas 30 horas'
else
  fail 'nenhum backup local encontrado nas últimas 30 horas'
fi

local_ip=$(ip -4 -o addr show dev enp0s6 scope global | awk 'NR==1 {split($4,a,"/"); print a[1]}')
if [[ ! "$local_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then fail 'IPv4 da interface principal não encontrado'; exit "$status"; fi
http_status=$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' --max-time 10 --resolve "overtrip.com.br:443:$local_ip" https://overtrip.com.br/health 2>/dev/null || true)
if [ "$http_status" = 200 ]; then
  ok 'HTTPS e API responderam com certificado válido'
else
  fail 'HTTPS ou API não respondeu corretamente'
fi

for domain in overtrip.com.br www.overtrip.com.br; do
  if timeout 10 bash -o pipefail -c 'openssl s_client -connect "$2:443" -servername "$1" </dev/null 2>/dev/null | openssl x509 -noout -checkend 1209600 >/dev/null' _ "$domain" "$local_ip"; then
    ok "certificado de $domain expira em mais de 14 dias"
  else
    fail "certificado de $domain indisponível ou expira em até 14 dias"
  fi
done
exit "$status"
