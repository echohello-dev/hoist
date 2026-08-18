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
  usageRun: 'usage:run',
  gatewayList: 'gateway:list',
  gatewayApply: 'gateway:apply',
  harnessConfigShow: 'harness:configShow',
  harnessConfigSet: 'harness:configSet',
  harnessConfigReset: 'harness:configReset',
  harnessVersions: 'harness:versions',
  harnessUninstall: 'harness:uninstall',
  clipboardRead: 'clipboard:read',
  libraryList: 'library:list',
} as const

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS]
