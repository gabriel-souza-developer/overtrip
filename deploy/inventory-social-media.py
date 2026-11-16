#!/usr/bin/env python3
"""Inventário consultivo de mídia social. Não altera banco nem arquivos."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
from urllib.parse import quote

NAME = re.compile(r'^[0-9a-f]{32}\.(?:jpg|png)$')


def inventory(database: Path, directory: Path, min_age_hours: int = 24) -> dict:
    if min_age_hours < 1 or min_age_hours > 24 * 365:
        raise ValueError('Idade mínima deve estar entre 1 e 8760 horas.')
    if not database.is_absolute() or not directory.is_absolute():
        raise ValueError('Banco e diretório devem ter caminhos absolutos.')
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700 or info.st_uid != os.geteuid():
        raise ValueError('Diretório deve pertencer ao usuário atual e ter modo 700.')
    if not database.is_file():
        raise ValueError('Banco não encontrado ou não é arquivo regular.')
    now = datetime.now(timezone.utc)
    threshold = now.timestamp() - min_age_hours * 3600
    uri = 'file:' + quote(str(database), safe='/') + '?mode=ro'
    with sqlite3.connect(uri, uri=True) as connection:
        connection.execute('PRAGMA query_only = ON')
        connection.execute('BEGIN')
        rows = connection.execute('''SELECT m.storageKey, m.createdAt,
            EXISTS(SELECT 1 FROM SocialPostVariant v WHERE v.socialMediaId = m.id)
            FROM SocialMedia m''').fetchall()
        entries = list(directory.iterdir())
        known = {row[0] for row in rows}
        linked = {row[0] for row in rows if row[2]}
        registered_without_post = []
        for key, created, referenced in rows:
            if referenced:
                continue
            # SQLite pode armazenar DateTime como milissegundos ou texto ISO.
            try:
                if isinstance(created, (int, float)):
                    timestamp = created / 1000 if created > 10_000_000_000 else created
                else:
                    parsed = datetime.fromisoformat(str(created).replace('Z', '+00:00'))
                    timestamp = (parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)).timestamp()
            except (ValueError, OverflowError):
                continue
            if timestamp <= threshold:
                registered_without_post.append(key)
        unregistered = []
        unexpected = []
        present = set()
        for entry in entries:
            file_info = entry.lstat()
            if not NAME.fullmatch(entry.name) or not stat.S_ISREG(file_info.st_mode):
                unexpected.append(entry.name)
                continue
            present.add(entry.name)
            if entry.name not in known and file_info.st_mtime <= threshold:
                unregistered.append(entry.name)
        return {
            'observed_at_utc': now.isoformat(), 'minimum_age_hours': min_age_hours,
            'registered_without_post': sorted(registered_without_post),
            'unregistered_files': sorted(unregistered),
            'missing_registered_files': sorted(known - present),
            'missing_referenced_files': sorted(linked - present),
            'unexpected_entries': sorted(unexpected),
            'notice': 'Consulta aproximada; uploads e edições concorrentes podem alterar os resultados. Não apague automaticamente.'
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True, type=Path)
    parser.add_argument('--directory', required=True, type=Path)
    parser.add_argument('--min-age-hours', type=int, default=24)
    args = parser.parse_args()
    try:
        print(json.dumps(inventory(args.database, args.directory, args.min_age_hours), ensure_ascii=False, indent=2))
    except (OSError, sqlite3.Error, ValueError) as exc:
        parser.exit(1, f'Falha no inventário: {exc}\n')


if __name__ == '__main__':
    main()
