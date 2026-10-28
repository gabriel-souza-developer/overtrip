#!/usr/bin/env python3
"""
Gera as versões leves (WebP) usadas pelo hero e pelos painéis do Universo.

Para cada foto de cada trip do trips.json (e a foto de grupo do hero) cria,
ao lado do arquivo original:
    <nome>-w640.webp   <nome>-w960.webp   <nome>-w1280.webp

O hero (js/render.js) monta o srcset sozinho a partir do `src` da foto, então
o fluxo pra uma trip nova é:
    1. adicionar a trip e as fotos no trips.json
    2. rodar:  python3 tools/gerar-imagens-hero.py
    3. subir as pastas assets/images junto com o resto

Se alguma foto ficar sem versão WebP, o hero cai sozinho no JPG original
(só fica mais lento). Requer:  pip install pillow
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
WIDTHS = (640, 960, 1280)
QUALITY = 76
EXTRAS = [
    "assets/images/geral/overtrip-grupo-na-cachoeira.jpg",
    # seção "Universo OVERTRIP" (painéis com foto)
    "assets/images/geral/overtrip-grupo-2vans.jpg",
    "assets/images/riders/over-riders-capa-tema.jpg",
]


def variants_for(src: Path):
    for width in WIDTHS:
        yield width, src.with_name(f"{src.stem}-w{width}.webp")


def main() -> int:
    trips = json.loads((ROOT / "trips.json").read_text(encoding="utf-8"))
    sources = list(EXTRAS)
    for trip in trips:
        for media in trip.get("media", []):
            if media.get("type") != "video":
                sources.append(media["src"])

    created = skipped = 0
    for rel in dict.fromkeys(sources):
        src = ROOT / rel.lstrip("/")
        if not src.exists():
            print(f"  ! não encontrado: {rel}")
            continue
        image = None
        for width, out in variants_for(src):
            if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
                skipped += 1
                continue
            if image is None:
                # aplica a rotação do celular (EXIF), igual ao navegador
                image = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
            target = image if image.width <= width else image.resize(
                (width, round(image.height * width / image.width)), Image.LANCZOS)
            target.save(out, "WEBP", quality=QUALITY, method=6)
            created += 1
            print(f"  + {out.relative_to(ROOT)}  {out.stat().st_size // 1024} KB")
    print(f"pronto: {created} criadas, {skipped} já existiam")
    return 0


if __name__ == "__main__":
    sys.exit(main())
