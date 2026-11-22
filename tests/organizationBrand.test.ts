import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BRAND_COLOR_CONTRAST_MESSAGE,
  BRAND_COLOR_FORMAT_MESSAGE,
  FALLBACK_PALETTE,
  derivePaletteFromBrandColor,
  getOrganizationPalette,
  hasEnoughContrastOnWhite,
  isValidBrandColorFormat,
} from '../frontend/src/lib/organizationBrand';

// Contraste mínimo de 4.5:1 (WCAG AA, texto normal), usado tanto para texto
// 600 sobre branco quanto para texto branco sobre fundo 600.
function relativeLuminance(hex: string): number {
  const [r, g, b] = (hex.replace('#', '').match(/.{2}/g) as string[]).map((part) => {
    const channel = parseInt(part, 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(hexA: string, hexB: string): number {
  const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('identidade visual sem cor própria configurada (fallback)', () => {
  it('sem brandColor, toda empresa recebe a mesma paleta documentada — nunca uma cor derivada do id', () => {
    const orgs = [{ id: 'org-a' }, { id: 'org-b' }, { id: 'org-horizonte-viagens', brandColor: null }, { id: 'org-d', brandColor: undefined }];
    for (const org of orgs) expect(getOrganizationPalette(org)).toEqual(FALLBACK_PALETTE);
  });

  it('é a mesma cor que o painel de agência já usava antes de existir cor configurável (organization-theme.css)', () => {
    const css = readFileSync('frontend/src/pages/organization-theme.css', 'utf8');
    const block = css.slice(css.indexOf('.agency-panel {'), css.indexOf('}'));
    for (const [variable, value] of Object.entries(FALLBACK_PALETTE)) {
      expect(block).toContain(`${variable}: ${value};`);
    }
  });

  it('a cor 600 do fallback tem contraste >= 4.5:1 contra branco', () => {
    expect(contrastRatio(FALLBACK_PALETTE['--agency-600'], '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('o fallback não reutiliza o laranja do OVERTRIP (tailwind.config.js: primary 500/600)', () => {
    expect(FALLBACK_PALETTE['--agency-500']).not.toBe('#e26b1b');
    expect(FALLBACK_PALETTE['--agency-600']).not.toBe('#bf5200');
  });

  it('não depende do ambiente (DOM/matchMedia): é uma função pura', () => {
    expect(() => getOrganizationPalette({ id: 'qualquer-id' })).not.toThrow();
  });
});

describe('validação de cor configurada explicitamente', () => {
  it('aceita só #RRGGBB (6 dígitos hex, com ou sem caixa alta)', () => {
    expect(isValidBrandColorFormat('#0b756b')).toBe(true);
    expect(isValidBrandColorFormat('#0B756B')).toBe(true);
    expect(isValidBrandColorFormat('0b756b')).toBe(false); // sem #
    expect(isValidBrandColorFormat('#0b756')).toBe(false); // 5 dígitos
    expect(isValidBrandColorFormat('#0b756bb')).toBe(false); // 7 dígitos
    expect(isValidBrandColorFormat('#zzzzzz')).toBe(false); // não é hex
    expect(isValidBrandColorFormat('red')).toBe(false); // nome de cor, não hex
    expect(isValidBrandColorFormat('')).toBe(false);
  });

  it('rejeita qualquer coisa que não seja um hex de 6 dígitos, inclusive tentativa de escapar do valor CSS', () => {
    for (const attempt of ['javascript:alert(1)', 'url(x)', '#0b756b; background: red', '#0b756b)']) {
      expect(isValidBrandColorFormat(attempt)).toBe(false);
    }
  });

  it('contraste mínimo: cores claras (ex.: amarelo) não passam; cores escuras passam', () => {
    expect(hasEnoughContrastOnWhite('#ffff00')).toBe(false); // amarelo puro
    expect(hasEnoughContrastOnWhite('#ffffff')).toBe(false); // branco sobre branco
    expect(hasEnoughContrastOnWhite('#0b756b')).toBe(true); // mesmo tom do fallback
    expect(hasEnoughContrastOnWhite('#000000')).toBe(true);
  });

  it('as mensagens de erro existem e são distintas (formato vs. contraste)', () => {
    expect(BRAND_COLOR_FORMAT_MESSAGE).not.toBe(BRAND_COLOR_CONTRAST_MESSAGE);
    expect(BRAND_COLOR_FORMAT_MESSAGE.length).toBeGreaterThan(0);
    expect(BRAND_COLOR_CONTRAST_MESSAGE.length).toBeGreaterThan(0);
  });
});

describe('identidade visual com cor própria configurada', () => {
  it('usa a cor da empresa (nunca o fallback) quando brandColor está configurado e válido', () => {
    const palette = getOrganizationPalette({ id: 'org-x', brandColor: '#5a319b' });
    expect(palette['--agency-600']).toBe('#5a319b');
    expect(palette).not.toEqual(FALLBACK_PALETTE);
  });

  it('é determinística: a mesma cor sempre deriva a mesma rampa', () => {
    const a = derivePaletteFromBrandColor('#185f90');
    const b = derivePaletteFromBrandColor('#185f90');
    expect(a).toEqual(b);
  });

  it('deriva uma rampa coerente: 50 mais clara que 300, que é mais clara que 500, que é mais clara que a base (600), que é mais clara que 600-hover', () => {
    const palette = derivePaletteFromBrandColor('#185f90');
    const luminances = (['--agency-50', '--agency-100', '--agency-300', '--agency-500', '--agency-600', '--agency-600-hover'] as const)
      .map((key) => relativeLuminance(palette[key]));
    for (let i = 1; i < luminances.length; i++) expect(luminances[i]).toBeLessThan(luminances[i - 1]);
  });

  it('toda cor derivada da base continua com contraste >= 4.5:1 contra branco (a base já precisa ter sido validada antes)', () => {
    for (const base of ['#185f90', '#5a319b', '#9b3162', '#333f96', '#000000']) {
      expect(hasEnoughContrastOnWhite(derivePaletteFromBrandColor(base)['--agency-600'])).toBe(true);
    }
  });

  it('cor inválida (formato ruim) não é usada: getOrganizationPalette cai no fallback em vez de gerar algo quebrado', () => {
    expect(getOrganizationPalette({ id: 'org-y', brandColor: 'não-é-hex' })).toEqual(FALLBACK_PALETTE);
  });
});
