import type { ToolInstallSpec } from '../../shared/types'

export const HARNESS_CATALOG: ToolInstallSpec[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic\'s official agentic coding CLI.',
    installMethods: [
      { type: 'npm', package: '@anthropic-ai/claude-code', binary: 'claude' },
    ],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'Open-source AI coding agent with a TUI.',
    installMethods: [
      { type: 'npm', package: 'opencode-ai', binary: 'opencode' },
    ],
  },
  {
    id: 'codex',
    name: 'Codex',
    description: 'OpenAI\'s terminal coding agent.',
    installMethods: [
      { type: 'npm', package: '@openai/codex', binary: 'codex' },
    ],
  },
]

export function findHarness(id: string): ToolInstallSpec | undefined {
  return HARNESS_CATALOG.find((h) => h.id === id)
}
