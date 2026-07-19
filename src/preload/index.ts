import { contextBridge, ipcRenderer } from 'electron'
import type { HoistAPI } from '../shared/types'

const api: HoistAPI = {
  platform: process.platform,
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
}

contextBridge.exposeInMainWorld('hoist', api)
