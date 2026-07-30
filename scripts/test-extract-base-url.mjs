#!/usr/bin/env node
// Smoke tests for the clipboard URL extraction regex in src/renderer/App.tsx.
// We can't run TypeScript natively with the app's webpack config, so we
// re-implement the function here verbatim and assert against the same cases.
'use strict'

/**
 * Mirror of `extractBaseUrl` in src/renderer/App.tsx — keep in sync.
 */
function extractBaseUrl(text) {
  const trimmed = text.trim()
  const m = trimmed.match(/^https?:\/\/[^\s/?#]+/i)
  if (!m) return null
  return m[0].replace(/\/+$/, '')
}

const cases = [
  ['https://gateway.acme.com', 'https://gateway.acme.com'],
  ['http://localhost:4000/', 'http://localhost:4000'],
  ['https://gateway.ai.cloudflare.com/v1/<account_id>', 'https://gateway.ai.cloudflare.com'],
  ['\n  https://api.example.com/v1  \n', 'https://api.example.com'],
  ['mailto:nope@example.com', null],
  ['', null],
  ['https://', null],
  ['api.example.com', null],
  ['https://example.com/with/path', 'https://example.com'],
  ['https://en.wikipedia.org/wiki/Claude_(language_model)', 'https://en.wikipedia.org'],
]

let failed = 0
for (const [input, expected] of cases) {
  const got = extractBaseUrl(input)
  if (got === expected) {
    console.log(`  ✓ ${JSON.stringify(input).slice(0, 60)} → ${JSON.stringify(got)}`)
  } else {
    failed++
    console.error(
      `  ✗ ${JSON.stringify(input)}:\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(got)}`,
    )
  }
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed`)
  process.exit(1)
}
console.log('\nall clipboard url extraction cases passed')
