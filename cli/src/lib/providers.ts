import { PROVIDER_CATALOG, findProvider, type ProviderEntry } from '../../../src/main/providers/catalog'
export { PROVIDER_CATALOG, findProvider, type ProviderEntry } from '../../../src/main/providers/catalog'

import { GATEWAY_CATALOG, findGateway, type GatewayEntry } from '../../../src/main/gateways'
export { GATEWAY_CATALOG, findGateway, type GatewayEntry } from '../../../src/main/gateways'

import {
  selectAnthropicEndpoint,
  selectOpenAIEndpoint,
  unresolvedPlaceholders,
} from '../../../src/main/gateways/resolve'

export { selectAnthropicEndpoint, selectOpenAIEndpoint, unresolvedPlaceholders }

/** CLI-context helper: list provider entries with envKeys defaulted to []. */
export function listProviders(): (ProviderEntry & { envKeys: string[] })[] {
  return PROVIDER_CATALOG.map((p) => ({ ...p, envKeys: p.envKeys ?? [] }))
}

/** CLI-context helper: list gateway entries with `placeholders` resolved. */
export function listGateways() {
  return GATEWAY_CATALOG.map((g) => ({
    ...g,
    placeholders: unresolvedPlaceholders(g.baseUrl),
  }))
}
