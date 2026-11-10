import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

describe('proteções do painel', () => {
  it('telas de administrador ficam atrás da AdminRoute', () => {
    const app = read('frontend/src/App.tsx');
    const guard = app.slice(app.indexOf('<Route element={<AdminRoute />}>'));
    const block = guard.slice(0, guard.indexOf('</Route>'));
    for (const path of ['/leads', '/reservations', '/settings', '/system']) expect(block).toContain(`path="${path}"`);
  });

  it('menu mostra Configurações só para administradores', () => {
    expect(read('frontend/src/components/Layout.tsx')).toMatch(/path: '\/settings'.*adminOnly: true/);
  });

  it('menu fechado no celular sai da ordem de foco', () => {
    expect(read('frontend/src/components/Layout.tsx')).toContain("toggleAttribute('inert', !isDesktop && !sidebarOpen)");
  });

  it('login não revela o e-mail do administrador', () => {
    expect(read('frontend/src/pages/Login.tsx')).not.toContain('admin@overtrip.com.br');
  });

  it('painel não é indexado por buscadores', () => {
    expect(read('frontend/index.html')).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(read('robots.txt')).toMatch(/^Disallow: \/admin\/$/m);
  });
});
