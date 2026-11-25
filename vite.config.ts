import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { serveRootAssets } from './vite-root-assets';

export default defineConfig(({ command }) => ({
  // Turismo usa /admin; a plataforma isolada usa a raiz do seu próprio host.
  base: command === 'build' && process.env.VITE_PLATFORM_MODE !== 'true' ? '/admin/' : '/',
  root: path.resolve(__dirname, 'frontend'),
  plugins: [
    react(),
    serveRootAssets(),
    // Os testes de interface simulam as APIs. Uma rota esquecida não pode
    // alcançar a API de desenvolvimento nem modificar seus dados.
    ...(process.env.OVERTRIP_E2E_MOCKS === '1' ? [{
      name: 'block-unmocked-e2e-api',
      configureServer(server: import('vite').ViteDevServer) {
        server.middlewares.use('/api', (_req, res) => {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'API não simulada no teste.' }));
        });
      },
    }] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend/src'),
    },
  },
  server: {
    port: 3100,
    strictPort: true,
    proxy: {
      // Somente a suíte combinada usa a mesma sessão para dois servidores fictícios.
      ...(process.env.OVERTRIP_E2E_PLATFORM_TARGET ? {
        '/api/organizations': { target: process.env.OVERTRIP_E2E_PLATFORM_TARGET, changeOrigin: true },
        '/api/lodging': { target: process.env.OVERTRIP_E2E_PLATFORM_TARGET, changeOrigin: true },
      } : {}),
      '/api': {
        // PLATFORM_API_TARGET encaminha também login e sessão para a plataforma.
        // E2E_API_PORT: só para e2e/organization-visit-gallery-real-api.spec.ts
        // (API real isolada, porta própria para nunca colidir com um `npm run
        // dev` já rodando na 3001). Sem nenhuma variável, comportamento igual a sempre.
        target: process.env.PLATFORM_API_TARGET || process.env.OVERTRIP_E2E_API_TARGET || `http://localhost:${process.env.E2E_API_PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist/frontend',
    emptyOutDir: true,
  },
}));
