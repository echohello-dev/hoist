import { $ } from 'bun'

const targets = [
  { target: 'bun-darwin-arm64', out: 'hoist-darwin-arm64' },
  { target: 'bun-darwin-x64', out: 'hoist-darwin-x64' },
  { target: 'bun-linux-arm64', out: 'hoist-linux-arm64' },
  { target: 'bun-linux-x64', out: 'hoist-linux-x64' },
  { target: 'bun-windows-x64', out: 'hoist-windows-x64.exe' },
]

await $`mkdir -p dist`

for (const { target, out } of targets) {
  console.log(`→ building ${target}`)
  try {
    await $`bun build src/index.ts --compile --outfile=dist/${out} --target=${target}`.cwd(process.cwd())
  } catch (err) {
    console.error(`  ✗ ${target}: ${(err as Error).message}`)
  }
}

console.log('✓ done')
