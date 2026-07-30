#!/usr/bin/env -S node --no-warnings
'use strict'

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

export const SOURCES = [
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

/**
 * Stable JSON: sort the entries array by `id` and stringify with deterministic
 * key ordering. The hash fingerprint is for cheap CI checks — `git diff`
 * still shows every change.
 */
function stableStringify(entries) {
  const sorted = [...entries].sort((a, b) => {
    const idA = String(a.id ?? '')
    const idB = String(b.id ?? '')
    if (idA < idB) return -1
    if (idA > idB) return 1
    return 0
  })
  const sortKeys = (v) => {
    if (Array.isArray(v)) return v.map(sortKeys)
    if (v && typeof v === 'object') {
      const out = {}
      for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k])
      return out
    }
    return v
  }
  return JSON.stringify(sortKeys(sorted))
}

function fingerprint(entries) {
  const json = stableStringify(entries)
  return createHash('sha256').update(json).digest('hex').slice(0, 16)
}

export async function buildForSource(source) {
  const raw = await readFile(source.src, 'utf8')
  const parsed = JSON.parse(raw)
  const entries = parsed[source.collection]
  const fp = fingerprint(entries)
  const header = `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * To add or modify entries, edit:
 *   ${source.heading}
 * and run \`npm run gen:catalog\`.
 *
 * fingerprint: ${fp}  (entries: ${entries.length})
 */

import type { ${source.type} } from './types'

export const ${source.name}: readonly ${source.type}[] =
${jsonToTs(entries, 2)} as const
`
  return { body: header, entries, fingerprint: fp }
}

export async function writeSource(source) {
  const { body } = await buildForSource(source)
  await writeFile(source.out, body, 'utf8')
  console.log(`✓ ${source.out.replace(ROOT + '/', '')}  (${(await readFile(source.src, 'utf8')).length} bytes source)`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const s of SOURCES) {
    await writeSource(s)
  }
}
