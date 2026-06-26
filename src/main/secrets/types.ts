export type SecretId = string
export type SecretValue = string

export interface SecretEntry {
  id: SecretId
  label?: string
}

export interface BackendAvailability {
  available: boolean
  reason?: string
  writable: boolean
}
