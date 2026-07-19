import { homedir } from 'node:os'
import { join } from 'node:path'
import { readJsonOrNull, writeJsonAtomic } from '../fsutil'
import type { ToolInstallSpec } from '../../shared/types'

export interface ClaudeCodeConfig {
  env?: Record<string, string>
  permissions?: { allow?: string[]; deny?: string[] }
  hooks?: Record<string, unknown>
  [key: string]: unknown
}

export function claudeCodeSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json')
}

export interface ClaudeCodeWiring {
  /** Env vars to write for the gateway */
  env: Record<string, string>
}

/**
 * Compute the env vars hoist should write into Claude Code's `settings.json`
 * to route through a gateway + use the vault-stored key for this provider.
 *
 * Prefers Hoist-managed keys, falls back to provider-direct.
 */
export function claudeCodeEnvFor(provider: string, apiKey: string, baseUrl?: string): ClaudeCodeWiring {
  const env: Record<string, string> = {}
  switch (provider) {
    case 'anthropic':
    case 'azure-ai-foundry':
      env.ANTHROPIC_BASE_URL = baseUrl ?? ''
      env.ANTHROPIC_AUTH_TOKEN = apiKey
      // Remove the legacy direct key so the gateway key wins.
      delete env.ANTHROPIC_API_KEY
      break
    case 'openai':
      env.ANTHROPIC_BASE_URL = baseUrl ?? ''
      env.ANTHROPIC_AUTH_TOKEN = apiKey
      break
    default:
      env.ANTHROPIC_BASE_URL = baseUrl ?? ''
      env.ANTHROPIC_AUTH_TOKEN = apiKey
      break
  }
  return { env }
}

/**
 * Apply a wiring to Claude Code's settings.json. Reads the file first, merges
 * `env`, writes atomically. Does not touch unrelated blocks.
 */
export async function applyClaudeCodeWiring(
  wiring: ClaudeCodeWiring,
  _spec?: ToolInstallSpec,
): Promise<{ path: string; changed: boolean }> {
  const path = claudeCodeSettingsPath()
  const existing = (await readJsonOrNull(path)) as ClaudeCodeConfig | null
  const next: ClaudeCodeConfig = {
    ...(existing ?? {}),
    env: {
      ...((existing?.env as Record<string, string> | undefined) ?? {}),
      ...wiring.env,
    },
  }
  await writeJsonAtomic(path, next)
  return { path, changed: true }
}

export async function clearClaudeCodeHoistEnv(): Promise<void> {
  const path = claudeCodeSettingsPath()
  const existing = (await readJsonOrNull(path)) as ClaudeCodeConfig | null
  if (!existing?.env) return
  const HOIST_KEYS = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN']
  const env = { ...(existing.env as Record<string, string>) }
  for (const k of HOIST_KEYS) delete env[k]
  await writeJsonAtomic(path, { ...existing, env })
}
