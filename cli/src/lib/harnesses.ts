import { spawn } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import which from 'which'

export type InstallMethod =
  | { type: 'npm'; package: string; binary: string }
  | { type: 'brew'; formula: string; binary?: string }

export interface HarnessSpec {
  id: string
  name: string
  description: string
  installMethods: InstallMethod[]
}

export const HARNESS_CATALOG: HarnessSpec[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: "Anthropic's official agentic coding CLI.",
    installMethods: [
      { type: 'brew', formula: 'claude-code', binary: 'claude' },
      { type: 'npm', package: '@anthropic-ai/claude-code', binary: 'claude' },
    ],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'Open-source AI coding agent with a TUI.',
    installMethods: [
      { type: 'npm', package: 'opencode-ai', binary: 'opencode' },
      { type: 'brew', formula: 'opencode', binary: 'opencode' },
    ],
  },
  {
    id: 'codex',
    name: 'Codex',
    description: "OpenAI's terminal coding agent.",
    installMethods: [
      { type: 'brew', formula: 'codex', binary: 'codex' },
      { type: 'npm', package: '@openai/codex', binary: 'codex' },
    ],
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

function binaryFor(method: InstallMethod, fallback: string): string {
  if (method.type === 'npm') return method.binary
  return method.binary ?? fallback
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
    const path = await resolveBinary(binaryFor(method, spec.id))
    if (path) {
      return { spec, installed: true, path, version: await readVersion(path) }
    }
  }
  return { spec, installed: false, path: null, version: null }
}

export async function discoverAll(): Promise<DiscoveredHarness[]> {
  return Promise.all(HARNESS_CATALOG.map(discoverHarness))
}

export interface InstallOptions {
  prefer?: InstallMethod['type']
  version?: string
  force?: boolean
}

export async function installHarness(spec: HarnessSpec, opts: InstallOptions = {}): Promise<DiscoveredHarness> {
  const method =
    (opts.prefer ? spec.installMethods.find((m) => m.type === opts.prefer) : undefined)
    ?? spec.installMethods[0]
  if (!method) throw new Error(`No install method for ${spec.id}`)

  if (method.type === 'npm') {
    const pkg = opts.version ? `${method.package}@${opts.version}` : method.package
    const args = ['install', '-g', pkg]
    if (opts.force) args.push('--force')
    const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const result = await run(npmBin, args, { timeout: 5 * 60 * 1000 })
    if (result.code !== 0) {
      throw new Error(`npm install -g ${pkg} failed:\n${result.stderr || result.stdout}`)
    }
    return discoverHarness(spec)
  }

  if (method.type === 'brew') {
    const token = method.formula
    const caskProbe = await run('brew', ['info', '--json=v2', '--cask', token], { timeout: 15_000 }).catch(() => null)
    const isCask = Boolean(caskProbe && caskProbe.code === 0 && /"token"\s*:/.test(caskProbe.stdout))
    let brewArgs: string[]
    if (opts.force) {
      brewArgs = isCask ? ['reinstall', '--cask', token] : ['reinstall', token]
    } else {
      const listed = await run('brew', isCask ? ['list', '--cask', token] : ['list', token], { timeout: 15_000 }).catch(() => null)
      if (listed && listed.code === 0) {
        brewArgs = isCask ? ['upgrade', '--cask', token] : ['upgrade', token]
      } else {
        brewArgs = isCask ? ['install', '--cask', token] : ['install', token]
      }
    }
    const result = await run('brew', brewArgs, { timeout: 5 * 60 * 1000 })
    if (result.code !== 0) {
      throw new Error(`brew ${brewArgs.join(' ')} failed:\n${result.stderr || result.stdout}`)
    }
    return discoverHarness(spec)
  }

  throw new Error(`Install method not supported: ${(method as InstallMethod).type}`)
}

export function findHarness(id: string): HarnessSpec | undefined {
  return HARNESS_CATALOG.find((h) => h.id === id)
}
