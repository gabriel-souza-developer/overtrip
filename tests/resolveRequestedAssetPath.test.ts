import path from 'path';
import { describe, it, expect } from 'vitest';
import { ASSETS_DIR, resolveRequestedAssetPath } from '../vite-root-assets';

describe('resolveRequestedAssetPath', () => {
  it('resolves a normal valid relative path inside ASSETS_DIR', () => {
    const result = resolveRequestedAssetPath('/images/geral/foo.jpg');
    expect(result).toEqual({ ok: true, path: path.join(ASSETS_DIR, 'images/geral/foo.jpg') });
  });

  it('rejects a traversal attempt that escapes ASSETS_DIR', () => {
    const result = resolveRequestedAssetPath('/../.env');
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('rejects a sibling folder that merely shares the ASSETS_DIR name as a prefix', () => {
    const result = resolveRequestedAssetPath('/../assets-x/evil.txt');
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('returns malformed (not a thrown error) for invalid percent-encoding', () => {
    const result = resolveRequestedAssetPath('/%E0%A4%A');
    expect(result).toEqual({ ok: false, reason: 'malformed' });
  });

  it('returns malformed for a path containing a null byte', () => {
    const result = resolveRequestedAssetPath('/images/x%00y.jpg');
    expect(result).toEqual({ ok: false, reason: 'malformed' });
  });
});
