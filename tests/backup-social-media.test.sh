#!/usr/bin/env bash
set -euo pipefail
umask 077
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
script="$(cd "$(dirname "$0")/.." && pwd)/deploy/backup-social-media.py"
mkdir -m 700 "$root/source" "$root/backup"
name=0123456789abcdef0123456789abcdef.jpg
printf 'imagem de exemplo' > "$root/source/$name"
python3 "$script" "$root/source" "$root/backup"
cmp "$root/source/$name" "$root/backup/$name"
test "$(stat -c %a "$root/backup/$name")" = 600
python3 "$script" "$root/source" "$root/backup"
printf 'cópia alterada' > "$root/backup/$name"
if python3 "$script" "$root/source" "$root/backup"; then
  echo 'Deveria rejeitar cópia divergente' >&2; exit 1
fi
test "$(cat "$root/backup/$name")" = 'cópia alterada'
mkdir -m 755 "$root/inseguro"
if python3 "$script" "$root/source" "$root/inseguro"; then
  echo 'Deveria rejeitar diretório inseguro' >&2; exit 1
fi
test "$(stat -c %a "$root/inseguro")" = 755
if python3 "$script" "$root/source" "$root/source"; then
  echo 'Deveria rejeitar origem e destino iguais' >&2; exit 1
fi
mkdir -m 700 "$root/link-destino"
ln -s "$root/link-destino" "$root/link"
if python3 "$script" "$root/source" "$root/link"; then
  echo 'Deveria rejeitar destino simbólico' >&2; exit 1
fi
if python3 "$script" "$root/ausente" "$root/backup"; then
  echo 'Deveria rejeitar origem ausente' >&2; exit 1
fi
echo 'Testes do backup de mídia social passaram.'
