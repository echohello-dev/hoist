export function selectOpenAIEndpoint(gateway: { endpoints: { openai?: string } }, baseUrl: string): string {
  const suffix = gateway.endpoints.openai ?? '/'
  const cleanBase = baseUrl.replace(/\/+$/, '')
  const cleanSuffix = suffix.replace(/^\/+/, '')
  if (cleanSuffix === '') return cleanBase
  return `${cleanBase}/${cleanSuffix}`
}

export function selectAnthropicEndpoint(
  gateway: { endpoints: { anthropic?: string } },
  baseUrl: string,
): string | null {
  const suffix = gateway.endpoints.anthropic
  if (!suffix) return null
  const cleanBase = baseUrl.replace(/\/+$/, '')
  const cleanSuffix = suffix.replace(/^\/+/, '')
  return `${cleanBase}/${cleanSuffix}`
}

/**
 * For a gateway base URL that contains `<placeholders>`, raise an error
 * telling the user what they need to substitute.
 */
export function unresolvedPlaceholders(baseUrl: string): string[] {
  const m = baseUrl.match(/<([a-z_-]+)>/gi) ?? []
  return m.map((s) => s.slice(1, -1))
}
