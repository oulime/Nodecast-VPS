import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://nodecast.veloravip.net',
        changeOrigin: true,
        secure: false
      },
      '/proxy': {
        target: 'https://nodecast.veloravip.net',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: '../public-dist',
    emptyOutDir: true
  }
});
