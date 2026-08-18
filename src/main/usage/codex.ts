import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { errorResult, normalizePercent, unavailable, type UsageResult, type UsageWindow } from './types'

const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const TIMEOUT_MS = 5000

interface CodexAuth {
  tokens?: {
    access_token?: string
    account_id?: string
  }
}

function windowLabel(limitWindowSeconds: unknown): string {
  if (typeof limitWindowSeconds !== 'number') return 'Window'
  if (limitWindowSeconds <= 6 * 3600) return '5-hour session'
  if (limitWindowSeconds >= 6 * 86400) return 'Weekly'
  return `${Math.round(limitWindowSeconds / 3600)}h window`
}

function windowFrom(bucket: unknown): UsageWindow | null {
  if (!bucket || typeof bucket !== 'object') return null
  const b = bucket as Record<string, unknown>
  const used = normalizePercent(b.used_percent)
  if (used === null) return null
  const resetsAt = typeof b.reset_at === 'number'
    ? new Date(b.reset_at * 1000).toISOString()
    : undefined
  return { label: windowLabel(b.limit_window_seconds), usedPercent: used, resetsAt }
}

export async function usageCodex(): Promise<UsageResult> {
  const checkedAt = new Date().toISOString()

  let auth: CodexAuth
  try {
    auth = JSON.parse(await readFile(join(homedir(), '.codex', 'auth.json'), 'utf8')) as CodexAuth
  } catch {
    return unavailable('No Codex credentials found (~/.codex/auth.json).', checkedAt)
  }

  const token = auth.tokens?.access_token
  if (!token) {
    return unavailable('No access token in ~/.codex/auth.json — sign in with the Codex CLI.', checkedAt)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'codex-cli',
      Accept: 'application/json',
    }
    if (auth.tokens?.account_id) headers['ChatGPT-Account-Id'] = auth.tokens.account_id

    const res = await fetch(USAGE_URL, { method: 'GET', headers, signal: controller.signal })
    if (res.status === 401 || res.status === 403) {
      return unavailable(`Usage endpoint rejected the token (${res.status}) — sign in again with the Codex CLI.`, checkedAt)
    }
    if (res.status === 429) {
      return unavailable('Usage endpoint is rate limited — try again in a minute.', checkedAt)
    }
    if (!res.ok) {
      return unavailable(`Unexpected HTTP ${res.status} from the usage endpoint.`, checkedAt)
    }

    const data = await res.json() as Record<string, unknown>
    const rateLimit = (data.rate_limit ?? data.rate_limits) as Record<string, unknown> | undefined
    const windows: UsageWindow[] = []
    for (const key of ['primary_window', 'secondary_window']) {
      const w = windowFrom(rateLimit?.[key])
      if (w) windows.push(w)
    }

    let credits: UsageResult['credits']
    const c = data.credits as Record<string, unknown> | undefined
    if (c && (c.has_credits === true || typeof c.balance === 'number')) {
      credits = {
        balance: typeof c.balance === 'number' ? c.balance : undefined,
        unlimited: c.unlimited === true,
      }
    }

    if (windows.length === 0 && !credits) {
      return unavailable('Usage endpoint returned no rate-limit windows for this account.', checkedAt)
    }
    const plan = typeof data.plan_type === 'string' ? data.plan_type : undefined
    return { available: true, plan, windows, credits, checkedAt }
  } catch (err) {
    return errorResult(err, TIMEOUT_MS, checkedAt)
  } finally {
    clearTimeout(timer)
  }
}
