import type { BackendAvailability, SecretEntry, SecretId, SecretValue } from './types'

export interface SecretBackend {
  readonly id: string
  label(): string
  availability(): Promise<BackendAvailability> | BackendAvailability
  get(id: SecretId): Promise<SecretValue | null>
  set?(id: SecretId, value: SecretValue): Promise<void>
  delete?(id: SecretId): Promise<boolean>
  list(): Promise<SecretEntry[]>
  unlock?(): Promise<void>
}

export function isWritable(
  b: SecretBackend,
): b is SecretBackend & Required<Pick<SecretBackend, 'set' | 'delete'>> {
  return typeof b.set === 'function' && typeof b.delete === 'function'
}
