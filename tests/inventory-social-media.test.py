import importlib.util
import os
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('inventory_social_media', ROOT / 'deploy/inventory-social-media.py')
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class InventoryTest(unittest.TestCase):
    def test_reports_only_old_orphans_and_missing_without_mutation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            directory = root / 'media'
            directory.mkdir(mode=0o700)
            database = root / 'data.db'
            old = int((time.time() - 172800) * 1000)
            recent = int(time.time() * 1000)
            keys = [c * 32 + '.jpg' for c in 'abcde']
            with sqlite3.connect(database) as conn:
                conn.executescript('CREATE TABLE SocialMedia(id TEXT PRIMARY KEY, storageKey TEXT, createdAt DATETIME); CREATE TABLE SocialPostVariant(socialMediaId TEXT);')
                conn.executemany('INSERT INTO SocialMedia VALUES(?,?,?)', [('a', keys[0], old), ('b', keys[1], old), ('c', keys[2], recent)])
                conn.execute('INSERT INTO SocialPostVariant VALUES(?)', ('b',))
            for key in [keys[0], keys[3], keys[4]]:
                (directory / key).write_bytes(b'x')
            os.utime(directory / keys[3], (time.time() - 172800,) * 2)
            (directory / 'unexpected').symlink_to('/tmp')
            before = database.read_bytes()
            result = module.inventory(database, directory)
            self.assertEqual(result['registered_without_post'], [keys[0]])
            self.assertEqual(result['unregistered_files'], [keys[3]])
            self.assertEqual(result['missing_registered_files'], [keys[1], keys[2]])
            self.assertEqual(result['missing_referenced_files'], [keys[1]])
            self.assertEqual(result['unexpected_entries'], ['unexpected'])
            self.assertEqual(database.read_bytes(), before)
            self.assertTrue((directory / keys[0]).exists())
            self.assertTrue((directory / keys[3]).exists())

    def test_rejects_unsafe_directory_and_invalid_age(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            directory = root / 'unsafe'
            directory.mkdir(mode=0o755)
            with self.assertRaises(ValueError):
                module.inventory(root / 'missing', directory)
            self.assertEqual(directory.stat().st_mode & 0o777, 0o755)
            with self.assertRaises(ValueError):
                module.inventory(root / 'missing', directory, 0)

if __name__ == '__main__':
    unittest.main()
