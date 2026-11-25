// Identidade visual por empresa: compartilhado entre a validação do
// servidor (organizationController.ts) e o painel (frontend/src/lib/
// organizationBrand.ts, que só reexporta isto — mesma convenção de
// imageSrc.ts). Guarda só a cor base escolhida ("vivid") e deriva toda a
// rampa usada pelo Tailwind (primary-50..900) a partir dela, para não pedir
// seis cores de quem só quer escolher "a cor da empresa".
//
// Qualquer #RRGGBB é aceito (inclusive cores vivas/claras que não têm
// 4.5:1 de contraste puras, como o próprio laranja da OVERTRIP, #ff5a00):
// a cor escolhida ("vivid") só decora (avatar, hero, gráfico); texto e
// fundo de botão usam "solid", uma versão escurecida o suficiente para
// manter o contraste mínimo, derivada por mistura perceptual em OKLab (não
// por soma fixa de luminosidade HSL, que gera neon em cores escuras e
// rejeita cores vivas sem necessidade).

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const BRAND_COLOR_FORMAT_MESSAGE = 'Informe uma cor no formato #RRGGBB (ex.: #0b756b).';

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

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v: number): number {
  const clamped = Math.min(1, Math.max(0, v));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
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

/** "#RRGGBB" -> "r g b" (canais separados por espaço): o formato que as variáveis CSS abaixo usam, para o Tailwind poder aplicar opacidade (ex.: `bg-primary-50/50`) com `rgb(var(--x) / <alpha-value>)`. */
function hexToChannels(hex: string): string {
  return hexToRgb(hex).join(' ');
}

// Matrizes padrão de Björn Ottosson para OKLab (as mesmas da especificação
// CSS Color 4) — usadas só para misturar a cor da marca com branco/preto de
// um jeito perceptualmente uniforme (sem o "neon" que soma de luminosidade
// HSL produz em tons escuros/saturados).
function linearRgbToOklab([r, g, b]: [number, number, number]): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

function oklabToLinearRgb([L, a, b]: [number, number, number]): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function hexToOklab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
  return linearRgbToOklab([r, g, b]);
}

function oklabToHex(lab: [number, number, number]): string {
  const [r, g, b] = oklabToLinearRgb(lab).map(linearToSrgb) as [number, number, number];
  return rgbToHex([r * 255, g * 255, b * 255]);
}

const OKLAB_WHITE: [number, number, number] = [1, 0, 0];
const OKLAB_BLACK: [number, number, number] = [0, 0, 0];

/** Mistura `hex` em direção a `target` em OKLab, por `t` (0 = cor original, 1 = `target` puro). */
function mixOklab(hex: string, target: [number, number, number], t: number): string {
  const [L, a, b] = hexToOklab(hex);
  return oklabToHex([L + (target[0] - L) * t, a + (target[1] - a) * t, b + (target[2] - b) * t]);
}

const tint = (hex: string, t: number) => mixOklab(hex, OKLAB_WHITE, t);
const shade = (hex: string, t: number) => mixOklab(hex, OKLAB_BLACK, t);

/** Ponto médio (em OKLab) entre duas cores já resolvidas — usado para um índice intermediário da rampa (ex.: 700 entre "solid" e "text") sem risco de inverter a ordem clara→escura. */
function between(hexA: string, hexB: string): string {
  const [LA, aA, bA] = hexToOklab(hexA);
  const [LB, aB, bB] = hexToOklab(hexB);
  return oklabToHex([(LA + LB) / 2, (aA + aB) / 2, (bA + bB) / 2]);
}

/** Escurece `hex` (busca binária em direção ao preto) até atingir `minContrast` contra branco. Sempre converge: preto puro tem 21:1. */
function darkenToContrast(hex: string, minContrast: number): string {
  if (contrastRatio(hex, '#ffffff') >= minContrast) return hex;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(shade(hex, mid), '#ffffff') >= minContrast) hi = mid; else lo = mid;
  }
  return shade(hex, hi);
}

const SOLID_MIN_CONTRAST = 4.5; // WCAG AA, texto normal — usado por botão/texto sobre branco.
const TEXT_MIN_CONTRAST = 7; // WCAG AAA — reservado para texto corrido que precise de contraste extra.

/**
 * Os seis tokens derivados de uma única cor de marca ("vivid"):
 * - vivid: a cor exata escolhida — só decoração (avatar, hero, gráfico), nunca texto/fundo de botão.
 * - solid: vivid escurecida o suficiente para >= 4.5:1 contra branco — texto e fundo de botão.
 * - text: escurecida ainda mais (>= 7:1) para texto corrido que precise de contraste extra.
 * - subtle/muted: tons bem claros (fundo de destaque leve).
 * - border: tom intermediário (bordas de hover/foco leve).
 */
export interface BrandTokens {
  vivid: string;
  solid: string;
  // Tom de hover do botão/fundo "solid" (entre "solid" e "text" — o mesmo
  // tom usado no índice 700 da rampa, exposto aqui para quem monta um botão
  // fora do Tailwind, ex.: a prévia em OrganizationSettings.tsx).
  solidHover: string;
  subtle: string;
  muted: string;
  border: string;
  text: string;
}

export function derivePaletteFromBrandColor(vivid: string): BrandTokens {
  const solid = darkenToContrast(vivid, SOLID_MIN_CONTRAST);
  const text = darkenToContrast(solid, TEXT_MIN_CONTRAST);
  return {
    vivid,
    solid,
    solidHover: between(solid, text),
    text,
    subtle: tint(vivid, 0.94),
    muted: tint(vivid, 0.84),
    border: tint(vivid, 0.58),
  };
}

export type BrandCssVarName =
  | '--color-primary-50' | '--color-primary-100' | '--color-primary-200' | '--color-primary-300' | '--color-primary-400'
  | '--color-primary-500' | '--color-primary-600' | '--color-primary-700' | '--color-primary-800' | '--color-primary-900'
  | '--color-primary-vivid' | '--color-primary-solid' | '--color-primary-subtle' | '--color-primary-muted'
  | '--color-primary-border' | '--color-primary-text';

export type BrandCssVars = Record<BrandCssVarName, string>;

/**
 * Variáveis CSS que alimentam a escala `primary` do Tailwind (tailwind.config.js)
 * e os nomes semânticos (para quem precisa da cor "pura", não de um índice
 * numérico — ex.: avatar, hero, gráfico). Aplicadas no elemento raiz do
 * painel (ver frontend/src/pages/OrganizationLayout.tsx): todo utilitário
 * Tailwind que usa primary-* segue a marca automaticamente, sem lista de
 * exceções por classe. Valores em canais "r g b" (não "#rrggbb"): é o que
 * tailwind.config.js precisa para aplicar opacidade (ex.: `bg-primary-50/50`).
 */
export function brandTokensToCssVars(tokens: BrandTokens): BrandCssVars {
  return {
    // 50 -> 400: fração de branco decrescente (mais clara -> mais perto da
    // cor pura em 500), então sempre mais clara que o próximo índice.
    '--color-primary-50': hexToChannels(tokens.subtle),
    '--color-primary-100': hexToChannels(tokens.muted),
    '--color-primary-200': hexToChannels(tint(tokens.vivid, 0.70)),
    '--color-primary-300': hexToChannels(tokens.border),
    '--color-primary-400': hexToChannels(tint(tokens.vivid, 0.30)),
    '--color-primary-500': hexToChannels(tokens.vivid),
    '--color-primary-600': hexToChannels(tokens.solid),
    '--color-primary-700': hexToChannels(tokens.solidHover),
    '--color-primary-800': hexToChannels(tokens.text),
    '--color-primary-900': hexToChannels(shade(tokens.text, 0.3)),
    '--color-primary-vivid': hexToChannels(tokens.vivid),
    '--color-primary-solid': hexToChannels(tokens.solid),
    '--color-primary-subtle': hexToChannels(tokens.subtle),
    '--color-primary-muted': hexToChannels(tokens.muted),
    '--color-primary-border': hexToChannels(tokens.border),
    '--color-primary-text': hexToChannels(tokens.text),
  };
}

// A mesma cor que o painel de agência sempre usou como padrão (um
// verde/teal, nunca derivado do organizationId) quando a empresa não
// escolheu uma cor própria.
export const FALLBACK_BRAND_COLOR = '#0b756b';

export const FALLBACK_PALETTE: BrandCssVars = brandTokensToCssVars(derivePaletteFromBrandColor(FALLBACK_BRAND_COLOR));

/**
 * Identidade efetiva da empresa: a cor própria quando configurada (já
 * validada no servidor ao ser salva), senão a mesma paleta fixa de sempre.
 * Nunca deriva nada do organizationId — isso não é uma identidade escolhida.
 */
export function getOrganizationPalette(organization: { brandColor?: string | null }): BrandCssVars {
  if (organization.brandColor && isValidBrandColorFormat(organization.brandColor)) {
    return brandTokensToCssVars(derivePaletteFromBrandColor(organization.brandColor.toLowerCase()));
  }
  return FALLBACK_PALETTE;
}
