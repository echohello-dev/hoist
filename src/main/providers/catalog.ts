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

export const PROVIDER_CATALOG: ProviderEntry[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    aliases: ['claude'],
    featured: true,
    envKeys: ['ANTHROPIC_API_KEY'],
    baseUrlEnv: 'ANTHROPIC_BASE_URL',
    authType: 'api_key',
    probeKind: 'anthropicModels',
    defaultBaseUrl: 'https://api.anthropic.com',
    notes: 'Claude API. Look for `sk-ant-…` keys.',
  },
]
