import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Fontes de reserva com métricas da Inter: o texto não "pula" (CLS) quando a fonte do Google carrega.
const base = readFileSync('css/base.css', 'utf8');
const cssFiles = readdirSync('css').filter((f) => f.endsWith('.css')).map((f) => [f, readFileSync(`css/${f}`, 'utf8')] as const);

describe('fontes de reserva do site', () => {
  it.each(['Inter Fallback', 'Inter Tight Fallback'])('define %s a partir de fontes locais, com métricas ajustadas', (name) => {
    const block = base.slice(base.indexOf(`font-family: "${name}"`) - 200, base.indexOf(`font-family: "${name}"`) + 400);
    expect(block).toContain('@font-face');
    expect(block).toMatch(/src: local\("Arial"\)/);
    for (const prop of ['size-adjust', 'ascent-override', 'descent-override', 'line-gap-override']) expect(block).toContain(prop);
  });

  it.each(cssFiles)('%s sempre põe a reserva antes de sans-serif', (_file, css) => {
    expect(css).not.toMatch(/"Inter",\s*sans-serif/);
    expect(css).not.toMatch(/"Inter Tight",\s*sans-serif/);
  });
});
