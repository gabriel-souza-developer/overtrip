import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const cfg = readFileSync(join(root, 'tailwind.config.js'), 'utf8');
const css = readFileSync(join(root, 'frontend/src/index.css'), 'utf8');

// Lê a escala (ex.: primary, surface) de tailwind.config.js.
function scale(name: string): Record<string, string> {
  const block = cfg.match(new RegExp(`${name}: \\{([^}]*)\\}`))![1];
  return Object.fromEntries([...block.matchAll(/(\d+): '(#[0-9a-f]{6})'/g)].map((m) => [m[1], m[2]]));
}
const scales: Record<string, Record<string, string>> = { primary: scale('primary'), surface: scale('surface') };

// Resolve "bg-primary-500" / "hover:bg-primary-400" etc. para o hex da escala.
function hexOf(token: string): string {
  const [, family, level] = token.match(/(primary|surface)-(\d+)$/)!;
  return scales[family][level];
}
// Classes @apply de uma regra de index.css.
function rule(selector: string): string[] {
  const body = css.match(new RegExp(`\\${selector} \\{\\s*@apply ([^;]*);`))![1];
  return body.trim().split(/\s+/);
}
const find = (classes: string[], prefix: string) => classes.find((c) => c.startsWith(prefix))!;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const white = '#ffffff';

describe('contraste da paleta da marca no painel', () => {
  it('escalas mantêm a marca: primary-500 = rust e surface-900 = ink', () => {
    expect(scales.primary['500']).toBe('#e26b1b');
    expect(scales.surface['900']).toBe('#0d0d0d');
    expect(scales.surface['50']).toBe('#fafafa');
  });

  it.each(['.btn-primary', '.pagination-btn-active'])('%s: tons exatos e contraste AA nos dois estados', (sel) => {
    const c = rule(sel);
    expect(find(c, 'bg-')).toBe('bg-primary-500');
    expect(find(c, 'text-')).toBe('text-surface-900');
    expect(find(c, 'hover:bg-')).toBe('hover:bg-primary-400');
    const text = hexOf(find(c, 'text-'));
    expect(contrast(text, hexOf(find(c, 'bg-')))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, hexOf(find(c, 'hover:bg-')))).toBeGreaterThanOrEqual(4.5);
  });

  it('rust puro com texto branco NÃO passa AA (por isso o texto é ink)', () => {
    expect(contrast(white, scales.primary['500'])).toBeLessThan(4.5);
  });

  it('texto secundário surface-500 sobre o fundo surface-50 e branco passa AA', () => {
    expect(contrast(scales.surface['500'], scales.surface['50'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(scales.surface['500'], white)).toBeGreaterThanOrEqual(4.5);
  });

  it('fundo do body é surface-50', () => {
    expect(css).toMatch(new RegExp(`background-color: ${scales.surface['50']};`));
  });

  it('foco (primary-600) tem ao menos 3:1 contra o fundo branco', () => {
    expect(css).toContain(`outline: 2px solid ${scales.primary['600']};`);
    expect(contrast(scales.primary['600'], white)).toBeGreaterThanOrEqual(3);
  });

  it('texto de marca (item ativo do menu) passa AA', () => {
    expect(contrast(scales.primary['700'], scales.primary['50'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(scales.primary['600'], white)).toBeGreaterThanOrEqual(4.5);
  });
});
