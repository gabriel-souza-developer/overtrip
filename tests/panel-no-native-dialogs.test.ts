import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Nenhuma tela do painel usa confirm()/alert() do navegador: ações com efeito pedem confirmação em janela própria.
const dir = 'frontend/src/pages';
describe('telas do painel', () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
    it(`${file} não usa confirm() nem alert()`, () => {
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src).not.toMatch(/\bconfirm\(/);
      expect(src).not.toMatch(/\balert\(/);
    });
  }
});
