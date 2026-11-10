import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_WHATSAPP_NUMBER, setupWaLinks } from '../js/whatsapp.js';

const fakeLink = (dataset: Record<string, string>) => ({
  dataset, textContent: 'Compartilhar', href: '#', setAttribute() {}, addEventListener() {},
});

afterEach(() => vi.unstubAllGlobals());

describe('links de WhatsApp', () => {
  it('compartilhar abre a escolha de contato, sem o número da OVERTRIP', () => {
    const share = fakeLink({ waShare: '', waMessage: 'Vi esse post: https://overtrip.com.br/blog/x/' });
    const contact = fakeLink({ waMessage: 'Olá!' });
    vi.stubGlobal('document', { querySelectorAll: () => [share, contact] });
    setupWaLinks();
    expect(share.href).toBe(`https://wa.me/?text=${encodeURIComponent('Vi esse post: https://overtrip.com.br/blog/x/')}`);
    expect(contact.href).toContain(`https://wa.me/${FALLBACK_WHATSAPP_NUMBER}?text=`);
  });
});

const BLOG = ['blog/index.html', 'blog/agente-overtrip/index.html', 'blog/overtrip-riders/index.html', 'blog/primeira-expedicao/index.html'];
const SECONDARY = [...BLOG, 'riders/index.html'];
const html = (file: string) => readFileSync(file, 'utf8');

describe('páginas secundárias', () => {
  it.each(BLOG)('%s marca o botão de compartilhar como compartilhamento', (file) => {
    const shares = html(file).match(/<a [^>]*post-share[^>]*>/g) ?? [];
    for (const tag of shares) expect(tag).toContain('data-wa-share');
  });

  it.each(SECONDARY)('%s usa a entrada leve, sem carregar viagens nem /trips.json', (file) => {
    const page = html(file);
    expect(page).not.toMatch(/src="\/js\/main\.js/);
    expect(page).toMatch(/<script type="module" src="\/js\/page\.js(\?v=[\w-]+)?"><\/script>/);
  });

  it('a entrada leve aplica o WhatsApp do painel antes de montar os links', () => {
    const entry = readFileSync('js/page.js', 'utf8');
    expect(entry).not.toMatch(/data\.js|render\.js|trips/);
    expect(entry.indexOf('await loadWhatsappNumber')).toBeGreaterThan(-1);
    expect(entry.indexOf('await loadWhatsappNumber')).toBeLessThan(entry.indexOf('setupWaLinks()'));
  });

  it.each(SECONDARY)('%s leva OVER RIDERS do rodapé para /riders/', (file) => {
    expect(html(file)).not.toMatch(/href="\/#universo"[^>]*>\s*OVER RIDERS/);
  });

  it.each(SECONDARY)('%s já sai do HTML com links de WhatsApp válidos (antes do JavaScript)', (file) => {
    for (const tag of html(file).match(/<a\b[^>]*\bwa-link\b[^>]*>/g) ?? []) {
      expect(tag).not.toContain('href="#"');
      expect(tag).toMatch(tag.includes('data-wa-share') ? /href="https:\/\/wa\.me\/\?text=/ : new RegExp(`href="https://wa\\.me/${FALLBACK_WHATSAPP_NUMBER}\\?text=`));
    }
  });

  it('o post de primeira expedição exige documento original com foto', () => {
    expect(html('blog/primeira-expedicao/index.html')).toContain('Documento original com foto (obrigatório para embarque)');
  });
});

describe('peso das imagens nas páginas secundárias', () => {
  const HEAVY = /\/assets\/images\/(?:cachoeira-do-pinga-pb\/cachoeira-do-pinga-pb(?:-estrada-moto)?|riders\/over-riders-capa-tema)\.jpg/;
  it.each(SECONDARY)('%s só usa as fotos grandes com versões WebP em srcset', (file) => {
    for (const tag of html(file).match(/<img\b[^>]*>/g) ?? []) {
      if (!HEAVY.test(tag)) continue;
      expect(tag).toMatch(/srcset="[^"]*-w640\.webp 640w/);
      expect(tag).toContain('sizes="');
    }
  });

  it('as versões WebP referenciadas existem', async () => {
    const { existsSync } = await import('node:fs');
    for (const file of SECONDARY) {
      for (const src of html(file).match(/\/assets\/images\/[^\s"]+\.webp/g) ?? []) expect(existsSync(src.slice(1)), src).toBe(true);
    }
  });
});
