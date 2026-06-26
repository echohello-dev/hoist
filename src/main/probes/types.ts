export type ProbeKind =
  | 'openaiModels'
  | 'anthropicModels'
  | 'geminiModels'
  | 'aws'
  | 'gcp'
  | 'azure'
  | 'none'

export type BudgetProbeKind =
  | 'openrouterKey'
  | 'deepseekBalance'
  | 'togetherOrg'
  | 'fireworksKeys'
  | 'cohereCheck'
  | 'hfWhoami'

export interface ProbeResult {
  valid: boolean
  status: 'ok' | 'invalid' | 'expired' | 'quota_exceeded' | 'error'
  detail?: string
  budgetRemaining?: number
  budgetTotal?: number
  expiresAt?: string
  checkedAt: string
}
