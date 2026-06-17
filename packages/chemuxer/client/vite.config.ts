import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  base: './',
  build: {
    outDir: '../dist/client',
    emptyDirBefore: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:7681',
      },
      '/ws': {
        target: 'http://localhost:7681',
        ws: true,
      },
    },
  },
});
