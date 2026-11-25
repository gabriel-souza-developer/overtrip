// Identidade visual por empresa: compartilhado entre a validação do
// servidor (organizationController.ts) e o painel (frontend/src/lib/
// organizationBrand.ts, que só reexporta isto — mesma convenção de
// imageSrc.ts). Guarda só a cor base (equivalente ao "--agency-600" já
// usado pelo painel) e deriva o resto da rampa a partir dela, para não
// pedir seis cores de quem só quer escolher "a cor da empresa".

export type OrganizationPalette = Record<
  '--agency-50' | '--agency-100' | '--agency-300' | '--agency-500' | '--agency-600' | '--agency-600-hover',
  string
>;

// A mesma paleta que o painel de agência sempre usou (organization-theme.css),
// usada sem mudança nenhuma quando a empresa não escolheu uma cor própria —
// nunca derivada do organizationId, que não é uma escolha de ninguém.
export const FALLBACK_PALETTE: OrganizationPalette = {
  '--agency-50': '#edf9f7',
  '--agency-100': '#d6f0eb',
  '--agency-300': '#80c9bc',
  '--agency-500': '#0b756b',
  '--agency-600': '#09685f',
  '--agency-600-hover': '#07544d',
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const BRAND_COLOR_FORMAT_MESSAGE = 'Informe uma cor no formato #RRGGBB (ex.: #0b756b).';
export const BRAND_COLOR_CONTRAST_MESSAGE = 'Essa cor é muito clara para o contraste mínimo exigido (4.5:1 com texto branco); escolha um tom mais escuro.';

/** Formato estrito: só #RRGGBB (6 dígitos hex), nada mais passa para o CSS. */
export function isValidBrandColorFormat(value: string): boolean {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
}

function channelLuminance(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Luminância relativa (WCAG) de uma cor #RRGGBB já validada. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** Razão de contraste (WCAG) entre duas cores #RRGGBB já validadas. */
export function contrastRatio(hexA: string, hexB: string): number {
  const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const MIN_CONTRAST_ON_WHITE = 4.5;

/** Contraste mínimo (4.5:1 contra branco) exigido para servir de texto/botão. */
export function hasEnoughContrastOnWhite(hex: string): boolean {
  return contrastRatio(hex, '#ffffff') >= MIN_CONTRAST_ON_WHITE;
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return [h, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Clareia (`amount` > 0) ou escurece (`amount` < 0) mantendo matiz/saturação. */
function adjustLightness(hex: string, amount: number): string {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, s, Math.min(1, Math.max(0, l + amount))]));
}

/**
 * Deriva a rampa inteira a partir de uma única cor base (equivalente ao
 * "--agency-600" visto em botões/texto). A base já precisa ter passado por
 * isValidBrandColorFormat + hasEnoughContrastOnWhite antes de chegar aqui.
 */
export function derivePaletteFromBrandColor(baseColor: string): OrganizationPalette {
  return {
    '--agency-50': adjustLightness(baseColor, 0.46),
    '--agency-100': adjustLightness(baseColor, 0.40),
    '--agency-300': adjustLightness(baseColor, 0.24),
    '--agency-500': adjustLightness(baseColor, 0.07),
    '--agency-600': baseColor,
    '--agency-600-hover': adjustLightness(baseColor, -0.07),
  };
}

/**
 * Identidade efetiva da empresa: a cor própria quando configurada (já
 * validada no servidor ao ser salva), senão a mesma paleta fixa de sempre.
 * Nunca deriva nada do organizationId — isso não é uma identidade escolhida.
 */
export function getOrganizationPalette(organization: { brandColor?: string | null }): OrganizationPalette {
  if (organization.brandColor && isValidBrandColorFormat(organization.brandColor)) {
    return derivePaletteFromBrandColor(organization.brandColor.toLowerCase());
  }
  return FALLBACK_PALETTE;
}
