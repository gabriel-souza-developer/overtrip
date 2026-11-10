import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Teste de código-fonte: o menu lateral usa nomes de operação da agência, um ícone por item
// e o mesmo nome que o título da tela aberta, para quem opera não se perder.
const read = (file: string) => readFileSync(file, 'utf8');
const layout = read('frontend/src/components/Layout.tsx');
const block = layout.slice(layout.indexOf('const navItems = ['), layout.indexOf('];', layout.indexOf('const navItems = [')));
const items = [...block.matchAll(/\{ path: '([^']+)', label: '([^']+)', icon: (\w+)(, adminOnly: true)? \}/g)]
  .map(([, path, label, icon, admin]) => ({ path, label, icon, adminOnly: !!admin }));

const expected = [
  { path: '/dashboard', label: 'Início', icon: 'House', adminOnly: false },
  { path: '/trips', label: 'Viagens', icon: 'Plane', adminOnly: false },
  { path: '/visits', label: 'Destinos visitados', icon: 'MapPinned', adminOnly: false },
  { path: '/leads', label: 'Interessados', icon: 'UsersRound', adminOnly: true },
  { path: '/reservations', label: 'Reservas', icon: 'Ticket', adminOnly: true },
  { path: '/gallery', label: 'Galeria de memórias', icon: 'Images', adminOnly: false },
  { path: '/settings', label: 'Configurações', icon: 'SettingsIcon', adminOnly: true },
  { path: '/system', label: 'Saúde do servidor', icon: 'Activity', adminOnly: true },
];

// Tela de cada rota; o Início tem cabeçalho próprio ("Visão geral"), fora do PageHeader.
const pages: Record<string, string> = {
  '/trips': 'Trips', '/visits': 'Visits', '/leads': 'Leads', '/reservations': 'Reservations',
  '/gallery': 'Gallery', '/settings': 'Settings', '/system': 'SystemHealth',
};

describe('menu lateral do painel', () => {
  it('tem os nomes, ícones, rotas e permissões combinados', () => {
    expect(items).toEqual(expected);
  });

  it('cada item tem um ícone diferente', () => {
    expect(new Set(items.map((item) => item.icon)).size).toBe(items.length);
  });

  it('não volta aos nomes antigos', () => {
    expect(block).not.toMatch(/label: '(Próxima trip|Servidor|Visitas|Galeria)'/);
    expect(block).not.toMatch(/icon: (Home|MapPin|ImageIcon)\b/);
  });

  it('ícones são decorativos; o nome do item é o texto do link', () => {
    expect(layout).toContain('<Icon className="w-5 h-5 shrink-0" aria-hidden="true" />');
    expect(layout).toContain('<NavLink');
    expect(layout).not.toMatch(/<NavLink[^>]*aria-label/);
  });

  it('o título de cada tela é o mesmo nome do menu', () => {
    for (const { path, label } of items) {
      if (path === '/dashboard') continue;
      expect(read(`frontend/src/pages/${pages[path]}.tsx`), path).toContain(`title="${label}"`);
    }
  });

  it('nenhuma tela usa os títulos antigos', () => {
    expect(read('frontend/src/pages/Trips.tsx')).not.toContain('Próxima trip');
    expect(read('frontend/src/pages/SystemHealth.tsx')).not.toContain('title="Servidor"');
  });

  it('o atalho da galeria no Início usa o mesmo ícone do menu', () => {
    expect(read('frontend/src/pages/Dashboard.tsx')).toContain("{ to: '/gallery', icon: Images,");
  });
});
