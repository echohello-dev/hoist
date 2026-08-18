import { execFile } from 'child_process'
import { readFile, writeFile } from 'fs/promises'
import { homedir, userInfo } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { errorResult, normalizePercent, unavailable, type UsageResult, type UsageWindow } from './types'

const execFileAsync = promisify(execFile)

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'
const OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const OAUTH_BETA = 'oauth-2025-04-20'
const KEYCHAIN_SERVICE = 'Claude Code-credentials'
const TIMEOUT_MS = 5000

interface ClaudeOauth {
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  refreshTokenExpiresAt?: number
  subscriptionType?: string
  scopes?: string[]
}

type CredentialSource =
  | { kind: 'env'; oauth: ClaudeOauth }
  | { kind: 'keychain'; oauth: ClaudeOauth; raw: Record<string, unknown>; account: string }
  | { kind: 'file'; oauth: ClaudeOauth; raw: Record<string, unknown>; path: string }

function credentialsPath(): string {
  return join(homedir(), '.claude', '.credentials.json')
}

async function readKeychainCredentials(): Promise<CredentialSource | null> {
  if (process.platform !== 'darwin') return null
  try {
    const { stdout } = await execFileAsync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'])
    const raw = JSON.parse(stdout.trim()) as Record<string, unknown>
    const oauth = raw.claudeAiOauth as ClaudeOauth | undefined
    if (!oauth?.accessToken) return null
    let account = userInfo().username
    try {
      const meta = await execFileAsync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE])
      const m = /"acct"<blob>="([^"]+)"/.exec(meta.stderr)
      if (m) account = m[1]
    } catch { /* fall back to username */ }
    return { kind: 'keychain', oauth, raw, account }
  } catch {
    return null
  }
}

async function readFileCredentials(): Promise<CredentialSource | null> {
  try {
    const path = credentialsPath()
    const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    const oauth = raw.claudeAiOauth as ClaudeOauth | undefined
    if (!oauth?.accessToken) return null
    return { kind: 'file', oauth, raw, path }
  } catch {
    return null
  }
}

async function resolveCredentials(): Promise<CredentialSource | null> {
  const envToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
  if (envToken) return { kind: 'env', oauth: { accessToken: envToken } }
  return (await readKeychainCredentials()) ?? (await readFileCredentials())
}

async function writeBack(source: CredentialSource, oauth: ClaudeOauth): Promise<void> {
  const raw = { ...source.kind === 'env' ? {} : source.raw, claudeAiOauth: { ...(source.kind === 'env' ? {} : source.raw.claudeAiOauth as object), ...oauth } }
  if (source.kind === 'keychain') {
    await execFileAsync('security', [
      'add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', source.account, '-w', JSON.stringify(raw),
    ])
  } else if (source.kind === 'file') {
    await writeFile(source.path, JSON.stringify(raw), { mode: 0o600 })
  }
}

type RefreshOutcome =
  | { status: 'ok'; oauth: ClaudeOauth }
  | { status: 'rate_limited' | 'failed' }

async function refreshTokens(source: CredentialSource): Promise<RefreshOutcome> {
  if (source.kind === 'env' || !source.oauth.refreshToken) return { status: 'failed' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: source.oauth.refreshToken,
        client_id: OAUTH_CLIENT_ID,
      }),
      signal: controller.signal,
    })
    if (res.status === 429) return { status: 'rate_limited' }
    if (!res.ok) return { status: 'failed' }
    const data = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number }
    if (!data.access_token || !data.refresh_token) return { status: 'failed' }
    const next: ClaudeOauth = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    }
    await writeBack(source, next)
    return { status: 'ok', oauth: next }
  } catch {
    return { status: 'failed' }
  } finally {
    clearTimeout(timer)
  }
}

function refreshDetail(outcome: RefreshOutcome): string {
  return outcome.status === 'rate_limited'
    ? 'Token refresh is rate limited by Anthropic — try again in a minute, or run claude once.'
    : 'OAuth token expired and refresh failed — run claude once to re-authenticate.'
}

function windowFrom(label: string, bucket: unknown): UsageWindow | null {
  if (!bucket || typeof bucket !== 'object') return null
  const b = bucket as Record<string, unknown>
  const used = normalizePercent(b.utilization ?? b.percent ?? b.used_percentage)
  if (used === null) return null
  const resetsAt = typeof b.resets_at === 'string' ? b.resets_at : undefined
  return { label, usedPercent: used, resetsAt }
}

function parseWindows(data: Record<string, unknown>): UsageWindow[] {
  const windows: UsageWindow[] = []
  if (Array.isArray(data.limits)) {
    for (const entry of data.limits as Record<string, unknown>[]) {
      if (!entry || typeof entry !== 'object') continue
      const kind = entry.kind
      const scope = entry.scope as { model?: { display_name?: string } } | undefined
      const label = kind === 'session' ? '5-hour session'
        : kind === 'weekly_all' ? 'Weekly · all models'
        : kind === 'weekly_scoped' ? `Weekly · ${scope?.model?.display_name ?? 'scoped'}`
        : typeof kind === 'string' ? kind : 'Window'
      const w = windowFrom(label, entry)
      if (w) windows.push(w)
    }
  }
  if (windows.length === 0) {
    const legacy: Array<[string, string]> = [
      ['five_hour', '5-hour session'],
      ['seven_day', 'Weekly · all models'],
      ['seven_day_sonnet', 'Weekly · Sonnet'],
      ['seven_day_opus', 'Weekly · Opus'],
    ]
    for (const [key, label] of legacy) {
      const w = windowFrom(label, data[key])
      if (w) windows.push(w)
    }
  }
  return windows
}

export async function usageClaudeCode(): Promise<UsageResult> {
  const checkedAt = new Date().toISOString()

  const source = await resolveCredentials()
  if (!source) {
    return unavailable('No Claude Code credentials found (Keychain or ~/.claude/.credentials.json).', checkedAt)
  }

  let oauth = source.oauth
  const expired = typeof oauth.expiresAt === 'number' && oauth.expiresAt < Date.now()
  if (expired) {
    const outcome = await refreshTokens(source)
    if (outcome.status !== 'ok') {
      return unavailable(refreshDetail(outcome), checkedAt)
    }
    oauth = outcome.oauth
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(USAGE_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${oauth.accessToken}`,
        'anthropic-beta': OAUTH_BETA,
        'User-Agent': 'claude-code/2.0',
      },
      signal: controller.signal,
    })
    if (res.status === 401 || res.status === 403) {
      if (!expired) {
        const outcome = await refreshTokens(source)
        if (outcome.status === 'ok') {
          return usageClaudeCode()
        }
        return unavailable(refreshDetail(outcome), checkedAt)
      }
      return unavailable(`Usage endpoint rejected the token (${res.status}) — run claude once to re-authenticate.`, checkedAt)
    }
    if (res.status === 429) {
      return unavailable('Usage endpoint is rate limited — try again in a minute.', checkedAt)
    }
    if (!res.ok) {
      return unavailable(`Unexpected HTTP ${res.status} from the usage endpoint.`, checkedAt)
    }

    const data = await res.json() as Record<string, unknown>
    const windows = parseWindows(data)

    let credits: UsageResult['credits']
    const extra = data.extra_usage as Record<string, unknown> | null | undefined
    if (extra && extra.is_enabled === true && typeof extra.monthly_limit === 'number') {
      const used = typeof extra.used_credits === 'number' ? extra.used_credits : 0
      credits = { balance: Math.round((extra.monthly_limit - used) * 100) / 100, limit: extra.monthly_limit }
    }

    if (windows.length === 0 && !credits) {
      return unavailable('Usage endpoint returned no quota buckets for this plan.', checkedAt)
    }
    const plan = (source.kind !== 'env' ? (source.raw.claudeAiOauth as ClaudeOauth | undefined)?.subscriptionType : undefined)
      ?? oauth.subscriptionType
    return { available: true, plan, windows, credits, checkedAt }
  } catch (err) {
    return errorResult(err, TIMEOUT_MS, checkedAt)
  } finally {
    clearTimeout(timer)
  }
}
