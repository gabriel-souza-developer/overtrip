import { describe, expect, it } from 'vitest';
import {
  BRAND_COLOR_FORMAT_MESSAGE,
  FALLBACK_BRAND_COLOR,
  FALLBACK_PALETTE,
  derivePaletteFromBrandColor,
  getOrganizationPalette,
  isValidBrandColorFormat,
} from '../frontend/src/lib/organizationBrand';

// Contraste mínimo de 4.5:1 (WCAG AA, texto normal) / 7:1 (AAA), usado para
// conferir os tokens derivados independentemente da implementação.
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
// "r g b" (como as variáveis CSS guardam, ver organizationBrand.ts) -> luminância.
function relativeLuminanceFromChannels(channels: string): number {
  const [r, g, b] = channels.split(' ').map((part) => {
    const channel = Number(part) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('identidade visual sem cor própria configurada (fallback)', () => {
  it('sem brandColor, toda empresa recebe a mesma paleta documentada — nunca uma cor derivada do id', () => {
    const orgs = [{ id: 'org-a' }, { id: 'org-b' }, { id: 'org-horizonte-viagens', brandColor: null }, { id: 'org-d', brandColor: undefined }];
    for (const org of orgs) expect(getOrganizationPalette(org)).toEqual(FALLBACK_PALETTE);
  });

  it('o fallback deriva da mesma cor de sempre (um verde/teal, nunca derivado do organizationId)', () => {
    expect(FALLBACK_BRAND_COLOR).toBe('#0b756b');
    expect(getOrganizationPalette({ id: 'qualquer-id' })).toEqual(derivePaletteFromBrandColorAsCssVars(FALLBACK_BRAND_COLOR));
  });

  it('a cor 600 (índice usado em texto/fundo de botão) do fallback tem contraste >= 4.5:1 contra branco', () => {
    expect(contrastRatio(channelsToHex(FALLBACK_PALETTE['--color-primary-600']), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('o fallback não reutiliza o laranja da OVERTRIP', () => {
    expect(channelsToHex(FALLBACK_PALETTE['--color-primary-500'])).not.toBe('#ff5a00');
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

  it('a mensagem de formato existe', () => {
    expect(BRAND_COLOR_FORMAT_MESSAGE.length).toBeGreaterThan(0);
  });

  it('não exige contraste nenhum da cor crua: cores vivas/claras (ex.: o laranja #ff5a00 da OVERTRIP, ou amarelo puro) não são rejeitadas — só o formato é validado', () => {
    for (const vivid of ['#ff5a00', '#ffff00', '#ffffff']) {
      expect(() => derivePaletteFromBrandColor(vivid)).not.toThrow();
    }
  });
});

describe('identidade visual com cor própria configurada', () => {
  it('usa a cor da empresa (nunca o fallback) quando brandColor está configurado e válido', () => {
    const palette = getOrganizationPalette({ id: 'org-x', brandColor: '#5a319b' });
    expect(channelsToHex(palette['--color-primary-500'])).toBe('#5a319b'); // 500 = "vivid", a cor exata escolhida
    expect(palette).not.toEqual(FALLBACK_PALETTE);
  });

  it('é determinística: a mesma cor sempre deriva a mesma rampa', () => {
    const a = derivePaletteFromBrandColor('#185f90');
    const b = derivePaletteFromBrandColor('#185f90');
    expect(a).toEqual(b);
  });

  it('deriva uma rampa coerente: 50 mais clara que 300, que é mais clara que 500 (vivid), que é mais clara ou igual a 600 (solid), que é mais clara ou igual a 800 (text)', () => {
    for (const base of ['#185f90', '#ff5a00', '#b00020', '#5a319b']) {
      const scale = derivePaletteFromBrandColorAsCssVars(base);
      const luminances = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']
        .map((key) => relativeLuminanceFromChannels(scale[`--color-primary-${key}` as keyof typeof scale]));
      for (let i = 1; i < luminances.length; i++) expect(luminances[i]).toBeLessThanOrEqual(luminances[i - 1] + 1e-9);
    }
  });

  it('"solid" (600) sempre tem contraste >= 4.5:1 contra branco, e "text" (800) sempre >= 7:1 — mesmo para cores vivas/claras que não têm esse contraste na forma crua', () => {
    for (const vivid of ['#185f90', '#5a319b', '#9b3162', '#333f96', '#000000', '#ff5a00', '#ffff00', '#ffffff']) {
      const tokens = derivePaletteFromBrandColor(vivid);
      expect(contrastRatio(tokens.solid, '#ffffff')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.text, '#ffffff')).toBeGreaterThanOrEqual(7);
    }
  });

  it('"vivid" nunca é alterada: fica disponível crua para decoração (avatar, hero, gráfico), mesmo quando não tem contraste suficiente para texto', () => {
    expect(derivePaletteFromBrandColor('#ff5a00').vivid).toBe('#ff5a00');
    expect(derivePaletteFromBrandColor('#ffff00').vivid).toBe('#ffff00');
  });

  it('cor já acessível (ex.: o verde do fallback) não precisa ser escurecida: "solid" fica igual a "vivid"', () => {
    expect(derivePaletteFromBrandColor('#000000').solid).toBe('#000000');
  });

  it('cor inválida (formato ruim) não é usada: getOrganizationPalette cai no fallback em vez de gerar algo quebrado', () => {
    expect(getOrganizationPalette({ id: 'org-y', brandColor: 'não-é-hex' })).toEqual(FALLBACK_PALETTE);
  });
});

// Auxiliares só deste arquivo: "r g b" <-> "#rrggbb", pra comparar com valores
// de teste escritos em hex sem reimplementar a conversão da lib.
function channelsToHex(channels: string): string {
  return `#${channels.split(' ').map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
}
function derivePaletteFromBrandColorAsCssVars(vivid: string) {
  return getOrganizationPalette({ id: 'probe', brandColor: vivid });
}
