import type { BackendAvailability, SecretEntry, SecretId, SecretValue } from './types'

export interface SecretWriteOptions {
  label?: string
}

export interface SecretBackend {
  readonly id: string
  label(): string
  availability(): Promise<BackendAvailability> | BackendAvailability
  get(id: SecretId): Promise<SecretValue | null>
  set?(id: SecretId, value: SecretValue, opts?: SecretWriteOptions): Promise<void>
  delete?(id: SecretId): Promise<boolean>
  list(): Promise<SecretEntry[]>
  unlock?(): Promise<void>
}

export function isWritable(
  b: SecretBackend,
): b is SecretBackend & Required<Pick<SecretBackend, 'set' | 'delete'>> {
  return typeof b.set === 'function' && typeof b.delete === 'function'
}

export function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 8) return '…'
  const head = value.slice(0, value.startsWith('sk-') ? 6 : 2)
  const tail = value.slice(-4)
  return `${head}…${tail}`
}
