/** Canonical vault secret id for a provider API key (shared with CLI convention). */
export function secretIdForProvider(providerId: string): string {
  return `provider:${providerId}:api_key`
}

/** Extract provider id from a vault secret id, if it matches the convention. */
export function providerIdFromSecretId(secretId: string): string | null {
  const m = /^provider:([^:]+):api_key$/.exec(secretId)
  return m ? m[1] : null
}
