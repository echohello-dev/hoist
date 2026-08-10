import { contextBridge, ipcRenderer } from 'electron'
import type { HoistAPI } from './api'
import { CHANNELS } from '../shared/channels'

const api: HoistAPI = {
  platform: process.platform,
  vault: {
    list: () => ipcRenderer.invoke(CHANNELS.vaultList),
    set: (req) => ipcRenderer.invoke(CHANNELS.vaultSet, req),
    delete: (id) => ipcRenderer.invoke(CHANNELS.vaultDelete, id),
    copy: (id) => ipcRenderer.invoke(CHANNELS.vaultCopy, id),
  },
  harness: {
    list: () => ipcRenderer.invoke(CHANNELS.harnessList),
    discover: () => ipcRenderer.invoke(CHANNELS.harnessDiscover),
    install: (req) => ipcRenderer.invoke(CHANNELS.harnessInstall, req),
    uninstall: (req) => ipcRenderer.invoke(CHANNELS.harnessUninstall, req),
    versions: (req) => ipcRenderer.invoke(CHANNELS.harnessVersions, req),
    configShow: (id) => ipcRenderer.invoke(CHANNELS.harnessConfigShow, id),
    configSet: (req) => ipcRenderer.invoke(CHANNELS.harnessConfigSet, req),
    configReset: (req) => ipcRenderer.invoke(CHANNELS.harnessConfigReset, req),
  },
  provider: {
    list: () => ipcRenderer.invoke(CHANNELS.providerList),
  },
  gateway: {
    list: () => ipcRenderer.invoke(CHANNELS.gatewayList),
    apply: (req) => ipcRenderer.invoke(CHANNELS.gatewayApply, req),
  },
  probe: {
    run: (req) => ipcRenderer.invoke(CHANNELS.probeRun, req),
  },
  clipboard: {
    read: () => ipcRenderer.invoke(CHANNELS.clipboardRead),
  },
  library: {
    list: () => ipcRenderer.invoke(CHANNELS.libraryList),
  },
}

contextBridge.exposeInMainWorld('hoist', api)
