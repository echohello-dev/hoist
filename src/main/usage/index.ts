import { usageClaudeCode } from './claudeCode'
import { usageCodex } from './codex'
import { unavailable, type UsageResult } from './types'

export type { UsageCredits, UsageResult, UsageWindow } from './types'
export { runProviderUsage } from './providers'

export function runHarnessUsage(harnessId: string): Promise<UsageResult> {
  switch (harnessId) {
    case 'claude-code':
      return usageClaudeCode()
    case 'codex':
      return usageCodex()
    default:
      return Promise.resolve(unavailable(`No usage source known for ${harnessId}.`))
  }
}
