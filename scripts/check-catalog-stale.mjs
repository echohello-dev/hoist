#!/usr/bin/env -S node --no-warnings
// Verify that src/main/.../catalog.generated.ts is in sync with the JSON
// sources. Exits non-zero with a diff hint if the catalog sources change
// without running `npm run gen:catalog`. Part of CI.
//
// Reads the same JSON sources the generator does and runs the build helper
// from gen-catalog.mjs. Compares byte-by-byte against the on-disk file.
'use strict'

import { readFile } from 'node:fs/promises'
import { buildForSource, SOURCES } from './gen-catalog.mjs'

let stale = 0
for (const source of SOURCES) {
  let onDisk
  try {
    onDisk = await readFile(source.out, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      stale++
      console.error(`✗ ${source.out}`)
      console.error(`    catalog.generated.ts is missing. Run: npm run gen:catalog`)
      continue
    }
    throw err
  }
  const { body: expected } = await buildForSource(source)
  if (onDisk !== expected) {
    stale++
    console.error(`✗ ${source.out}`)
    console.error(`    catalog.generated.ts is stale vs ${source.heading}.`)
    console.error(`    Run:  npm run gen:catalog`)
  } else {
    console.log(`✓ ${source.out.replace(process.cwd() + '/', '')}`)
  }
}

if (stale > 0) {
  console.error(`\n${stale} catalog(s) out of date.`)
  process.exit(1)
}
console.log('\nall catalog.generated.ts files are in sync with their sources')
