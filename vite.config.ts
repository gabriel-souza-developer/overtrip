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
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist/frontend',
    emptyOutDir: true,
  },
}));
