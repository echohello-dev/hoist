import type { BudgetProbeKind, ProbeKind } from '../probes/types'

export type AuthType = 'api_key' | 'oauth' | 'cloud_creds' | 'none'

export interface ProviderEntry {
  id: string
  label: string
  aliases?: string[]
  featured?: boolean
  envKeys: string[]
  baseUrlEnv?: string
  authType: AuthType
  probeKind: ProbeKind
  budgetProbeKind?: BudgetProbeKind
  defaultBaseUrl?: string
  notes?: string
}

// Populated by scripts/gen-catalog.ts in Phase 2 (ADR-0002).
export const PROVIDER_CATALOG: ProviderEntry[] = []
