import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export interface StoreData {
  friends: Array<{
    name: string
    id: string
    avatar: string
    date?: string
    streak?: number
    disappearing?: string
  }>
  selectedFriends: string[]
  cronExpression: string
  isScheduleEnabled: boolean
  messageType: 'text' | 'video'
  messageText: string
  videoPath: string
}

const DEFAULT_DATA: StoreData = {
  friends: [],
  selectedFriends: [],
  cronExpression: '0 10 * * *', // default 10:00 AM every day
  isScheduleEnabled: false,
  messageType: 'text',
  messageText: '火花续上~',
  videoPath: ''
}

export class AppStore {
  private path: string
  private data: StoreData

  constructor() {
    this.path = path.join(app.getPath('userData'), 'config.json')
    this.data = this.read()
  }

  private read(): StoreData {
    try {
      if (fs.existsSync(this.path)) {
        const file = fs.readFileSync(this.path, 'utf-8')
        return { ...DEFAULT_DATA, ...JSON.parse(file) }
      }
    } catch (e) {
      console.error('Failed to read config', e)
    }
    return DEFAULT_DATA
  }

  public get(): StoreData {
    return this.data
  }

  public set(data: Partial<StoreData>): void {
    this.data = { ...this.data, ...data }
    try {
      fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2))
    } catch (e) {
      console.error('Failed to save config', e)
    }
  }

  public clear(): void {
    this.data = { ...DEFAULT_DATA }
    try {
      fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2))
    } catch (e) {
      console.error('Failed to clear config', e)
    }
  }
}

export const store = new AppStore()
