import { describe, it, expect } from 'vitest';
import { resolveAssetSrc } from '../frontend/src/lib/assetUrl';

describe('resolveAssetSrc', () => {
  it('rewrites a relative asset path to a root-absolute path', () => {
    expect(resolveAssetSrc('assets/images/coqueirinho-conde-pb/coqueirinho-pb-vista-aerea.jpg'))
      .toBe('/assets/images/coqueirinho-conde-pb/coqueirinho-pb-vista-aerea.jpg');
  });

  it('leaves http(s) URLs unchanged', () => {
    expect(resolveAssetSrc('https://example.com/foo.jpg')).toBe('https://example.com/foo.jpg');
    expect(resolveAssetSrc('http://example.com/foo.jpg')).toBe('http://example.com/foo.jpg');
  });

  it('leaves root-relative paths unchanged', () => {
    expect(resolveAssetSrc('/assets/brand/logo.png')).toBe('/assets/brand/logo.png');
  });

  it('returns an empty src unchanged', () => {
    expect(resolveAssetSrc('')).toBe('');
  });
});
