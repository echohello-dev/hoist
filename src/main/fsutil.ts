import { mkdir, readFile, writeFile, chmod, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Atomically write a JSON file at the given path. Writes to `<path>.tmp`
 * then renames over the target. On Linux/macOS also tightens perms to 0600.
 */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.tmp`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 })
  await rename(tmp, path)
  try {
    await chmod(path, 0o600)
  } catch {
    // Windows: chmod is a no-op.
  }
}

/** Atomically write a non-JSON text file. */
export async function writeTextAtomic(path: string, value: string): Promise<void> {
  const tmp = `${path}.tmp`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(tmp, value, { mode: 0o600 })
  await rename(tmp, path)
  try {
    await chmod(path, 0o600)
  } catch {
    // Windows: chmod is a no-op.
  }
}

export async function readJson(path: string): Promise<unknown> {
  const blob = await readFile(path, 'utf8')
  return JSON.parse(blob)
}

export async function readJsonOrNull(path: string): Promise<unknown> {
  try {
    const blob = await readFile(path, 'utf8')
    return JSON.parse(blob)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  }
}

export { join }
