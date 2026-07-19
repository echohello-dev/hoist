import type { GatewayEntry } from '../gateways/types'
import type { ProviderEntry } from '../providers/types'
import type { ToolInstallSpec } from '../../shared/types'
import { applyClaudeCodeWiring, claudeCodeEnvFor } from './claudeCode'
import { applyCodexWiring } from './codex'
import { applyOpenCodeWiring } from './openCode'

export interface WireOptions {
  /** Vault-stored API key for the chosen provider. */
  apiKey: string
  /** Effective base URL after gateway resolution. */
  baseUrl: string
  /** Short harness id (matches HARNESS_CATALOG). */
  harness: ToolInstallSpec
  /** Provider the user picked (e.g. "anthropic"). */
  provider: ProviderEntry
  /** Gateway they routed through (or null = direct). */
  gateway: GatewayEntry | null
}

export interface WireResult {
  path: string
  changed: boolean
  content?: string
  envHint?: Record<string, string>
  note?: string
}

/**
 * Apply wiring to a single harness. Routes the call to the right writer.
 */
export async function applyWiring(opts: WireOptions): Promise<WireResult[]> {
  const { apiKey, baseUrl, harness, provider } = opts
  const out: WireResult[] = []

  if (harness.id === 'claude-code') {
    const wiring = claudeCodeEnvFor(provider.id, apiKey, baseUrl)
    const r = await applyClaudeCodeWiring(wiring)
    out.push({ ...r, envHint: wiring.env })
  } else if (harness.id === 'codex') {
    const r = await applyCodexWiring({ baseUrl }, 'openai', 'gpt-4o')
    out.push({ ...r, note: 'Codex reads OPENAI_API_KEY from auth.json or env.' })
  } else if (harness.id === 'opencode') {
    const adapter =
      provider.probeKind === 'anthropicModels' ? '@ai-sdk/anthropic' : '@ai-sdk/openai-compatible'
    const modelId = provider.id === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o'
    const r = await applyOpenCodeWiring({
      providerId: 'hoist-' + provider.id,
      adapter,
      baseUrl,
      apiKey,
      modelId,
    })
    out.push({ ...r, note: 'OpenCode reads opencode.json on next start.' })
  } else {
    out.push({ changed: false, path: '', note: `No wiring for harness "${harness.id}". Export ANTHROPIC_BASE_URL / OPENAI_BASE_URL manually.` })
  }

  return out
}
