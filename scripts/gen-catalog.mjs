#!/usr/bin/env -S node --no-warnings
'use strict'

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SOURCES = [
  {
    src: resolve(ROOT, 'src/main/providers/catalog.source.json'),
    out: resolve(ROOT, 'src/main/providers/catalog.generated.ts'),
    type: 'ProviderEntry',
    name: 'PROVIDER_CATALOG',
    collection: 'providers',
    heading: 'src/main/providers/catalog.source.json',
  },
  {
    src: resolve(ROOT, 'src/main/gateways/catalog.source.json'),
    out: resolve(ROOT, 'src/main/gateways/catalog.generated.ts'),
    type: 'GatewayEntry',
    name: 'GATEWAY_CATALOG',
    collection: 'gateways',
    heading: 'src/main/gateways/catalog.source.json',
  },
]

function jsonToTs(value, indent = 2) {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const pad = ' '.repeat(indent)
    const inner = value.map((v) => `${pad}  ${jsonToTs(v, indent + 2)}`).join(',\n')
    return `[\n${inner}\n${pad}]`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) return '{}'
    const pad = ' '.repeat(indent)
    const inner = keys.map((k) => `${pad}  ${JSON.stringify(k)}: ${jsonToTs(value[k], indent + 2)}`).join(',\n')
    return `{\n${inner}\n${pad}}`
  }
  throw new Error(`Unsupported value type: ${typeof value}`)
}

async function generate(src, out, typeName, exportName, collection, heading) {
  const raw = await readFile(src, 'utf8')
  const parsed = JSON.parse(raw)
  const entries = parsed[collection]
  const header = `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * To add or modify entries, edit:
 *   ${heading}
 * and run \`npm run gen:catalog\`.
 */

import type { ${typeName} } from './types'

export const ${exportName}: readonly ${typeName}[] =
${jsonToTs(entries, 2)} as const
`
  await writeFile(out, header, 'utf8')
  console.log(`✓ ${out.replace(ROOT + '/', '')}  (${entries.length} entries)`)
}

for (const s of SOURCES) {
  await generate(s.src, s.out, s.type, s.name, s.collection, s.heading)
}
