import { defineConfig } from 'vite';
import path from 'path';

// Serve the static public website beside the admin Vite app during development.
export default defineConfig({
  root: path.resolve(__dirname),
  server: {
    port: 3200,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
