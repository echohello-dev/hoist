import { probeAnthropic } from './anthropic'
import type { ProbeResult } from './types'

export type { ProbeResult } from './types'
export type { AnthropicProbeOptions } from './anthropic'
export { probeAnthropic } from './anthropic'

export interface ProbeContext {
  providerId: string
  apiKey: string
  baseUrl?: string
}

export async function runProbe(ctx: ProbeContext): Promise<ProbeResult> {
  switch (ctx.providerId) {
    case 'anthropic':
      return probeAnthropic({ apiKey: ctx.apiKey, baseUrl: ctx.baseUrl })
    default:
      return {
        valid: false,
        status: 'error',
        detail: `No probe implemented for provider "${ctx.providerId}".`,
        checkedAt: new Date().toISOString(),
      }
  }
}
