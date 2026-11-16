import { realpathSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

/** Prisma SQLite file URLs resolve relative to the schema directory. */
export function sqliteFilePath(url: string): string | null {
  if (!url.startsWith('file:')) return null;
  const path = resolve('prisma', decodeURIComponent(url.slice(5).split('?')[0]));
  try { return realpathSync(path); } catch {
    // Resolve an existing parent as well, so symlinked directories are covered
    // before a new database file has been created.
    try { return resolve(realpathSync(dirname(path)), basename(path)); } catch { return path; }
  }
}

/** Also catches different hard-link paths that point to one existing database. */
export function sameSqliteFile(first: string, second: string): boolean {
  const a = sqliteFilePath(first);
  const b = sqliteFilePath(second);
  if (!a || !b) return false;
  if (a === b) return true;
  try {
    const left = statSync(a);
    const right = statSync(b);
    return left.dev === right.dev && left.ino === right.ino;
  } catch { return false; }
}
