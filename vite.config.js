import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isWeb = process.env.VITE_WEB === '1' || process.env.VERCEL === '1';

export default defineConfig({
  plugins: [react()],
  base: isWeb ? '/' : './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
