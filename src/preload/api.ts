import type { ToolInstallSpec } from '../shared/types'

export interface HoistAPI {
  platform: NodeJS.Platform
  vault: {
    list: () => Promise<VaultListResponse>
    set: (req: { id: string; value: string; label?: string }) => Promise<VaultSetResponse>
    delete: (id: string) => Promise<VaultDeleteResponse>
    copy: (id: string) => Promise<VaultCopyResponse>
  }
  harness: {
    list: () => Promise<ToolInstallSpec[]>
    discover: () => Promise<Record<string, InstalledToolSummary>>
    install: (id: string) => Promise<HarnessInstallResponse>
    configShow: (harnessId: string) => Promise<HarnessConfigView>
  }
  provider: {
    list: () => Promise<ProviderSummary[]>
  }
  gateway: {
    list: () => Promise<GatewaySummary[]>
    apply: (req: GatewayApplyRequest) => Promise<GatewayApplyResponse>
  }
  probe: {
    run: (req: ProbeRequest) => Promise<ProbeResponse>
  }
  clipboard: {
    /** Read the current clipboard text. Renderer is the only caller;
     *  the main process never invokes this opportunistically. */
    read: () => Promise<ClipboardReadResponse>
  }
  library: {
    /** Returns the catalog of harnesses with `discover()`-resolved status fields. */
    list: () => Promise<LibraryEntry[]>
  }
}

export type LibraryKind = 'harness' | 'runtime' | 'package-manager'
export type HomebrewChannel = 'formula' | 'cask' | 'node' | null

export interface LibraryInstall {
  path: string
  realPath: string
  version: string | null
  source: string
  packageManager: string | null
  homebrew: HomebrewChannel
  primary: boolean
}

export interface LibraryEntry {
  id: string
  catalogId: string
  kind: LibraryKind
  name: string
  avatar: string
  desc: string
  status: 'installed' | 'installing' | 'available' | 'failed' | 'deprecated'
  exec: string | null
  version: string | null
  path: string | null
  source: string | null
  packageManager: string | null
  homebrew: HomebrewChannel
  primary: boolean
  installs: LibraryInstall[]
  config: {
    activeModel: string | null
    provider: string | null
    authStatus: string | null
    installDir: string | null
    models: string[]
  }
}

export interface ClipboardReadResponse {
  ok: boolean
  error?: string
  /** Trimmed text if `ok`. Truncated to 4096 chars to keep IPC payloads bounded. */
  text?: string
}

export interface VaultListResponse {
  ok: boolean
  error?: string
  entries: VaultEntry[]
}

export interface VaultEntry {
  id: string
  label?: string
  preview?: string
  updatedAt?: string
}

export interface VaultSetResponse {
  ok: boolean
  error?: string
  preview?: string
}

export interface VaultDeleteResponse {
  ok: boolean
  error?: string
  removed: boolean
}

export interface VaultCopyResponse {
  ok: boolean
  error?: string
  clearedInMs?: number
}

export interface InstalledToolSummary {
  spec: ToolInstallSpec
  version: string | null
  path: string | null
  installMethod: ToolInstallSpec['installMethods'][number] | null
}

export interface HarnessInstallResponse {
  ok: boolean
  error?: string
  tool?: InstalledToolSummary
}

export interface HarnessConfigView {
  ok: boolean
  error?: string
  harnessId: string
  path?: string
  exists: boolean
  /** Excerpt of the current config relevant to hoist's wiring. */
  excerpt?: string
  /** Computed env vars hoist will write. */
  envHint?: Record<string, string>
  notes?: string[]
}

export interface ProviderSummary {
  id: string
  label: string
  featured?: boolean
  envKeys: string[]
  baseUrlEnv?: string
  defaultBaseUrl?: string
  notes?: string
}

export interface GatewaySummary {
  id: string
  label: string
  baseUrl: string
  selfHostedHint?: string
  docUrl?: string
  endpoints: { openai?: string; anthropic?: string }
  auth: { header: string; scheme: string; envVar: string }
  modelIdFormat: string
  nativeProviders: string[]
  notes?: string
  /** Placeholders in `baseUrl` the user must fill in (e.g. "<account_id>"). */
  placeholders: string[]
}

export interface GatewayApplyRequest {
  gatewayId: string | null
  providerId: string
  /** Resolved gateway base URL (placeholders filled). */
  baseUrl: string
  /** Resolved API key to inject into harnesses. */
  apiKey: string
  /** Harness ids to apply to (e.g. ["claude-code","codex","opencode"]). */
  harnessIds: string[]
  /** Display label for the config record. */
  label?: string
}

export interface HarnessWiringResult {
  harnessId: string
  harnessName: string
  ok: boolean
  error?: string
  path?: string
  note?: string
  envHint?: Record<string, string>
}

export interface GatewayApplyResponse {
  ok: boolean
  error?: string
  wiring?: HarnessWiringResult[]
  effectiveBaseUrl?: string
  unresolvedPlaceholders?: string[]
}

export interface ProbeRequest {
  providerId: string
  secretId?: string
  apiKey?: string
  baseUrl?: string
}

export interface ProbeResponse {
  ok: boolean
  error?: string
  result?: ProbeResult
}

export interface ProbeResult {
  valid: boolean
  status: 'ok' | 'invalid' | 'expired' | 'quota_exceeded' | 'error'
  detail?: string
  budgetRemaining?: number
  budgetTotal?: number
  expiresAt?: string
  checkedAt: string
}
