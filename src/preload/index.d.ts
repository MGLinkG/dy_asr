import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getStore: () => Promise<any>
      setStore: (data: any) => Promise<any>
      login: () => Promise<void>
      getFriends: () => Promise<any>
      executeStreak: (isManual?: boolean) => Promise<any>
      openFile: () => Promise<string | null>
      showDouyinWindow: () => Promise<void>
      hideDouyinWindow: () => Promise<void>
      logout: () => Promise<any>
      onProgress: (callback: (msg: string) => void) => void
    }
  }
}
