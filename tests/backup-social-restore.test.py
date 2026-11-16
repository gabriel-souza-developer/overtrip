"""Ensaia o snapshot seguido da cópia privada e a restauração em local isolado."""
import hashlib
import importlib.util
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('social_backup', ROOT / 'deploy/backup-social-media.py')
assert spec and spec.loader
backup_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup_module)


class SocialRestoreTest(unittest.TestCase):
    def test_service_order_and_restore_of_referenced_file(self):
        lines = (ROOT / 'deploy/overtrip-backup.service').read_text().splitlines()
        commands = [line for line in lines if line.startswith('ExecStart=')]
        self.assertEqual(len(commands), 3)
        self.assertIn('backup-sqlite.sh', commands[0])
        self.assertIn('backup-social-media.py', commands[2])
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            source, backup = root / 'source', root / 'backup'
            source.mkdir(mode=0o700)
            photo = source / ('a' * 32 + '.jpg')
            photo.write_bytes(b'imagem sintetica')
            photo.chmod(0o600)
            expected = hashlib.sha256(photo.read_bytes()).hexdigest()
            database = sqlite3.connect(root / 'active.db')
            database.execute('CREATE TABLE media (storageKey TEXT, sha256 TEXT)')
            database.execute('INSERT INTO media VALUES (?, ?)', (photo.name, expected))
            database.commit()
            snapshot = sqlite3.connect(root / 'snapshot.db')
            database.backup(snapshot)
            database.close()
            backup_module.backup(source, backup)
            key, digest = snapshot.execute('SELECT storageKey, sha256 FROM media').fetchone()
            self.assertEqual(hashlib.sha256((backup / key).read_bytes()).hexdigest(), digest)
            self.assertEqual((backup / key).stat().st_mode & 0o777, 0o600)
            snapshot.close()


if __name__ == '__main__':
    unittest.main()
