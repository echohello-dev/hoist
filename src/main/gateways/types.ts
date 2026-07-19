export type GatewayAuthScheme = 'Bearer' | 'raw' | 'header-only'

export interface GatewayAuth {
  /** HTTP header name, e.g. "Authorization" or "x-api-key" */
  header: string
  /** Header value scheme */
  scheme: GatewayAuthScheme
  /** Environment variable name to read the credential from */
  envVar: string
}

export interface GatewayEndpoints {
  /** Path the gateway exposes for OpenAI-compatible chat completions */
  openai?: string
  /** Path the gateway exposes for Anthropic Messages API */
  anthropic?: string
}

export interface GatewayEntry {
  id: string
  label: string
  /**
   * Default base URL. May contain placeholders like `<account_id>` or `<your-org>`.
   * The UI surfaces these and lets the user fill them in.
   */
  baseUrl: string
  /** Hint string shown next to the base URL input (e.g. for self-host). */
  selfHostedHint?: string
  docUrl?: string
  endpoints: GatewayEndpoints
  auth: GatewayAuth
  /** How model IDs are shaped, e.g. "<provider>/<model>". */
  modelIdFormat: string
  /** Provider routes this gateway understands natively. */
  nativeProviders: string[]
  notes?: string
}
