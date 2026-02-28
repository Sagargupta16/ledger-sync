import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
const isProduction = process.env.GITHUB_PAGES === 'true' || process.env.NODE_ENV === 'production'

export default defineConfig({
  // Production (GitHub Pages / custom domain) serves from /ledger-sync/ subpath; dev uses root
  base: isProduction ? '/ledger-sync/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy vendor libs into their own cached chunks
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-recharts': ['recharts'],
          'vendor-motion': ['framer-motion'],
          'vendor-tanstack': ['@tanstack/react-query'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
