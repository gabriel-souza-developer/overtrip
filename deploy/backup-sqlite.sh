#!/usr/bin/env bash
# Backup consistente do SQLite (sqlite3 .backup), compactado, com retenção de 14 dias.
# Uso: backup-sqlite.sh <banco.db> <pasta-de-backup> [dias=14]
set -euo pipefail
DB="${1:?informe o arquivo do banco}"
DEST="${2:?informe a pasta de backup}"
DIAS="${3:-14}"
[ -f "$DB" ] || { echo "Banco não encontrado: $DB" >&2; exit 1; }
mkdir -p "$DEST"
STAMP="$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp "$DEST/.tmp-XXXXXX.db")"
trap 'rm -f "$TMP"' EXIT
sqlite3 "$DB" ".backup '$TMP'"
RES="$(sqlite3 "$TMP" 'PRAGMA integrity_check;')"
[ "$RES" = "ok" ] || { echo "Backup corrompido (integrity_check: $RES)" >&2; exit 1; }
FINAL="$DEST/overtrip-$STAMP.db.gz"
PARTIAL="$FINAL.partial"
trap 'rm -f "$TMP" "$PARTIAL"' EXIT
gzip -c "$TMP" > "$PARTIAL"
mv "$PARTIAL" "$FINAL"
find "$DEST" -maxdepth 1 -name 'overtrip-*.db.gz' -mtime +"$DIAS" -delete
echo "Backup criado: $FINAL"
