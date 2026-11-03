import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  // Big libraries in chunks of their own, so a new deploy of the app doesn't
  // make returning visitors download three.js, maps, charts or sign-in again.
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('3d-tiles-renderer')) return 'tiles';
          if (/node_modules\/three\//.test(id)) return 'three';
          if (/leaflet/.test(id)) return 'maps';
          if (/recharts|d3-|victory-vendor/.test(id)) return 'charts';
          if (/@clerk/.test(id)) return 'auth';
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  server: {
    // The API server (server/index.js) runs alongside Vite in development.
    proxy: { '/api': `http://localhost:${process.env.API_PORT || 3001}` },
  },
});
