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
  }
  provider: {
    list: () => Promise<ProviderSummary[]>
  }
  probe: {
    run: (req: ProbeRequest) => Promise<ProbeResponse>
  }
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

export interface ProviderSummary {
  id: string
  label: string
  featured?: boolean
  envKeys: string[]
  baseUrlEnv?: string
  defaultBaseUrl?: string
  notes?: string
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
