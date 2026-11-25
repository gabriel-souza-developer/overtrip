import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error site JavaScript module
import { TRIPS } from '../js/data.js?v=status-finalizadas-20261110-v2';
// @ts-expect-error site JavaScript module
import { setupPixModal } from '../js/pix.js';

afterEach(() => {
  TRIPS.splice(0);
  vi.unstubAllGlobals();
});

describe('pagamento Pix', () => {
  it('usa a mesma URL de dados dos cards e abre o modal da viagem carregada', () => {
    const render = readFileSync('js/render.js', 'utf8');
    const pix = readFileSync('js/pix.js', 'utf8');
    const dataUrl = (source: string) => source.match(/from "(\.\/data\.js[^\"]*)"/)?.[1];
    expect(dataUrl(pix)).toBe(dataUrl(render));

    const title = { textContent: '' };
    const price = { textContent: '' };
    const key = { textContent: '' };
    const close = { focus: vi.fn() };
    const modal = {
      querySelector: (selector: string) => ({ '#pix-modal-title': title, '#pix-modal-price': price, '#pix-key-value': key, '.lightbox-close': close } as Record<string, unknown>)[selector] || null,
      querySelectorAll: () => [],
      classList: { add: vi.fn(), remove: vi.fn() },
      setAttribute: vi.fn(),
    };
    let click: (event: unknown) => void = () => {};
    const grid = { addEventListener: (_: string, handler: typeof click) => { click = handler; } };
    vi.stubGlobal('document', {
      querySelector: (selector: string) => selector === '#pix-modal' ? modal : grid,
      addEventListener: vi.fn(), body: { classList: { add: vi.fn(), remove: vi.fn() } },
    });
    vi.stubGlobal('window', { dataLayer: [] });
    TRIPS.push({ title: 'Viagem de teste', priceDisplay: 'R$ 100,00' });
    setupPixModal();
    click({ target: { closest: () => ({ dataset: { pixTripIndex: '0' } }) } });
    expect(title.textContent).toBe('Viagem de teste');
    expect(price.textContent).toContain('R$ 100,00');
    expect(key.textContent).toBeTruthy();
    expect(modal.setAttribute).toHaveBeenCalledWith('aria-hidden', 'false');
    expect(close.focus).toHaveBeenCalled();
  });
});
