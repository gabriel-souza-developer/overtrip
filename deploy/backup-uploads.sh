#!/usr/bin/env bash
# Cópia de segurança das imagens enviadas pelo painel.
# Os arquivos nunca mudam depois de gravados (nome aleatório), então basta
# copiar os novos: a cópia de imagens é incremental e nunca as apaga no destino.
# A lista de autorização legada, ao contrário, pode mudar ou ser removida:
# o backup deve refletir sua versão atual, inclusive sua ausência.
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
manifest_name='.legacy-media-allowlist.json'
manifest_tmp=''
trap 'if [ -n "$manifest_tmp" ]; then rm -f -- "$manifest_tmp"; fi' EXIT
# A origem é substituída por rename pelo processo de aprovação; copie para um
# arquivo privado temporário e publique por rename, sem expor JSON parcial.
# Nunca copie nem siga um link simbólico como se fosse o manifesto confiável.
if [ -L "$SRC/$manifest_name" ]; then
  rm -f -- "$DEST/$manifest_name"
  echo 'Manifesto de mídia é um link simbólico; backup recusado.' >&2
  exit 1
elif [ -f "$SRC/$manifest_name" ]; then
  manifest_tmp="$(mktemp "$DEST/.tmp-legacy-allowlist.XXXXXXXX")"
  cp --no-dereference -- "$SRC/$manifest_name" "$manifest_tmp"
  if [ -L "$manifest_tmp" ] || [ ! -f "$manifest_tmp" ]; then
    rm -f -- "$DEST/$manifest_name"
    echo 'Manifesto de mídia não é um arquivo regular; backup recusado.' >&2
    exit 1
  fi
  chmod 600 "$manifest_tmp"
  mv -f -- "$manifest_tmp" "$DEST/$manifest_name"
  manifest_tmp=''
else
  # Ausência da lista é deliberadamente fail-closed; não restaure uma versão
  # obsoleta que possa voltar a autorizar algo removido da origem.
  rm -f -- "$DEST/$manifest_name"
fi
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
