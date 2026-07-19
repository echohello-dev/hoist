export type SecretId = string
export type SecretValue = string

export interface SecretEntry {
  id: SecretId
  label?: string
  /** Masked preview, e.g. `sk-ant-…abcd`. Never the full secret. */
  preview?: string
  /** ISO timestamp of last write. */
  updatedAt?: string
}

export interface BackendAvailability {
  available: boolean
  reason?: string
  writable: boolean
}
