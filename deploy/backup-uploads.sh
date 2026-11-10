#!/usr/bin/env bash
# Cópia de segurança das imagens enviadas pelo painel.
# Os arquivos nunca mudam depois de gravados (nome aleatório), então basta
# copiar os novos: a cópia é incremental e nunca apaga nada no destino.
# Uso: backup-uploads.sh <pasta-de-uploads> <pasta-de-backup>
set -euo pipefail
umask 077
SRC="${1:?informe a pasta de uploads}"
DEST="${2:?informe a pasta de backup}"
if [ ! -d "$SRC" ]; then
  echo "Pasta de uploads ainda não existe: $SRC (nada a copiar)"
  exit 0
fi
mkdir -p "$DEST"
copied=0
while IFS= read -r -d '' file; do
  name="$(basename "$file")"
  [ -e "$DEST/$name" ] && continue
  cp --preserve=timestamps "$file" "$DEST/.tmp-$name"
  mv "$DEST/.tmp-$name" "$DEST/$name"
  copied=$((copied + 1))
done < <(find "$SRC" -maxdepth 1 -type f -regextype posix-extended \
  -regex '.*/[0-9a-f]{32}(\.(jpg|png)|-w(640|960|1280)\.webp)' -print0)
echo "Imagens copiadas: $copied (destino: $DEST)"
