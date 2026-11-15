#!/usr/bin/env python3
"""Copia mídia social imutável para backup privado, sem sobrescrever arquivos."""
import hashlib
import os
from pathlib import Path
import re
import stat
import sys
import tempfile

NAME = re.compile(r"^[0-9a-f]{32}\.(?:jpg|png)$")


def private_directory(path: Path, create: bool = False) -> Path:
    if not path.is_absolute():
        raise ValueError(f"Diretório deve ser absoluto: {path}")
    if create:
        path.mkdir(mode=0o700, parents=False, exist_ok=True)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700 or info.st_uid != os.geteuid():
        raise ValueError(f"Diretório deve pertencer ao usuário atual e ter modo 700: {path}")
    return path.resolve(strict=True)


def digest(path: Path) -> str:
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as src:
        info = os.fstat(src.fileno())
        if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.geteuid():
            raise ValueError(f"Arquivo deve ser regular, privado e pertencer ao usuário atual: {path}")
        return hashlib.file_digest(src, 'sha256').hexdigest()


def backup(source: Path, destination: Path) -> tuple[int, int]:
    source = private_directory(source)
    destination = private_directory(destination, create=True)
    if source == destination or source in destination.parents or destination in source.parents:
        raise ValueError('Origem e destino devem ser diretórios separados.')
    copied = checked = 0
    for item in sorted(source.iterdir()):
        if not NAME.fullmatch(item.name):
            raise ValueError(f"Nome inesperado no diretório de mídia: {item.name}")
        expected = digest(item)
        target = destination / item.name
        if target.exists() or target.is_symlink():
            if digest(target) != expected:
                raise ValueError(f"Cópia existente diverge da origem: {item.name}")
            checked += 1
            continue
        fd, temp_name = tempfile.mkstemp(prefix='.social-', dir=destination)
        temp = Path(temp_name)
        try:
            os.fchmod(fd, 0o600)
            source_fd = os.open(item, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            with os.fdopen(fd, 'wb') as out, os.fdopen(source_fd, 'rb') as incoming:
                info = os.fstat(incoming.fileno())
                if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.geteuid():
                    raise ValueError(f"Arquivo de origem inválido: {item.name}")
                while chunk := incoming.read(1024 * 1024):
                    out.write(chunk)
                out.flush()
                os.fsync(out.fileno())
            if digest(temp) != expected or digest(item) != expected:
                raise ValueError(f"Arquivo mudou durante a cópia: {item.name}")
            try:
                os.link(temp, target)
            except FileExistsError:
                if digest(target) != expected:
                    raise ValueError(f"Cópia concorrente diverge: {item.name}")
            copied += 1
        finally:
            temp.unlink(missing_ok=True)
    return copied, checked


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('Uso: backup-social-media.py <origem absoluta> <destino absoluto>')
    try:
        copied, checked = backup(Path(sys.argv[1]), Path(sys.argv[2]))
        print(f'Mídias sociais copiadas: {copied}; cópias existentes verificadas: {checked}')
    except (OSError, ValueError) as exc:
        sys.exit(f'Falha no backup privado: {exc}')
