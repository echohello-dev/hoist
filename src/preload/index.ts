import { contextBridge, ipcRenderer } from 'electron'
import type { WeldableAPI } from '../shared/types'

const api: WeldableAPI = {
  platform: process.platform,
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
}

contextBridge.exposeInMainWorld('weldable', api)
