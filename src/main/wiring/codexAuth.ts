import { homedir } from 'node:os'
import { join } from 'node:path'
import { readJsonOrNull, writeJsonAtomic } from '../fsutil'

export function codexAuthPath(homeDir: string = homedir()): string {
  return join(homeDir, '.codex', 'auth.json')
}

export interface CodexAuthShape {
  OPENAI_API_KEY?: string
  [key: string]: unknown
}

export interface CodexAuthWiring {
  apiKey: string
}

export interface CodexAuthOptions {
  homeDir?: string
  platform?: NodeJS.Platform
  /** When false, the caller has not enabled file storage for credentials. */
  storeInFile?: boolean
}

export interface CodexAuthResult {
  path: string
  changed: boolean
  note?: string
}

export const CODEX_AUTH_PLATFORM_NOTE =
  'Codex on this platform reads OPENAI_API_KEY from env; please set it in your shell'

/**
 * Write OPENAI_API_KEY into ~/.codex/auth.json so Codex works from a fresh
 * shell without the env var set. Existing keys in the file are preserved.
 * The file is written atomically with 0600 permissions via writeJsonAtomic.
 *
 * On non-macOS platforms the write is skipped per the wiring contract for
 * this slice. The caller surfaces the returned note instead.
 */
export async function applyCodexAuthWiring(
  wiring: CodexAuthWiring,
  opts: CodexAuthOptions = {},
): Promise<CodexAuthResult> {
  const path = codexAuthPath(opts.homeDir)
  const platform = opts.platform ?? process.platform

  if (platform !== 'darwin') {
    return { path, changed: false, note: CODEX_AUTH_PLATFORM_NOTE }
  }

  if (opts.storeInFile === false) {
    return {
      path,
      changed: false,
      note: 'File storage is not enabled; Codex reads OPENAI_API_KEY from env; please set it in your shell',
    }
  }

  if (!wiring.apiKey) {
    return { path, changed: false, note: 'No API key supplied; skipped Codex auth.json write.' }
  }

  const existingRaw = await readJsonOrNull(path)
  const existing: CodexAuthShape =
    existingRaw && typeof existingRaw === 'object' && !Array.isArray(existingRaw)
      ? (existingRaw as CodexAuthShape)
      : {}

  const next: CodexAuthShape = { ...existing, OPENAI_API_KEY: wiring.apiKey }
  await writeJsonAtomic(path, next)
  return { path, changed: true }
}

export async function readCodexAuthShape(
  homeDir?: string,
): Promise<CodexAuthShape | null> {
  return ((await readJsonOrNull(codexAuthPath(homeDir))) as CodexAuthShape | null) ?? null
}
