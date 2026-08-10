/**
 * Per-harness config helpers: set active model, reset Hoist-managed wiring.
 */
import { readFile } from 'node:fs/promises'
import { exists, readJsonOrNull, writeJsonAtomic, writeTextAtomic } from '../fsutil'
import {
  clearClaudeCodeHoistEnv,
  claudeCodeSettingsPath,
  type ClaudeCodeConfig,
} from './claudeCode'
import { clearOpenCodeProvider, openCodeConfigPath } from './openCode'
import { codexConfigPath } from './codex'

export const CLAUDE_MODEL_PRESETS = [
  'claude-opus-4-20250514',
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
] as const

export const CODEX_MODEL_PRESETS = [
  'gpt-5',
  'gpt-4.1',
  'gpt-4o',
  'o3',
  'o4-mini',
] as const

export interface HarnessConfigSetRequest {
  harnessId: string
  /** Active model id (Claude settings.model, OpenCode model, Codex model=). */
  model?: string | null
}

export interface HarnessConfigResetRequest {
  harnessId: string
  /** Also clear the active model field. Default true. */
  clearModel?: boolean
}

export interface HarnessConfigMutationResult {
  ok: boolean
  error?: string
  path?: string
  note?: string
}

export async function setHarnessModel(req: HarnessConfigSetRequest): Promise<HarnessConfigMutationResult> {
  const model = (req.model ?? '').trim()
  if (!model) return { ok: false, error: 'Model is required.' }

  try {
    if (req.harnessId === 'claude-code') {
      const path = claudeCodeSettingsPath()
      const existing = ((await readJsonOrNull(path)) as ClaudeCodeConfig | null) ?? {}
      await writeJsonAtomic(path, { ...existing, model })
      return { ok: true, path, note: 'Wrote model to ~/.claude/settings.json' }
    }

    if (req.harnessId === 'opencode') {
      const path = openCodeConfigPath()
      const existing = ((await readJsonOrNull(path)) as Record<string, unknown> | null) ?? {}
      // OpenCode accepts "provider/model" or bare model ids depending on setup.
      await writeJsonAtomic(path, { ...existing, model })
      return { ok: true, path, note: 'Wrote model to opencode.json' }
    }

    if (req.harnessId === 'codex') {
      const path = codexConfigPath()
      const text = (await exists(path)) ? await readFile(path, 'utf8') : ''
      const next = upsertCodexModelLine(text, model)
      await writeTextAtomic(path, next)
      return { ok: true, path, note: 'Wrote model = "…" in ~/.codex/config.toml' }
    }

    return { ok: false, error: `No model editor for harness "${req.harnessId}"` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function resetHarnessConfig(req: HarnessConfigResetRequest): Promise<HarnessConfigMutationResult> {
  const clearModel = req.clearModel !== false
  try {
    if (req.harnessId === 'claude-code') {
      await clearClaudeCodeHoistEnv()
      const path = claudeCodeSettingsPath()
      if (clearModel) {
        const existing = ((await readJsonOrNull(path)) as ClaudeCodeConfig | null) ?? {}
        if ('model' in existing) {
          const next = { ...existing }
          delete next.model
          await writeJsonAtomic(path, next)
        }
      }
      return {
        ok: true,
        path,
        note: clearModel
          ? 'Cleared Hoist env keys and model from ~/.claude/settings.json'
          : 'Cleared Hoist env keys from ~/.claude/settings.json',
      }
    }

    if (req.harnessId === 'opencode') {
      const path = openCodeConfigPath()
      // Remove hoist-* providers and optional model field
      const existing = ((await readJsonOrNull(path)) as Record<string, unknown> | null) ?? {}
      const providers = { ...((existing.provider as Record<string, unknown> | undefined) ?? {}) }
      let changed = false
      for (const key of Object.keys(providers)) {
        if (key.startsWith('hoist-')) {
          delete providers[key]
          changed = true
        }
      }
      if (changed) existing.provider = providers
      if (clearModel && 'model' in existing) {
        delete existing.model
        changed = true
      }
      if (changed) await writeJsonAtomic(path, existing)
      // Also clear known default hoist provider ids
      await clearOpenCodeProvider('hoist-anthropic')
      await clearOpenCodeProvider('hoist-openai')
      return { ok: true, path, note: 'Removed Hoist provider blocks from opencode.json' }
    }

    if (req.harnessId === 'codex') {
      const path = codexConfigPath()
      if (!(await exists(path))) return { ok: true, path, note: 'No Codex config to reset.' }
      const text = await readFile(path, 'utf8')
      const next = stripHoistCodexBlock(text)
      if (next !== text) await writeTextAtomic(path, next)
      return { ok: true, path, note: 'Removed # hoist-managed block from config.toml' }
    }

    return { ok: false, error: `No reset handler for harness "${req.harnessId}"` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function upsertCodexModelLine(text: string, modelId: string): string {
  const line = `model = "${modelId}"`
  if (/^model\s*=/m.test(text)) {
    return text.replace(/^model\s*=\s*.*$/m, line)
  }
  const trimmed = text.replace(/\s*$/, '')
  return `${trimmed}\n\n# hoist-managed model\n${line}\n`
}

function stripHoistCodexBlock(text: string): string {
  // Drop from "# hoist-managed" through next blank-line-separated section or EOF
  return text
    .replace(/\n*# hoist-managed[\s\S]*?(?=\n#(?! hoist)|\n\[|\s*$)/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + (text.endsWith('\n') ? '\n' : '')
}

/** Suggested models for the configure UI. */
export function modelPresetsFor(harnessId: string): string[] {
  if (harnessId === 'claude-code') return [...CLAUDE_MODEL_PRESETS]
  if (harnessId === 'codex') return [...CODEX_MODEL_PRESETS]
  return []
}
