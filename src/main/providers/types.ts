import type { BudgetProbeKind, ProbeKind } from '../probes/types'

export type AuthType = 'api_key' | 'oauth' | 'cloud_creds' | 'none'

export interface ProviderEntry {
  id: string
  label: string
  aliases?: string[]
  featured?: boolean
  /** Optional for cloud-cred providers (Bedrock, Vertex) where no env key applies. */
  envKeys?: string[]
  baseUrlEnv?: string
  authType: AuthType
  probeKind: ProbeKind
  budgetProbeKind?: BudgetProbeKind
  defaultBaseUrl?: string
  notes?: string
}
