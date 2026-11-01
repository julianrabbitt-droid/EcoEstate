import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    // The API server (server/index.js) runs alongside Vite in development.
    proxy: { '/api': `http://localhost:${process.env.API_PORT || 3001}` },
  },
});
