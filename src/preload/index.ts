import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getStore: () => ipcRenderer.invoke('store:get'),
  setStore: (data: any) => ipcRenderer.invoke('store:set', data),
  login: () => ipcRenderer.invoke('automation:login'),
  getFriends: () => ipcRenderer.invoke('automation:getFriends'),
  executeStreak: (isManual: boolean = false) => ipcRenderer.invoke('automation:execute', isManual),
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  showDouyinWindow: () => ipcRenderer.invoke('automation:showWindow'),
  hideDouyinWindow: () => ipcRenderer.invoke('automation:hideWindow'),
  logout: () => ipcRenderer.invoke('automation:logout'),
  onProgress: (callback: (msg: string) => void) => {
    ipcRenderer.on('automation:progress', (_event, msg) => callback(msg))
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
