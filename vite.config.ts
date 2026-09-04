import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// v3 is the site. It lived at /beta/ while v1 held the root; public/beta/
// now carries a redirect and a service worker that retires the old one, so
// a phone that installed the beta lands on the real thing.
export default defineConfig({
  base: '/',
  plugins: [
    // The app must launch and run a whole game with no network: everything
    // the build emits is precached, and a new deploy takes over on the next
    // launch by itself.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Omertà',
        short_name: 'Omertà',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // The table view is used on its side; every other screen is portrait
        // by layout, not by lock.
        orientation: 'any',
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
        // The beta's own files are not this app's shell; they retire it.
        globIgnores: ['beta/**'],
        navigateFallbackDenylist: [/^\/beta\//],
      },
    }),
  ],
  build: {
    target: 'es2022',
    // The TV is its own page: it never loads the narrator's handlers.
    rollupOptions: {
      input: {
        main: 'index.html',
        tv: 'tv.html',
      },
    },
  },
  test: {
    // The engine is pure and has no DOM, so the default node environment is
    // correct. UI tests added later should opt in per-file.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
