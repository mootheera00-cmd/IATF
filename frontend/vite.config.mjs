// vite.config.mjs
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const planApiKey = process.env.PLAN_API_KEY || ''

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json']
  },
  // Prevent Vite from trying to bundle/watch the large pdfjs worker file
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Exclude the huge pdf.worker file from the file watcher — it causes
    // Vite's watcher to exhaust memory and kill the dev server
    watch: {
      ignored: ['**/public/pdf.worker.min.mjs'],
    },
    proxy: {
      // Plan HUB API — unique prefix, no conflict with main /api
      '/plan-hub-api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        headers: planApiKey ? { 'X-API-Key': planApiKey } : undefined,
      },
      // Plan HUB static + index
      '/plan-hub': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/plan-hub/, '') || '/',
      },
      // Plan PT API — unique prefix, no conflict with main /api
      '/plan-pt-api': {
        target: 'http://127.0.0.1:4019',
        changeOrigin: true,
        secure: false,
        headers: planApiKey ? { 'X-API-Key': planApiKey } : undefined,
      },
      // Plan PT static + index
      '/plan-pt': {
        target: 'http://127.0.0.1:4019',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/plan-pt/, '') || '/',
      },
      // Main backend
      '/api': {
        target: 'http://127.0.0.1:4550',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Keep pdfjs in its own chunk so it doesn't bloat the main bundle
        manualChunks: {
          pdfjs: ['pdfjs-dist'],
        },
      },
    },
  },
})