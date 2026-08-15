import { mkdir } from 'node:fs/promises'

const targets = [
  { target: 'bun-darwin-arm64', output: 'hoist-darwin-arm64' },
  { target: 'bun-darwin-x64', output: 'hoist-darwin-x64' },
  { target: 'bun-linux-arm64', output: 'hoist-linux-arm64' },
  { target: 'bun-linux-x64', output: 'hoist-linux-x64' },
  { target: 'bun-windows-arm64', output: 'hoist-windows-arm64.exe' },
  { target: 'bun-windows-x64', output: 'hoist-windows-x64.exe' },
] as const

await mkdir('dist', { recursive: true })

for (const { target, output } of targets) {
  console.log(`Building ${target}`)
  const process = Bun.spawn(
    ['bun', 'build', 'src/index.ts', '--compile', `--outfile=dist/${output}`, `--target=${target}`],
    { stdout: 'inherit', stderr: 'inherit' },
  )

  const exitCode = await process.exited
  if (exitCode !== 0) throw new Error(`${target} build failed with exit code ${exitCode}`)
}
