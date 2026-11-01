import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Raiz do repositório: o vite.config.ts usa root "frontend" (painel React),
// o que fazia `npm test` procurar testes no lugar errado.
export default defineConfig({
  test: {
    root: __dirname,
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Banco isolado (prisma/test.db), recriado a cada execução; nunca usa prisma/dev.db.
    globalSetup: ['tests/setup/global-db.ts'],
    env: { DATABASE_URL: `file:${resolve(__dirname, 'prisma/test.db')}` },
    // Todos os arquivos que usam Prisma compartilham o mesmo SQLite: roda um arquivo por vez.
    fileParallelism: false,
  },
});
