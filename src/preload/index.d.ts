import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  type FriendItem = {
    name: string
    id: string
    avatar: string
    date?: string
    streak?: number
    disappearing?: string
  }

  type StoreData = {
    friends: FriendItem[]
    selectedFriends: string[]
    cronExpression: string
    isScheduleEnabled: boolean
    messageType: 'text' | 'video'
    messageText: string
    videoPath: string
  }

  interface Window {
    electron: ElectronAPI
    api: {
      getStore: () => Promise<StoreData>
      setStore: (data: Partial<StoreData>) => Promise<StoreData>
      login: () => Promise<void>
      getFriends: () => Promise<FriendItem[]>
      executeStreak: (isManual?: boolean) => Promise<StoreData>
      openFile: () => Promise<string | null>
      showDouyinWindow: () => Promise<void>
      hideDouyinWindow: () => Promise<void>
      logout: () => Promise<StoreData>
      onProgress: (callback: (msg: string) => void) => void
      onRoute: (callback: (route: string) => void) => void
    }
  }
}
