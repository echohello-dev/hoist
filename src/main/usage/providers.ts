import { errorResult, unavailable, type UsageResult } from './types'

const TIMEOUT_MS = 5000

async function getJson(url: string, headers: Record<string, string>): Promise<{ status: number; data: unknown }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal })
    const data = res.status === 204 ? null : await res.json().catch(() => null)
    return { status: res.status, data }
  } finally {
    clearTimeout(timer)
  }
}

async function usageOpenRouter(apiKey: string): Promise<UsageResult> {
  const checkedAt = new Date().toISOString()
  try {
    const { status, data } = await getJson('https://openrouter.ai/api/v1/auth/key', {
      Authorization: `Bearer ${apiKey}`,
    })
    if (status === 401 || status === 403) return unavailable(`Key rejected (${status}).`, checkedAt)
    if (status !== 200 || !data || typeof data !== 'object') {
      return unavailable(`Unexpected HTTP ${status} from OpenRouter.`, checkedAt)
    }
    const d = (data as Record<string, unknown>).data as Record<string, unknown> | undefined
    if (!d) return unavailable('OpenRouter returned no key metadata.', checkedAt)
    const limit = typeof d.limit === 'number' ? d.limit : null
    const remaining = typeof d.limit_remaining === 'number' ? d.limit_remaining : null
    const usage = typeof d.usage === 'number' ? d.usage : null
    return {
      available: true,
      windows: [],
      credits: {
        balance: remaining ?? (limit != null && usage != null ? Math.round((limit - usage) * 100) / 100 : undefined),
        limit: limit ?? undefined,
        unlimited: limit == null,
        currency: 'USD',
      },
      detail: usage != null ? `$${usage.toFixed(2)} used of ${limit != null ? `$${limit.toFixed(2)}` : 'unlimited'} credits.` : undefined,
      checkedAt,
    }
  } catch (err) {
    return errorResult(err, TIMEOUT_MS, checkedAt)
  }
}

async function usageDeepSeek(apiKey: string): Promise<UsageResult> {
  const checkedAt = new Date().toISOString()
  try {
    const { status, data } = await getJson('https://api.deepseek.com/user/balance', {
      Authorization: `Bearer ${apiKey}`,
    })
    if (status === 401 || status === 403) return unavailable(`Key rejected (${status}).`, checkedAt)
    if (status !== 200 || !data || typeof data !== 'object') {
      return unavailable(`Unexpected HTTP ${status} from DeepSeek.`, checkedAt)
    }
    const infos = (data as Record<string, unknown>).balance_infos
    const first = Array.isArray(infos) ? infos[0] as Record<string, unknown> | undefined : undefined
    const balance = first && typeof first.total_balance === 'string' ? Number.parseFloat(first.total_balance) : NaN
    if (!first || !Number.isFinite(balance)) return unavailable('DeepSeek returned no balance info.', checkedAt)
    return {
      available: true,
      windows: [],
      credits: {
        balance,
        currency: typeof first.currency === 'string' ? first.currency : undefined,
      },
      checkedAt,
    }
  } catch (err) {
    return errorResult(err, TIMEOUT_MS, checkedAt)
  }
}

export function runProviderUsage(providerId: string, apiKey: string): Promise<UsageResult> {
  switch (providerId) {
    case 'openrouter':
      return usageOpenRouter(apiKey)
    case 'deepseek':
      return usageDeepSeek(apiKey)
    default:
      return Promise.resolve(unavailable(`No usage endpoint known for ${providerId}.`))
  }
}
