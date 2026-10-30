import { defineConfig } from 'vitest/config';

// Raiz do repositório: o vite.config.ts usa root "frontend" (painel React),
// o que fazia `npm test` procurar testes no lugar errado.
export default defineConfig({
  test: {
    root: __dirname,
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
