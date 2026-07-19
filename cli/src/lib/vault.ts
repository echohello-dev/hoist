import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, chmod, stat } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { dirname, join } from 'node:path'

export const SERVICE = 'com.echohello.hoist'

export function configDir(): string {
  const env = process.env.HOIST_CONFIG_DIR ?? process.env.XDG_CONFIG_HOME
  if (env) return env
  const home = homedir()
  if (process.platform === 'darwin') return join(home, 'Library', 'Application Support', 'Hoist')
  if (process.platform === 'win32') return join(home, 'AppData', 'Roaming', 'Hoist')
  return join(home, '.config', 'hoist')
}

function run(cmd: string, args: string[], opts: { stdin?: string; timeout?: number } = {}): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
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
    if (opts.stdin !== undefined) {
      child.stdin.end(opts.stdin)
    }
  })
}

async function fileFallbackPath(): Promise<string> {
  const dir = join(configDir(), 'secrets')
  await mkdir(dir, { recursive: true })
  return join(dir, 'vault.json')
}

async function readFallbackVault(): Promise<Record<string, { label?: string; value: string; updatedAt: string }>> {
  try {
    const blob = await readFile(await fileFallbackPath(), 'utf8')
    return JSON.parse(blob)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
}

async function writeFallbackVault(data: Record<string, unknown>): Promise<void> {
  const path = await fileFallbackPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600 })
  try {
    await chmod(path, 0o600)
  } catch {
    // Windows: chmod is a no-op.
  }
}

async function useKeychain(): Promise<boolean> {
  if (process.platform === 'darwin') return true
  // Linux libsecret and Windows DPAPI paths can be added later.
  return false
}

export async function getSecret(id: string): Promise<string | null> {
  if (await useKeychain()) {
    try {
      const { stdout, code } = await run('security', ['find-generic-password', '-s', SERVICE, '-a', id, '-w'])
      if (code === 0) return stdout.trim()
      return null
    } catch {
      return null
    }
  }
  const vault = await readFallbackVault()
  return vault[id]?.value ?? null
}

export async function setSecret(id: string, value: string, label?: string): Promise<void> {
  if (await useKeychain()) {
    // Delete first (ignore errors), then add.
    await run('security', ['delete-generic-password', '-s', SERVICE, '-a', id]).catch(() => null)
    const { code, stderr } = await run('security', ['add-generic-password', '-s', SERVICE, '-a', id, '-w', value, '-U'])
    if (code !== 0) throw new Error(`security add failed: ${stderr}`)
    return
  }
  const vault = await readFallbackVault()
  vault[id] = { value, label, updatedAt: new Date().toISOString() }
  await writeFallbackVault(vault)
}

export async function deleteSecret(id: string): Promise<boolean> {
  if (await useKeychain()) {
    const { code } = await run('security', ['delete-generic-password', '-s', SERVICE, '-a', id])
    return code === 0
  }
  const vault = await readFallbackVault()
  if (!vault[id]) return false
  delete vault[id]
  await writeFallbackVault(vault)
  return true
}

export async function listSecrets(): Promise<{ id: string; label?: string; updatedAt?: string }[]> {
  if (await useKeychain()) {
    const { stdout, code } = await run('security', ['dump-keychain'])
    if (code !== 0) return []
    const entries: { id: string }[] = []
    const lines = stdout.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const svMatch = /"svce"<blob>="([^"]+)"/.exec(line)
      const acctMatch = /"acct"<blob>="([^"]+)"/.exec(line)
      if (svMatch && acctMatch && svMatch[1] === SERVICE) {
        entries.push({ id: acctMatch[1] })
      }
    }
    return entries
  }
  const vault = await readFallbackVault()
  return Object.entries(vault).map(([id, record]) => ({
    id,
    label: record.label,
    updatedAt: record.updatedAt,
  }))
}

export async function configPath(): Promise<string> {
  const dir = configDir()
  await mkdir(dir, { recursive: true })
  return join(dir, 'config.json')
}

export interface HoistConfig {
  gateway?: { baseUrl?: string; provider?: string }
  providers?: Record<string, { baseUrl?: string; label?: string }>
}

export async function readConfig(): Promise<HoistConfig> {
  try {
    const path = await configPath()
    await stat(path)
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return {}
  }
}

export async function writeConfig(config: HoistConfig): Promise<void> {
  const path = await configPath()
  await writeFile(path, JSON.stringify(config, null, 2), { mode: 0o600 })
  try {
    await chmod(path, 0o600)
  } catch {
    // Windows.
  }
}

export function secretIdFor(providerId: string): string {
  return `provider:${providerId}:api_key`
}

export function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 8) return '…'
  const head = value.startsWith('sk-') ? value.slice(0, 6) : value.slice(0, 2)
  return `${head}…${value.slice(-4)}`
}

export { platform }
