import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';

// O script é carregado como script clássico, portanto testamos seus geradores
// sem iniciar Leaflet nem modificar o banco.
const code = readFileSync(resolve(__dirname, '../js/map.js'), 'utf8');
const context = { document: { readyState: 'loading', addEventListener: () => {} }, L: { divIcon: (options: unknown) => options } };
const helpers = runInNewContext(`${code}\n;({ buildPopupHTML, buildSidebarItemHTML, createPinIcon })`, context);

describe('renderização segura dos destinos no mapa', () => {
  it('trata nomes, locais, datas e siglas como texto', () => {
    const attack = '\"><img src=x onerror=alert(1)>';
    const destination = { title: attack, place: attack, visits: [{ date: attack }] };
    const hub = { isHub: true, title: attack, subtitle: attack, code: attack };
    const html = [helpers.buildPopupHTML(destination), helpers.buildSidebarItemHTML(destination, 0), helpers.buildPopupHTML(hub), helpers.buildSidebarItemHTML(hub, 1), helpers.createPinIcon(hub).html];
    for (const result of html) {
      expect(result).not.toContain('<img src=x onerror=alert(1)>');
      expect(result).toContain('&lt;img src=x onerror=alert(1)&gt;');
    }
  });
});
