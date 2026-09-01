import { defineConfig } from 'vitest/config'

// v3 is served from /beta/ until the Sprint 5 cutover, so that the existing
// v1 site keeps working at the site root while this is built. The deploy
// workflow assembles both into one artifact; see .github/workflows/deploy.yml.
export default defineConfig({
  base: '/beta/',
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
