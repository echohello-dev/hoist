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
    install: (id) => ipcRenderer.invoke(CHANNELS.harnessInstall, id),
  },
  provider: {
    list: () => ipcRenderer.invoke(CHANNELS.providerList),
  },
  probe: {
    run: (req) => ipcRenderer.invoke(CHANNELS.probeRun, req),
  },
}

contextBridge.exposeInMainWorld('hoist', api)
