import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('css/base.css', 'utf8');
const token = (name: string) => css.match(new RegExp(`^\\s*--${name}:\\s*([^;]+);`, "m"))![1].trim();

// Cinzas da marca em oklch(L 0 0): a luminância relativa é L³.
const grayLum = (name: string) => Number(token(name).match(/oklch\(([\d.]+) 0 0\)/)![1]) ** 3;
const hexLum = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

describe('laranja de texto do site (WCAG AA)', () => {
  it('--rust-strong passa sobre os fundos claros e com texto claro em botões', () => {
    const strong = hexLum(token('rust-strong'));
    expect(ratio(strong, grayLum('bone'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(strong, grayLum('paper'))).toBeGreaterThanOrEqual(4.5);
  });

  it('--rust-light passa sobre o verde-musgo (medido: rgb 46,60,50)', () => {
    expect(ratio(hexLum(token('rust-light')), hexLum('#2e3c32'))).toBeGreaterThanOrEqual(4.5);
  });

  it('botões laranja com texto claro usam --rust-strong', () => {
    for (const [file, selector] of [['css/base.css', '.button-rust {'], ['css/blog.css', '.blog-card-badge {'], ['css/header.css', '.site-nav .nav-list > li > .nav-blog {']]) {
      const text = readFileSync(file, 'utf8');
      const block = text.slice(text.indexOf(selector), text.indexOf('}', text.indexOf(selector)));
      expect(block, selector).toContain('background: var(--rust-strong)');
    }
  });
});
