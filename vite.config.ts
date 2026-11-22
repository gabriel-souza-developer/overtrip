import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { serveRootAssets } from './vite-root-assets';

export default defineConfig(({ command }) => ({
  // Painel publicado em /admin; no dev continua na raiz.
  base: command === 'build' ? '/admin/' : '/',
  root: path.resolve(__dirname, 'frontend'),
  plugins: [react(), serveRootAssets()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend/src'),
    },
  },
  server: {
    port: 3100,
    strictPort: true,
    proxy: {
      // E2E_API_PORT: só para e2e/organization-visit-gallery-real-api.spec.ts
      // (API real isolada, porta própria para nunca colidir com um `npm run
      // dev` já rodando na 3001). Sem a variável, comportamento igual a sempre.
      '/api': {
        target: `http://localhost:${process.env.E2E_API_PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist/frontend',
    emptyOutDir: true,
  },
}));
