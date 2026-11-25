import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Teste de código-fonte: a ordem do menu de operação do painel de agência
// precisa acompanhar a do OVERTRIP (Layout.tsx), senão quem usa os dois
// painéis se perde. "Configurações"/"Saúde do servidor"/"Usuários" ficam de
// fora da comparação: são administrativos, agrupados à parte em cada painel.
const read = (file: string) => readFileSync(file, 'utf8');

function extractPaths(source: string, start: string, end: string): string[] {
  const block = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
  return [...block.matchAll(/path: ['"]\/?([\w-]+)['"]/g)].map(([, path]) => path);
}

describe('ordem do menu de operação', () => {
  it('painel OVERTRIP e painel de agência listam as mesmas telas operacionais na mesma ordem', () => {
    const legacy = read('frontend/src/components/Layout.tsx');
    const legacyPaths = extractPaths(legacy, 'const navItems = [', '];').filter((p) => p !== 'settings' && p !== 'system' && p !== 'users');

    const org = read('frontend/src/pages/OrganizationLayout.tsx');
    const orgPaths = extractPaths(org, "label: 'Operação'", "label: 'Administração'");

    expect(orgPaths).toEqual(legacyPaths);
  });
});
