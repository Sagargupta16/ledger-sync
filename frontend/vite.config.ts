import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { createHash } from 'node:crypto'
import path from 'node:path'

// https://vite.dev/config/
const isGitHubPages = process.env.GITHUB_PAGES === 'true'

/**
 * Content-Security-Policy meta for production builds (GitHub Pages cannot set
 * response headers). The theme and analytics bootstraps in index.html are
 * allowed by hash, computed from the final HTML so editing them can never
 * silently fall out of the policy. Browsers hash inline text after turning
 * CRLF into LF, so the hash does too.
 *
 * connect-src allows https: for the hosted API, Google Analytics, and the
 * browser-direct OpenAI/Anthropic chat providers. style-src needs
 * 'unsafe-inline' for the style attributes React, Recharts, and Motion write.
 */
function contentSecurityPolicy(): Plugin {
  let apiOrigin = ''
  return {
    name: 'ledger-sync-csp',
    apply: 'build',
    configResolved(config) {
      const apiBase = config.env.VITE_API_BASE_URL as string | undefined
      if (apiBase && /^https?:\/\//.test(apiBase)) apiOrigin = new URL(apiBase).origin
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const scriptHashes = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
          .map(([, body]) => body.replaceAll(/\r\n?/g, '\n'))
          .map((body) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`)
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${scriptHashes.join(' ')} https://www.googletagmanager.com`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data:",
          ["connect-src 'self' https:", ...(apiOrigin.startsWith('http:') ? [apiOrigin] : [])].join(' '),
          "worker-src 'self'",
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ')
        return html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        )
      },
    },
  }
}

export default defineConfig({
  // GitHub Pages / custom domain serves from /ledger-sync/ subpath; local dev uses root
  base: isGitHubPages ? '/ledger-sync/' : '/',
  plugins: [
    react(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Ledger Sync',
        short_name: 'Ledger',
        description:
          'Self-hosted personal finance dashboard -- analytics, budgeting, and tax planning.',
        theme_color: '#eaf0f7',
        background_color: '#eaf0f7',
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
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    // Never ship source maps to production -- exposes original source (CWE-615)
    sourcemap: false,
    rollupOptions: {
      // The eager shell imports Button/Spinner/PageHeader through the ui barrel.
      // Its modules are pure, so marking them side-effect free lets the build
      // leave unused chart modules (and recharts) out of the anonymous `/` load.
      treeshake: {
        moduleSideEffects: (id) => !/src[\\/]components[\\/]ui[\\/][^\\/]+\.tsx?$/.test(id),
      },
      output: {
        // Vite 8 (Rolldown) removed the object form of manualChunks; the
        // function form splits heavy vendor libs into their own cached chunks.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|react-router)\//.test(id)) return 'vendor-react'
          // clsx is shared by cn() and recharts; pin it so the eager shell does
          // not import it from (and modulepreload) vendor-recharts.
          if (/node_modules\/clsx\//.test(id)) return 'vendor-react'
          if (/node_modules\/recharts\//.test(id)) return 'vendor-recharts'
          if (/node_modules\/(motion|framer-motion)\//.test(id)) return 'vendor-motion'
          if (/node_modules\/@tanstack\/react-query\//.test(id)) return 'vendor-tanstack'
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
