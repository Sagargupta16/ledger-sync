import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

/**
 * PWA icons for Ledger Sync.
 *
 * The minimal-2023 preset renders the apple-touch icon with ~12% inner
 * padding and a white background. On iOS home screens that reads as a
 * small card with whitespace around the glyph -- it does NOT look like
 * a native app. We override the apple transform to be full-bleed so our
 * gradient paints edge-to-edge; iOS applies its own squircle mask on top.
 */
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent },
    maskable: { ...minimal2023Preset.maskable },
    apple: {
      sizes: [180],
      padding: 0,
      resizeOptions: { fit: 'contain', background: 'transparent' },
    },
  },
  images: ['public/pwa-icon-source.svg'],
})
