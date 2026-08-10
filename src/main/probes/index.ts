import { probeAnthropic } from './anthropic'
import { probeOpenAI } from './openai'
import type { ProbeResult } from './types'
import { PROVIDER_CATALOG } from '../providers/catalog.generated'

export type { ProbeResult } from './types'
export type { AnthropicProbeOptions } from './anthropic'
export { probeAnthropic } from './anthropic'
export { probeOpenAI } from './openai'

export interface ProbeContext {
  providerId: string
  apiKey: string
  baseUrl?: string
}

/** Providers that share the OpenAI-compatible /models probe. */
const OPENAI_COMPAT = new Set([
  'openai',
  'groq',
  'openrouter',
  'together',
  'fireworks',
  'deepseek',
  'mistral',
  'xai',
  'perplexity',
  'custom-openai',
])

export async function runProbe(ctx: ProbeContext): Promise<ProbeResult> {
  const provider = PROVIDER_CATALOG.find((p) => p.id === ctx.providerId)
  const kind = provider?.probeKind

  if (ctx.providerId === 'anthropic' || kind === 'anthropicModels') {
    return probeAnthropic({
      apiKey: ctx.apiKey,
      baseUrl: ctx.baseUrl ?? provider?.defaultBaseUrl,
    })
  }

  if (kind === 'openaiModels' || OPENAI_COMPAT.has(ctx.providerId)) {
    return probeOpenAI({
      apiKey: ctx.apiKey,
      baseUrl: ctx.baseUrl ?? provider?.defaultBaseUrl,
    })
  }

  return {
    valid: false,
    status: 'error',
    detail: `No probe implemented for provider "${ctx.providerId}".`,
    checkedAt: new Date().toISOString(),
  }
}
