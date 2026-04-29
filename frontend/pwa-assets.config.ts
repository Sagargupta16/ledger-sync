import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

/**
 * PWA icons for Ledger Sync.
 *
 * Why override the minimal-2023 preset's apple-touch transform:
 *   The default preset renders the apple-touch icon with ~12% inner padding
 *   and a white background. On iOS home screens that reads as a small
 *   "card" with a ring of whitespace around the glyph -- it does not look
 *   like a native app. We want the icon to be full-bleed so iOS's native
 *   squircle mask is the only rounding, and the gradient background paints
 *   edge-to-edge like Cash App / Apple Cash / any other finance app.
 *
 * Transparent PNG backgrounds would expose the home-screen wallpaper on
 * older iOS, so we keep the source SVG's gradient which paints 512x512
 * with `fill="url(#bg)"` -- solid blue-to-indigo, corner to corner.
 */
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: {
      ...minimal2023Preset.transparent,
    },
    maskable: {
      ...minimal2023Preset.maskable,
    },
    apple: {
      // padding: 0  -> icon fills the full 180x180 with no inner margin.
      // resizeOptions.background unset so the SVG's own gradient shows
      //  instead of a forced white frame.
      sizes: [180],
      padding: 0,
      resizeOptions: { fit: 'contain', background: 'transparent' },
    },
  },
  images: ['public/pwa-icon-source.svg'],
})
