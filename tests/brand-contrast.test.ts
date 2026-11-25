import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FALLBACK_BRAND_COLOR, getOrganizationPalette } from '../frontend/src/lib/organizationBrand';

const root = join(__dirname, '..');
const css = readFileSync(join(root, 'frontend/src/index.css'), 'utf8');

// Lê o bloco :root de index.css (variável "r g b", não "#rrggbb" — ver
// src/validators/organizationBrand.ts) e devolve cada uma já em hex, para
// comparar com valores de teste escritos em hex.
function rootVars(): Record<string, string> {
  const block = css.match(/:root \{([^}]*)\}/)![1];
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
function channelsToHex(channels: string): string {
  return `#${channels.trim().split(/\s+/).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

const vars = rootVars();
const primary = Object.fromEntries(
  ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'].map((n) => [n, channelsToHex(vars[`--color-primary-${n}`])]),
);
const surface = Object.fromEntries(
  ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'].map((n) => [n, channelsToHex(vars[`--color-surface-${n}`])]),
);

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

describe('contraste da paleta da marca no painel (variáveis CSS em :root, ver tailwind.config.js)', () => {
  it('o padrão em :root é o laranja da própria OVERTRIP (#ff5a00), passado pela mesma derivação de paleta usada por qualquer empresa', () => {
    expect(primary['500']).toBe('#ff5a00'); // "vivid": a cor exata, sem alteração
    expect(getOrganizationPalette({ id: 'overtrip-probe' })['--color-primary-500']).not.toBe(vars['--color-primary-500']); // fallback de agência é outra cor (verde/teal), não o laranja
  });

  it('surface mantém o cinza neutro de sempre: 900 = tinta (quase preto), 50 = quase branco — nunca derivado de marca', () => {
    expect(surface['900']).toBe('#0d0d0d');
    expect(surface['50']).toBe('#fafafa');
  });

  it('.btn-primary (bg-primary-600, texto branco) mantém contraste AA, inclusive no hover (primary-700)', () => {
    expect(css).toMatch(/\.btn-primary\s*\{\s*@apply btn bg-primary-600 text-white hover:bg-primary-700;/);
    expect(contrast(white, primary['600'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(white, primary['700'])).toBeGreaterThanOrEqual(4.5);
  });

  it('.pagination-btn-active usa a mesma cor dos botões e texto branco legível', () => {
    expect(css).toMatch(/\.pagination-btn-active\s*\{\s*@apply bg-primary-600 text-white border-primary-600 hover:bg-primary-700;/);
  });

  it('o laranja puro da OVERTRIP (vivid, 500) NÃO passa AA sozinho — por isso o painel usa "solid" (600) em texto/botão, nunca a cor crua', () => {
    expect(contrast(white, primary['500'])).toBeLessThan(4.5);
  });

  it('texto secundário surface-500 sobre o fundo surface-50 e branco passa AA', () => {
    expect(contrast(surface['500'], surface['50'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(surface['500'], white)).toBeGreaterThanOrEqual(4.5);
  });

  it('fundo do body é surface-50 (via variável CSS, não hex fixo)', () => {
    expect(css).toContain('background-color: rgb(var(--color-surface-50));');
  });

  it('foco usa a cor "solid" da marca (var(--color-primary-600)) e tem ao menos 3:1 contra o fundo branco', () => {
    expect(css).toContain('outline: 2px solid rgb(var(--color-primary-600));');
    expect(contrast(primary['600'], white)).toBeGreaterThanOrEqual(3);
  });

  it('o tom escuro da marca ("solid", 600) é legível sobre branco, e "text" (800, para texto corrido) ainda mais (>= 7:1)', () => {
    expect(contrast(primary['600'], white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(primary['800'], white)).toBeGreaterThanOrEqual(7);
  });

  it('a rampa primary é monotônica: cada índice é mais escuro ou igual ao anterior', () => {
    const keys = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
    const luminances = keys.map((k) => luminance(primary[k]));
    for (let i = 1; i < luminances.length; i++) expect(luminances[i]).toBeLessThanOrEqual(luminances[i - 1] + 1e-9);
  });

  it('status (sucesso/alerta/erro/info) usa tokens fixos em :root, nunca a variável primary da marca', () => {
    for (const name of ['--success-bg', '--success-text', '--warning-bg', '--warning-text', '--danger-bg', '--danger-text', '--info-bg', '--info-text']) {
      expect(vars[name]).toBeDefined();
      expect(vars[name]).not.toContain('--color-primary');
    }
  });

  it('FALLBACK_BRAND_COLOR (cor fixa do painel de agência sem marca própria) é diferente do laranja da OVERTRIP', () => {
    expect(FALLBACK_BRAND_COLOR).not.toBe('#ff5a00');
  });
});
