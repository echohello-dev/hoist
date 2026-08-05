#!/usr/bin/env -S node --no-warnings
// Bundle the Electron preload script into a single file so it survives the
// sandboxed require() restrictions in modern Electron. Vite already bundles
// the renderer; we mirror that for the preload with esbuild.
'use strict'

import { build } from 'esbuild'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

await build({
  entryPoints: [resolve(ROOT, 'src/preload/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: resolve(ROOT, 'dist/preload/index.js'),
  sourcemap: true,
  // Electron's preload runs in a sandboxed context that doesn't honor
  // node_modules `exports` resolution. Mark everything external so we
  // get plain `require('electron')` (which Electron's sandbox does provide).
  external: ['electron'],
  logLevel: 'info',
})
console.log('✓ preload bundled')