import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

// Resolve "bg-primary-500" / "hover:bg-primary-600" etc. para o hex da escala.
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

// O painel (frontend/src) usa um verde/teal próprio (herdado do Workspace), separado
// do laranja da marca/site público: a prévia do card (.site-card-preview, que espelha
// o site) e o site público continuam com --rust/oklch(...) e não entram aqui.
describe('contraste da paleta do painel (verde/teal do Workspace)', () => {
  it('escalas do painel: primary-500 = verde do Workspace e surface-900 = ink', () => {
    expect(scales.primary['500']).toBe('#26755e');
    expect(scales.primary['600']).toBe('#1d634e');
    expect(scales.surface['900']).toBe('#0d0d0d');
    expect(scales.surface['50']).toBe('#fafafa');
  });

  it('.btn-primary usa o verde do Workspace (#26755E) com texto branco; hover no tom mais escuro (#1D634E)', () => {
    const c = rule('.btn-primary');
    expect(find(c, 'bg-')).toBe('bg-primary-500');
    expect(find(c, 'text-')).toBe('text-white');
    expect(find(c, 'hover:bg-')).toBe('hover:bg-primary-600');
    expect(contrast(white, hexOf(find(c, 'bg-')))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(white, hexOf(find(c, 'hover:bg-')))).toBeGreaterThanOrEqual(4.5);
  });

  it('.pagination-btn-active: mesmo verde, texto branco e contraste AA no normal/hover', () => {
    const c = rule('.pagination-btn-active');
    expect(find(c, 'bg-')).toBe('bg-primary-500');
    expect(find(c, 'text-')).toBe('text-white');
    expect(find(c, 'hover:bg-')).toBe('hover:bg-primary-600');
    expect(contrast(white, hexOf(find(c, 'bg-')))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(white, hexOf(find(c, 'hover:bg-')))).toBeGreaterThanOrEqual(4.5);
  });

  it('verde da marca do painel com texto branco passa AA (normal e hover)', () => {
    expect(contrast(white, scales.primary['500'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(white, scales.primary['600'])).toBeGreaterThanOrEqual(4.5);
  });

  it('texto secundário surface-500 sobre o fundo surface-50 e branco passa AA', () => {
    expect(contrast(scales.surface['500'], scales.surface['50'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(scales.surface['500'], white)).toBeGreaterThanOrEqual(4.5);
  });

  it('fundo do body é surface-50', () => {
    expect(css).toMatch(new RegExp(`background-color: ${scales.surface['50']};`));
  });

  it('foco visível usa o verde do painel (não mais o laranja do site) e tem ao menos 3:1 contra o fundo branco', () => {
    expect(css).toContain(`outline: 2px solid ${scales.primary['500']};`);
    expect(contrast(scales.primary['500'], white)).toBeGreaterThanOrEqual(3);
  });

  it('nenhum laranja antigo da marca (#E26B1B e tons escuros anteriores) sobrevive no painel', () => {
    // primary-600 é intencional (hover de .btn-primary/.pagination-btn-active); 700+ não são usados.
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : /\.(tsx?|css)$/.test(name) ? [full] : [];
    });
    const offenders = walk(join(root, 'frontend/src')).filter((file) => /primary-(?:700|800|900)\b/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
    expect(css).not.toMatch(/#e26b1b|#bf5200|#993e00|#fa8746|#ffa977/i);
  });
});
