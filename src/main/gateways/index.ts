import { GATEWAY_CATALOG as _GATEWAY_CATALOG } from './catalog.generated'
import type { GatewayEntry } from './types'

export type {
  GatewayEntry,
  GatewayAuth,
  GatewayEndpoints,
  GatewayAuthScheme,
} from './types'

export const GATEWAY_CATALOG: readonly GatewayEntry[] = _GATEWAY_CATALOG

export function findGateway(id: string): GatewayEntry | undefined {
  return GATEWAY_CATALOG.find((g) => g.id === id)
}
