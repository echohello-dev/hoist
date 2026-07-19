import { app, safeStorage } from 'electron'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { maskSecret, type SecretBackend, type SecretWriteOptions } from './backend'
import type { BackendAvailability, SecretEntry, SecretId, SecretValue } from './types'

const VAULT_FILE = 'vault.bin'

interface PersistedRecord {
  id: SecretId
  label?: string
  ciphertext: string
  updatedAt: string
}

interface VaultShape {
  version: 1
  records: PersistedRecord[]
}

function vaultPath(): string {
  return join(app.getPath('userData'), VAULT_FILE)
}

function previewOf(ciphertext: string): string | undefined {
  try {
    if (!safeStorage.isEncryptionAvailable()) return undefined
    const plaintext = safeStorage.decryptString(Buffer.from(ciphertext, 'base64'))
    return maskSecret(plaintext)
  } catch {
    return undefined
  }
}

async function readVault(): Promise<VaultShape> {
  try {
    const blob = await readFile(vaultPath(), 'utf8')
    const parsed = JSON.parse(blob) as VaultShape
    if (parsed.version !== 1 || !Array.isArray(parsed.records)) {
      throw new Error('unsupported vault version')
    }
    return parsed
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, records: [] }
    }
    throw err
  }
}

async function writeVaultAtomically(vault: VaultShape): Promise<void> {
  const target = vaultPath()
  const tmp = `${target}.tmp`
  await mkdir(dirname(target), { recursive: true })
  await writeFile(tmp, JSON.stringify(vault), { mode: 0o600 })
  await rename(tmp, target)
  try {
    await chmod(target, 0o600)
  } catch {
    // Windows: chmod is a no-op. The ACL inherits from userData which is per-user.
  }
}

export function createSafeStorageBackend(): SecretBackend {
  return {
    id: 'safeStorage',
    label: () => 'Local encrypted vault (safeStorage)',
    availability(): BackendAvailability {
      if (!safeStorage.isEncryptionAvailable()) {
        return {
          available: false,
          writable: false,
          reason: 'OS encryption is unavailable. Enable Keychain (macOS), DPAPI (Windows), or libsecret (Linux).',
        }
      }
      return { available: true, writable: true }
    },
    async list(): Promise<SecretEntry[]> {
      const vault = await readVault()
      const usable = safeStorage.isEncryptionAvailable()
      return vault.records.map(({ id, label, ciphertext, updatedAt }) => ({
        id,
        label,
        updatedAt,
        preview: usable ? previewOf(ciphertext) : undefined,
      }))
    },
    async get(id: SecretId): Promise<SecretValue | null> {
      const vault = await readVault()
      const record = vault.records.find((r) => r.id === id)
      if (!record) return null
      if (safeStorage.isEncryptionAvailable() === false) {
        throw new Error('safeStorage unavailable; cannot decrypt.')
      }
      const plaintext = safeStorage.decryptString(Buffer.from(record.ciphertext, 'base64'))
      return plaintext
    },
    async set(id: SecretId, value: SecretValue, opts?: SecretWriteOptions): Promise<void> {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('safeStorage unavailable; cannot encrypt.')
      }
      const vault = await readVault()
      const ciphertext = safeStorage.encryptString(value).toString('base64')
      const updatedAt = new Date().toISOString()
      const existing = vault.records.find((r) => r.id === id)
      const next: VaultShape = {
        version: 1,
        records: [
          ...vault.records.filter((r) => r.id !== id),
          { id, ciphertext, updatedAt, label: opts?.label ?? existing?.label },
        ],
      }
      await writeVaultAtomically(next)
    },
    async delete(id: SecretId): Promise<boolean> {
      const vault = await readVault()
      const before = vault.records.length
      const next: VaultShape = {
        version: 1,
        records: vault.records.filter((r) => r.id !== id),
      }
      if (next.records.length === before) return false
      await writeVaultAtomically(next)
      return true
    },
  }
}
