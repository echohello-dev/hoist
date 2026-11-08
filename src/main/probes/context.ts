import type { ProbeContext } from './index'
import type { ProbeKind } from './types'

export interface ProbeContextInput {
  providerId: string
  apiKey?: string
  baseUrl?: string
  /** Explicit project from the probe request. Wins over the stored value. */
  project?: string
  /** Explicit region from the probe request. Wins over the stored value. */
  region?: string
  /** Project read from the vault beside the API key. */
  storedProject?: string | null
  /** Region read from the vault beside the API key. */
  storedRegion?: string | null
}

function trimmed(value: string | null | undefined): string | undefined {
  const next = value?.trim()
  return next ? next : undefined
}

/** Build a probe context, preferring explicit fields over stored vault config. */
export function buildProbeContext(input: ProbeContextInput): ProbeContext {
  return {
    providerId: input.providerId,
    apiKey: input.apiKey ?? '',
    baseUrl: input.baseUrl,
    project: trimmed(input.project) ?? trimmed(input.storedProject),
    region: trimmed(input.region) ?? trimmed(input.storedRegion),
  }
}

/** The aws probe reads the AWS env chain, so it needs no vault API key. */
export function probeRequiresApiKey(probeKind: ProbeKind | string | undefined): boolean {
  return probeKind !== 'aws'
}
