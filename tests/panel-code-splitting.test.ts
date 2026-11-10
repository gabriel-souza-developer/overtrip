import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Teste de código-fonte: cada página do painel é carregada sob demanda, para
// que o login e o início não baixem o formulário de viagem, a galeria etc.
const app = readFileSync('frontend/src/App.tsx', 'utf8');
const layout = readFileSync('frontend/src/components/Layout.tsx', 'utf8');

describe('divisão do painel por rota', () => {
  it.each(['Dashboard', 'Trips', 'TripForm', 'Visits', 'Gallery', 'Settings'])('%s é React.lazy e não import estático', (page) => {
    expect(app).toContain(`const ${page} = React.lazy(() => import('./pages/${page}'));`);
    expect(app).not.toMatch(new RegExp(`^import ${page} from`, 'm'));
  });

  it('o conteúdo da rota fica dentro de Suspense, com o menu já visível', () => {
    expect(layout).toMatch(/<React\.Suspense fallback=[\s\S]*?<Outlet \/>\s*<\/React\.Suspense>/);
  });
});
