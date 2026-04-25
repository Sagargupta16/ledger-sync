import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// https://vite.dev/config/
const isGitHubPages = process.env.GITHUB_PAGES === 'true'

export default defineConfig({
  // GitHub Pages / custom domain serves from /ledger-sync/ subpath; local dev uses root
  base: isGitHubPages ? '/ledger-sync/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Ledger Sync',
        short_name: 'Ledger',
        description:
          'Self-hosted personal finance dashboard -- analytics, budgeting, and tax planning.',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        orientation: 'portrait',
        // start_url is relative to Vite's `base`, so it resolves to /ledger-sync/ on GH Pages.
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell only: precache JS/CSS/HTML/SVG/PNG emitted by Vite.
        // API responses are intentionally NOT cached -- financial data must be fresh.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        // Don't let the SW intercept /api/* -- always hit the network.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: {
        // Disabled in dev to avoid caching interfering with HMR.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Never ship source maps to production — exposes original source (CWE-615)
    sourcemap: false,
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
