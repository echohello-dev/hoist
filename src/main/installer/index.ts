import { spawn } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import which from 'which'
import type { InstalledTool, ToolInstallMethod, ToolInstallSpec } from '../../shared/types'

const NPM_GLOBAL_ROOT_TIMEOUT = 8000

function run(cmd: string, args: string[], opts: { cwd?: string; timeout?: number } = {}): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let timer: NodeJS.Timeout | undefined
    if (opts.timeout) {
      timer = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error(`timed out after ${opts.timeout}ms`))
      }, opts.timeout)
    }
    child.stdout.on('data', (c: Buffer) => stdoutChunks.push(c))
    child.stderr.on('data', (c: Buffer) => stderrChunks.push(c))
    child.on('error', reject)
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        code: code ?? -1,
      })
    })
  })
}

async function npmGlobalRoot(): Promise<string> {
  const { stdout } = await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], {
    timeout: NPM_GLOBAL_ROOT_TIMEOUT,
  })
  return stdout.trim()
}

async function resolveBinaryPath(binary: string): Promise<string | null> {
  try {
    return await which(binary)
  } catch {
    // Fall back to npm global bin
    try {
      const root = await npmGlobalRoot()
      const candidate = dirname(root) // <prefix>/lib/node_modules -> <prefix>
      const binDir = process.platform === 'win32' ? candidate : join(candidate, 'bin')
      const path = join(binDir, binary)
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

async function readVersion(binary: string, args: string[] = ['--version']): Promise<string | null> {
  try {
    const { stdout, code } = await run(binary, args, { timeout: NPM_GLOBAL_ROOT_TIMEOUT })
    if (code !== 0) return null
    return stdout.trim().split('\n')[0] || null
  } catch {
    return null
  }
}

export interface DiscoverResult extends InstalledTool {}

export async function discoverInstalled(spec: ToolInstallSpec): Promise<DiscoverResult> {
  for (const method of spec.installMethods) {
    const binary = binaryNameFor(method, spec.id)
    const path = await resolveBinaryPath(binary)
    if (path) {
      const version = await readVersion(path)
      return { spec, version, path, installMethod: method }
    }
  }
  return { spec, version: null, path: null, installMethod: null }
}

function binaryNameFor(method: ToolInstallMethod, fallback: string): string {
  switch (method.type) {
    case 'npm':
      return method.binary ?? fallback
    case 'brew':
      return method.formula
    case 'script':
    case 'download':
      return fallback
  }
}

export interface InstallProgress {
  phase: 'resolving' | 'spawning' | 'done' | 'error'
  message: string
  tool?: ToolInstallSpec
}

export async function installHarness(
  spec: ToolInstallSpec,
  onProgress?: (p: InstallProgress) => void,
): Promise<InstalledTool> {
  const method = spec.installMethods[0]
  if (!method) throw new Error(`No install method defined for ${spec.id}`)
  onProgress?.({ phase: 'resolving', message: `Resolving ${method.type} install for ${spec.name}…`, tool: spec })

  if (method.type === 'npm') {
    onProgress?.({ phase: 'spawning', message: `npm install -g ${method.package}`, tool: spec })
    const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const result = await run(npmBin, ['install', '-g', method.package], { timeout: 5 * 60 * 1000 })
    if (result.code !== 0) {
      onProgress?.({ phase: 'error', message: result.stderr.trim() || `npm exited ${result.code}`, tool: spec })
      throw new Error(`npm install failed: ${result.stderr.trim() || result.code}`)
    }
  } else if (method.type === 'brew') {
    onProgress?.({ phase: 'spawning', message: `brew install ${method.formula}`, tool: spec })
    const result = await run('brew', ['install', method.formula], { timeout: 5 * 60 * 1000 })
    if (result.code !== 0) {
      onProgress?.({ phase: 'error', message: result.stderr.trim() || `brew exited ${result.code}`, tool: spec })
      throw new Error(`brew install failed: ${result.stderr.trim() || result.code}`)
    }
  } else {
    throw new Error(`Install method "${method.type}" not implemented yet`)
  }

  onProgress?.({ phase: 'done', message: `Installed ${spec.name}`, tool: spec })
  return discoverInstalled(spec)
}

export async function discoverAll(specs: ToolInstallSpec[]): Promise<DiscoverResult[]> {
  return Promise.all(specs.map(discoverInstalled))
}

export function userBinDirHint(): string {
  return join(homedir(), 'npm-global', 'bin')
}
