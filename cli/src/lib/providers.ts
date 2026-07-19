export interface ProviderEntry {
  id: string
  label: string
  aliases?: string[]
  featured?: boolean
  envKeys: string[]
  baseUrlEnv?: string
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
    defaultBaseUrl: 'https://api.anthropic.com',
    notes: 'Claude API. Look for `sk-ant-…` keys.',
  },
]

export function findProvider(idOrAlias: string): ProviderEntry | undefined {
  const lower = idOrAlias.toLowerCase()
  return PROVIDER_CATALOG.find(
    (p) => p.id === lower || p.aliases?.some((a) => a.toLowerCase() === lower),
  )
}
