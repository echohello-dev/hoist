import { spawn } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import which from 'which'
export interface HarnessSpec {
  id: string
  name: string
  description: string
  installMethods: { type: 'npm'; package: string; binary: string }[]
}

export const HARNESS_CATALOG: HarnessSpec[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: "Anthropic's official agentic coding CLI.",
    installMethods: [{ type: 'npm', package: '@anthropic-ai/claude-code', binary: 'claude' }],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'Open-source AI coding agent with a TUI.',
    installMethods: [{ type: 'npm', package: 'opencode-ai', binary: 'opencode' }],
  },
  {
    id: 'codex',
    name: 'Codex',
    description: "OpenAI's terminal coding agent.",
    installMethods: [{ type: 'npm', package: '@openai/codex', binary: 'codex' }],
  },
]

function run(cmd: string, args: string[], opts: { timeout?: number } = {}): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const out: Buffer[] = []
    const err: Buffer[] = []
    let timer: NodeJS.Timeout | undefined
    if (opts.timeout) {
      timer = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error(`timed out after ${opts.timeout}ms`))
      }, opts.timeout)
    }
    child.stdout.on('data', (c: Buffer) => out.push(c))
    child.stderr.on('data', (c: Buffer) => err.push(c))
    child.on('error', reject)
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      resolve({ stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), code: code ?? -1 })
    })
  })
}

async function npmRoot(): Promise<string> {
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const { stdout } = await run(npmBin, ['root', '-g'], { timeout: 10_000 })
  return stdout.trim()
}

async function resolveBinary(binary: string): Promise<string | null> {
  try {
    return await which(binary)
  } catch {
    try {
      const root = await npmRoot()
      const candidate = process.platform === 'win32' ? dirname(root) : join(dirname(root), 'bin')
      const path = join(candidate, binary)
      try {
        await access(path, constants.X_OK)
        return path
      } catch {
        return null
      }
    } catch {
      return null
    }
  }
}

async function readVersion(path: string): Promise<string | null> {
  try {
    const { stdout, code } = await run(path, ['--version'], { timeout: 10_000 })
    if (code !== 0) return null
    return stdout.trim().split('\n')[0] || null
  } catch {
    return null
  }
}

export interface DiscoveredHarness {
  spec: HarnessSpec
  installed: boolean
  path: string | null
  version: string | null
}

export async function discoverHarness(spec: HarnessSpec): Promise<DiscoveredHarness> {
  for (const method of spec.installMethods) {
    const path = await resolveBinary(method.binary)
    if (path) {
      return { spec, installed: true, path, version: await readVersion(path) }
    }
  }
  return { spec, installed: false, path: null, version: null }
}

export async function discoverAll(): Promise<DiscoveredHarness[]> {
  return Promise.all(HARNESS_CATALOG.map(discoverHarness))
}

export async function installHarness(spec: HarnessSpec): Promise<DiscoveredHarness> {
  const method = spec.installMethods[0]
  if (!method) throw new Error(`No install method for ${spec.id}`)
  if (method.type !== 'npm') throw new Error(`Install method "${method.type}" not supported in CLI yet`)

  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = await run(npmBin, ['install', '-g', method.package], { timeout: 5 * 60 * 1000 })
  if (result.code !== 0) {
    throw new Error(`npm install -g ${method.package} failed:\n${result.stderr || result.stdout}`)
  }
  return discoverHarness(spec)
}

export function findHarness(id: string): HarnessSpec | undefined {
  return HARNESS_CATALOG.find((h) => h.id === id)
}
