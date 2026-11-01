import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Teste de código-fonte: o menu "Mais opções" usa o menu do Radix, que já devolve o foco ao
// botão que o abriu, fecha com Esc e abre por cima da tabela (sem corte pela rolagem).
const trips = readFileSync('frontend/src/pages/Trips.tsx', 'utf8');
const rowMenu = readFileSync('frontend/src/components/RowMenu.tsx', 'utf8');

describe('menu Mais opções das viagens', () => {
  it('a lista de viagens usa o RowMenu compartilhado', () => {
    expect(trips).toContain("import RowMenu from '../components/RowMenu'");
    expect(trips).toContain('<RowMenu');
  });

  it('o RowMenu é o menu acessível do Radix, aberto em portal', () => {
    expect(rowMenu).toContain("@radix-ui/react-dropdown-menu");
    expect(rowMenu).toContain('Menu.Portal');
    expect(rowMenu).toContain('aria-label={label}');
  });

  it('excluir pede confirmação em janela, nunca com confirm() do navegador', () => {
    expect(trips).toContain('<ConfirmDialog');
    expect(trips).not.toMatch(/\bconfirm\(/);
    expect(trips).not.toMatch(/\balert\(/);
  });
});
