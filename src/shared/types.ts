export interface HoistAPI {
  platform: NodeJS.Platform
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

export interface ToolInstallSpec {
  id: string
  name: string
  description: string
  installMethods: ToolInstallMethod[]
}

export type ToolInstallMethod =
  | { type: 'npm'; package: string; binary?: string }
  | { type: 'brew'; formula: string }
  | { type: 'script'; command: string }
  | { type: 'download'; url: string }

export interface InstalledTool {
  spec: ToolInstallSpec
  version: string | null
  path: string | null
  installMethod: ToolInstallMethod | null
}

export interface GatewayConfig {
  provider: string | null
  baseUrl: string | null
  apiKey: string | null
}

export interface SSOConfig {
  provider: string | null
  clientId: string | null
  issuerUrl: string | null
}
