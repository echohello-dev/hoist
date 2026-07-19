import { PROVIDER_CATALOG as _PROVIDER_CATALOG } from './catalog.generated'
import type { ProviderEntry } from './types'

export type { ProviderEntry, AuthType } from './types'

export const PROVIDER_CATALOG: readonly ProviderEntry[] = _PROVIDER_CATALOG

export function findProvider(idOrAlias: string): ProviderEntry | undefined {
  const lower = idOrAlias.toLowerCase()
  return PROVIDER_CATALOG.find(
    (p) => p.id === lower || p.aliases?.some((a) => a.toLowerCase() === lower),
  )
}
