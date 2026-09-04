// `npm run sim [games]` — prints the balance report from src/engine/sim/report.ts.
//
// The engine is TypeScript with extensionless imports, which Node will not run
// directly, so the report is bundled with rolldown (Vite's bundler, already
// installed) into a temporary file and imported from there.
import { build } from 'rolldown'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = await mkdtemp(join(tmpdir(), 'omerta-sim-'))
try {
  const out = join(dir, 'report.mjs')
  await build({
    input: 'src/engine/sim/report.ts',
    platform: 'node',
    output: { file: out, format: 'esm' },
    logLevel: 'silent',
  })
  const { main } = await import(pathToFileURL(out).href)
  console.log(main(process.argv.slice(2)))
} finally {
  await rm(dir, { recursive: true, force: true })
}
