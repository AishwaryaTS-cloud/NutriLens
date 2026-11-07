import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Read the single .env in the project root. Only variables prefixed VITE_ reach the browser.
  envDir: '..',
  server: {
    port: 5173,
    // In development the browser talks to Vite, which forwards /api to Express.
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
});
