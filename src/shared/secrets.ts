/** Canonical vault secret id for a provider API key (shared with CLI convention). */
export function secretIdForProvider(providerId: string): string {
  return `provider:${providerId}:api_key`
}

/** Extract provider id from a vault secret id, if it matches the convention. */
export function providerIdFromSecretId(secretId: string): string | null {
  const m = /^provider:([^:]+):api_key$/.exec(secretId)
  return m ? m[1] : null
}

/** Non-credential config a provider probe needs, stored beside the API key. */
export type ProviderConfigField = 'project' | 'region'

/** Canonical vault secret id for a provider config field, for example `provider:vertex:project`. */
export function secretIdForProviderConfig(providerId: string, field: ProviderConfigField): string {
  return `provider:${providerId}:${field}`
}

/** Extract provider id and field from a provider config secret id, if it matches. */
export function providerConfigFromSecretId(
  secretId: string,
): { providerId: string; field: ProviderConfigField } | null {
  const m = /^provider:([^:]+):(project|region)$/.exec(secretId)
  return m ? { providerId: m[1], field: m[2] as ProviderConfigField } : null
}

/** True when the secret id holds provider config, not a credential. */
export function isProviderConfigSecretId(secretId: string): boolean {
  return providerConfigFromSecretId(secretId) !== null
}
