export const CHANNELS = {
  vaultList: 'vault:list',
  vaultSet: 'vault:set',
  vaultDelete: 'vault:delete',
  vaultCopy: 'vault:copy',
  harnessList: 'harness:list',
  harnessDiscover: 'harness:discover',
  harnessInstall: 'harness:install',
  providerList: 'provider:list',
  probeRun: 'probe:run',
} as const

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS]
