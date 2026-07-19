import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { exists, readJsonOrNull, writeTextAtomic } from '../fsutil'

export function codexConfigPath(): string {
  return join(homedir(), '.codex', 'config.toml')
}
export function codexAuthPath(): string {
  return join(homedir(), '.codex', 'auth.json')
}

export interface CodexAuthShape {
  OPENAI_API_KEY?: string
  [key: string]: unknown
}

/**
 * Codex picks OPENAI_API_KEY from auth.json or from env. We never write the
 * key directly into a non-secure config; we leave it to the vault + env loader.
 */
export interface CodexWiring {
  /** base_url override Codex uses for the proxy endpoint. */
  baseUrl: string
}

/**
 * Minimal in-place TOML edit for a config.toml. Reads existing contents,
 * preserves comments, replaces or appends `model_provider` and `model` keys.
 *
 * Codex supports a per-model `provider` block in config.toml that lets you
 * point at any OpenAI-compatible URL without leaking env vars.
 */
export async function applyCodexWiring(
  wiring: CodexWiring,
  providerId = 'openai',
  modelId = 'gpt-4o',
): Promise<{ path: string; changed: boolean; content: string }> {
  const path = codexConfigPath()
  const text = (await exists(path)) ? await readFile(path, 'utf8') : ''
  const next = upsertCodexProvider(text, providerId, modelId, wiring.baseUrl)
  await writeTextAtomic(path, next)
  return { path, changed: true, content: next }
}

function upsertCodexProvider(text: string, providerId: string, modelId: string, baseUrl: string): string {
  const providerSection = `[model_providers.${providerId}]\nbase_url = "${baseUrl}"\nwire_api = "chat"\nrequires_api_key = true\n\n`
  const modelLine = `model = "${modelId}"\nprovider = "${providerId}"\n`
  let out = text

  // Drop any existing [model_providers.<providerId>] block so re-runs stay clean.
  const providerSectionRegex = new RegExp(`(\\n|\\A)\\[model_providers\\.${providerId}\\][\\s\\S]*?(?=\\n\\[|\\Z)`, 'm')
  out = out.replace(providerSectionRegex, '')

  // Drop a previous `provider = "<providerId>"` line if present.
  const providerLineRegex = new RegExp(`^provider\\s*=\\s*"?${providerId}"?\\s*\\n`, 'm')
  out = out.replace(providerLineRegex, '')

  // Append our section at the bottom, separated by a blank line.
  out = out.replace(/\s*$/, '')
  out += `\n\n# hoist-managed\n${providerSection}${modelLine}`
  return out
}

export async function readCodexAuthShape(): Promise<CodexAuthShape | null> {
  return ((await readJsonOrNull(codexAuthPath())) as CodexAuthShape | null) ?? null
}
