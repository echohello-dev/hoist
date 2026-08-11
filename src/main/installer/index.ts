import { spawn } from 'node:child_process'
import { access, chmod, constants, mkdir, unlink, writeFile } from 'node:fs/promises'
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
    // Fall back to hoist-managed bin, then npm global bin
    const candidates: string[] = [join(hoistBinDir(), binary)]
    try {
      const root = await npmGlobalRoot()
      const prefix = dirname(root) // <prefix>/lib/node_modules -> <prefix>
      candidates.push(process.platform === 'win32' ? join(prefix, binary) : join(prefix, 'bin', binary))
    } catch {
      // ignore
    }
    for (const path of candidates) {
      try {
        await access(path, constants.X_OK)
        return path
      } catch {
        // try next
      }
    }
    return null
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

function hoistBinDir(): string {
  return join(homedir(), '.local', 'share', 'hoist', 'bin')
}

async function installFromDownload(
  spec: ToolInstallSpec,
  url: string,
  onProgress?: (p: InstallProgress) => void,
): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Invalid download URL: ${url}`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Download URL must be http(s): ${url}`)
  }

  const binDir = hoistBinDir()
  await mkdir(binDir, { recursive: true })
  // Stable binary name matching the tool id for discovery via resolveBinaryPath.
  const target = join(binDir, spec.id)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    if (!res.ok) {
      throw new Error(`Download failed: HTTP ${res.status}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    await writeFile(target, buf, { mode: 0o755 })
    await chmod(target, 0o755)
    onProgress?.({ phase: 'spawning', message: `Saved binary to ${target}`, tool: spec })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('abort')) throw new Error('Download timed out after 5 minutes')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export interface InstallProgress {
  phase: 'resolving' | 'spawning' | 'done' | 'error'
  message: string
  tool?: ToolInstallSpec
}

export interface InstallOptions {
  /** Pin a specific version when the method supports it (npm package@version). */
  version?: string
  /** Prefer a specific install method type. */
  prefer?: ToolInstallMethod['type']
  /** Force reinstall / upgrade. */
  force?: boolean
}

export async function installHarness(
  spec: ToolInstallSpec,
  onProgress?: (p: InstallProgress) => void,
  opts: InstallOptions = {},
): Promise<InstalledTool> {
  const method =
    (opts.prefer ? spec.installMethods.find((m) => m.type === opts.prefer) : undefined)
    ?? spec.installMethods[0]
  if (!method) throw new Error(`No install method defined for ${spec.id}`)
  onProgress?.({ phase: 'resolving', message: `Resolving ${method.type} install for ${spec.name}…`, tool: spec })

  if (method.type === 'npm') {
    const pkg = opts.version ? `${method.package}@${opts.version}` : method.package
    const args = ['install', '-g', pkg]
    if (opts.force) args.push('--force')
    onProgress?.({ phase: 'spawning', message: `npm install -g ${pkg}`, tool: spec })
    const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const result = await run(npmBin, args, { timeout: 5 * 60 * 1000 })
    if (result.code !== 0) {
      onProgress?.({ phase: 'error', message: result.stderr.trim() || `npm exited ${result.code}`, tool: spec })
      throw new Error(`npm install failed: ${result.stderr.trim() || result.code}`)
    }
  } else if (method.type === 'brew') {
    const token = method.formula
    const caskProbe = await run('brew', ['info', '--json=v2', '--cask', token], { timeout: 15_000 }).catch(() => null)
    const isCask = Boolean(caskProbe && caskProbe.code === 0 && /"token"\s*:/.test(caskProbe.stdout))
    let brewArgs: string[]
    if (opts.force) {
      brewArgs = isCask ? ['reinstall', '--cask', token] : ['reinstall', token]
    } else {
      const listArgs = isCask ? ['list', '--cask', token] : ['list', token]
      const listed = await run('brew', listArgs, { timeout: 15_000 }).catch(() => null)
      if (listed && listed.code === 0) {
        brewArgs = isCask ? ['upgrade', '--cask', token] : ['upgrade', token]
      } else {
        brewArgs = isCask ? ['install', '--cask', token] : ['install', token]
      }
    }
    onProgress?.({ phase: 'spawning', message: `brew ${brewArgs.join(' ')}`, tool: spec })
    const result = await run('brew', brewArgs, { timeout: 5 * 60 * 1000 })
    if (result.code !== 0) {
      onProgress?.({ phase: 'error', message: result.stderr.trim() || `brew exited ${result.code}`, tool: spec })
      throw new Error(`brew install failed: ${result.stderr.trim() || result.code}`)
    }
  } else if (method.type === 'script') {
    onProgress?.({ phase: 'spawning', message: `Running install script for ${spec.name}…`, tool: spec })
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
    const shellArgs = process.platform === 'win32' ? ['/d', '/s', '/c', method.command] : ['-c', method.command]
    const result = await run(shell, shellArgs, { timeout: 10 * 60 * 1000 })
    if (result.code !== 0) {
      onProgress?.({ phase: 'error', message: result.stderr.trim() || `script exited ${result.code}`, tool: spec })
      throw new Error(`script install failed: ${result.stderr.trim() || result.stdout.trim() || result.code}`)
    }
  } else if (method.type === 'download') {
    onProgress?.({ phase: 'spawning', message: `Downloading ${method.url}…`, tool: spec })
    await installFromDownload(spec, method.url, onProgress)
  } else {
    const exhaustive: never = method
    throw new Error(`Install method "${(exhaustive as ToolInstallMethod).type}" not implemented yet`)
  }

  onProgress?.({ phase: 'done', message: `Installed ${spec.name}`, tool: spec })
  return discoverInstalled(spec)
}

export interface UninstallOptions {
  prefer?: ToolInstallMethod['type']
}

export async function uninstallHarness(
  spec: ToolInstallSpec,
  opts: UninstallOptions = {},
): Promise<{ ok: boolean; message: string }> {
  const methods = opts.prefer
    ? spec.installMethods.filter((m) => m.type === opts.prefer)
    : spec.installMethods

  const errors: string[] = []
  for (const method of methods) {
    try {
      if (method.type === 'npm') {
        const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
        const result = await run(npmBin, ['uninstall', '-g', method.package], { timeout: 3 * 60 * 1000 })
        if (result.code === 0) {
          return { ok: true, message: `Uninstalled ${method.package} via npm` }
        }
        errors.push(result.stderr.trim() || `npm uninstall exited ${result.code}`)
      } else if (method.type === 'brew') {
        const token = method.formula
        const caskProbe = await run('brew', ['info', '--json=v2', '--cask', token], { timeout: 15_000 }).catch(() => null)
        const isCask = Boolean(caskProbe && caskProbe.code === 0 && /"token"\s*:/.test(caskProbe.stdout))
        const args = isCask ? ['uninstall', '--cask', token] : ['uninstall', token]
        const result = await run('brew', args, { timeout: 3 * 60 * 1000 })
        if (result.code === 0) {
          return { ok: true, message: `Uninstalled ${token} via brew` }
        }
        errors.push(result.stderr.trim() || `brew uninstall exited ${result.code}`)
      } else if (method.type === 'download') {
        const target = join(hoistBinDir(), spec.id)
        try {
          await unlink(target)
          return { ok: true, message: `Removed ${target}` }
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err))
        }
      } else if (method.type === 'script') {
        errors.push('Script installs have no automatic uninstall; remove the binary manually')
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  return { ok: false, message: errors.join('; ') || 'No uninstall method succeeded' }
}

export async function discoverAll(specs: ToolInstallSpec[]): Promise<DiscoverResult[]> {
  return Promise.all(specs.map(discoverInstalled))
}

export function userBinDirHint(): string {
  return join(homedir(), 'npm-global', 'bin')
}
