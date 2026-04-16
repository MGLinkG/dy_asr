import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getStore: () => ipcRenderer.invoke('store:get'),
  setStore: (data: unknown) => ipcRenderer.invoke('store:set', data),
  login: () => ipcRenderer.invoke('automation:login'),
  getFriends: () => ipcRenderer.invoke('automation:getFriends'),
  checkLogin: () => ipcRenderer.invoke('automation:checkLogin'),
  executeStreak: (isManual: boolean = false) => ipcRenderer.invoke('automation:execute', isManual),
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  showDouyinWindow: () => ipcRenderer.invoke('automation:showWindow'),
  hideDouyinWindow: () => ipcRenderer.invoke('automation:hideWindow'),
  logout: () => ipcRenderer.invoke('automation:logout'),
  onProgress: (callback: (msg: string) => void) => {
    ipcRenderer.removeAllListeners('automation:progress')
    ipcRenderer.on('automation:progress', (_event, msg) => callback(msg))
  },
  stopAutomation: () => {
    ipcRenderer.invoke('automation:stop')
  },
  onRoute: (callback: (route: string) => void) => {
    ipcRenderer.removeAllListeners('automation:route')
    ipcRenderer.on('automation:route', (_event, route) => callback(route))
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
