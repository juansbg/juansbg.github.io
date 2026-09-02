import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// v3 is served from /beta/ until the Sprint 5 cutover, so that the existing
// v1 site keeps working at the site root while this is built. The deploy
// workflow assembles both into one artifact; see .github/workflows/deploy.yml.
export default defineConfig({
  base: '/beta/',
  plugins: [
    // The app must launch and run a whole game with no network: everything
    // the build emits is precached, and a new deploy takes over on the next
    // launch by itself. The scope is the base, so v1 at the root is untouched.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Omertà',
        short_name: 'Omertà',
        id: '/beta/',
        start_url: '/beta/',
        scope: '/beta/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000029',
        theme_color: '#000029',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  build: {
    outDir: 'dist/beta',
    emptyOutDir: true,
    target: 'es2022',
  },
  test: {
    // The engine is pure and has no DOM, so the default node environment is
    // correct. UI tests added later should opt in per-file.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
