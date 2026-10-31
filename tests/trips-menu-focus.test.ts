import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Teste de código-fonte: o menu "Mais opções" deve devolver o foco ao botão que o abriu.
const trips = readFileSync('frontend/src/pages/Trips.tsx', 'utf8');

const bodyOf = (name: string) => {
  const start = trips.indexOf(name);
  const end = trips.indexOf('\n  };', start);
  return trips.slice(start, end);
};

describe('foco do menu Mais opções em Trips.tsx', () => {
  it('scroll e resize fecham o menu devolvendo o foco ao botão', () => {
    const effect = trips.slice(trips.indexOf("window.addEventListener('scroll'"), trips.indexOf("window.removeEventListener('resize'"));
    expect(effect).not.toMatch(/closeMenu\b(?!AndRefocusTrigger)/);
    expect(effect).toContain('closeMenuAndRefocusTrigger');
  });

  it('exclusão cancelada devolve o foco ao botão', () => {
    const handler = bodyOf('const handleDelete');
    expect(handler).toMatch(/if \(!confirm\([^]*?\)\) \{\s*closeMenuAndRefocusTrigger\(\);\s*return;\s*\}/);
  });

  it('o foco é devolvido sem rolar a página', () => {
    expect(bodyOf('const closeMenuAndRefocusTrigger')).toContain('preventScroll: true');
  });
});
