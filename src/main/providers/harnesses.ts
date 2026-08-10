import type { ToolInstallSpec } from '../../shared/types'

export type HarnessStatus = 'installed' | 'installing' | 'available' | 'failed' | 'deprecated'

export interface HarnessCatalogEntry extends ToolInstallSpec {
  avatar: string
  models: string[]
  features: string[]
  status: HarnessStatus
  statusNote?: string
}

export const HARNESS_CATALOG: HarnessCatalogEntry[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    avatar: 'CC',
    description: "Anthropic's agent harness for the terminal. Plans changes, edits files, runs commands, and reports back. Works on any codebase Claude can read.",
    models: ['anthropic', 'opus-4', 'opus-4.1', 'sonnet-4'],
    features: [
      'Plan + edit + execute in one session',
      'Inline diff review in the terminal',
      'Permissions model per command type',
      'Slash commands for repeated workflows',
      'CLAUDE.md project context files',
    ],
    status: 'installed',
    installMethods: [
      { type: 'npm', package: '@anthropic-ai/claude-code', binary: 'claude' },
    ],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    avatar: 'OC',
    description: 'Open-source AI coding agent with a TUI. Multi-provider, configuration-light.',
    models: ['anthropic', 'openai', 'gemini'],
    features: [],
    status: 'installed',
    installMethods: [
      { type: 'npm', package: 'opencode-ai', binary: 'opencode' },
    ],
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    avatar: 'CX',
    description: "OpenAI's terminal coding agent. Background-safe via login shell sessions.",
    models: ['openai'],
    features: ['GPT-5.1 · v0.46.0'],
    status: 'installed',
    installMethods: [
      { type: 'npm', package: '@openai/codex', binary: 'codex' },
    ],
  },
]

export function findHarness(id: string): ToolInstallSpec | undefined {
  return HARNESS_CATALOG.find((h) => h.id === id)
}

export function findHarnessCatalog(id: string): HarnessCatalogEntry | undefined {
  return HARNESS_CATALOG.find((h) => h.id === id)
}
