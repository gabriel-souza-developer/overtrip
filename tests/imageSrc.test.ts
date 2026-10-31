import { describe, it, expect } from 'vitest';
import { imageSrcSchema, galleryUpdateSchema, visitCreateSchema, tripCreateSchema } from '../src/validators';

describe('imageSrcSchema', () => {
  it.each([
    'https://exemplo.com/a.jpg',
    'http://exemplo.com/a.jpg',
    'assets/images/coqueirinho-conde-pb/coqueirinho-pb-vista-aerea.jpg',
    '/assets/images/x/y z.webp',
    'assets/images/foto interna.jpg',
  ])('aceita %s', (v) => {
    expect(imageSrcSchema.safeParse(v).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:image/png;base64,AAAA',
    'ftp://exemplo.com/a.jpg',
    'file:///etc/passwd',
    'assets/../secret.jpg',
    '/assets/../secret.jpg',
    'assets/%2e%2e/x.jpg',
    'assets/%2E%2E/x.jpg',
    'assets/%252e%252e/x.jpg',
    'assets/a.jpg%00',
    'assets/a%0a.jpg',
    'assets/a\u0000.jpg',
    'assets/a\n.jpg',
    'assets/a\t.jpg',
    'assets\\images\\a.jpg',
    'images/a.jpg',
    '/etc/passwd',
    '//evil.com/a.jpg',
    'assets//a.jpg',
    'assets/',
    ' assets/a.jpg',
    'https://',
    '',
  ])('recusa %j', (v) => {
    const r = imageSrcSchema.safeParse(v);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/http:\/\/ ou https:\/\//);
  });

  it('é usado por viagem, visita e galeria', () => {
    const rel = 'assets/images/a.jpg';
    expect(tripCreateSchema.safeParse({ title: 't', category: 'c', description: 'd', city: 'c', region: 'r', startDateISO: '2026-12-01T06:00:00-03:00', media: [{ src: rel, alt: 'a' }] }).error?.issues.some((i) => i.path[0] === 'media')).toBeFalsy();
    expect(visitCreateSchema.safeParse({ title: 't', city: 'c', region: 'r', images: [{ src: 'javascript:x', alt: 'a' }] }).success).toBe(false);
    expect(galleryUpdateSchema.safeParse({ images: [{ src: rel, alt: 'a' }] }).success).toBe(true);
    expect(galleryUpdateSchema.safeParse({ images: [{ src: 'javascript:x', alt: 'a' }] }).success).toBe(false);
  });
});

import { isValidImageSrc } from '../frontend/src/lib/imageSrc';
describe('regra compartilhada com o painel', () => {
  it('painel usa a mesma regra', () => {
    expect(isValidImageSrc('assets/images/a.jpg')).toBe(true);
    expect(isValidImageSrc('javascript:alert(1)')).toBe(false);
  });
});
