import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { store } from './store'
import { DouyinAutomation } from './automation'
import { initScheduler, reschedule } from './scheduler'

// 开启远程调试端口，允许 Playwright 连接到 Electron 的内置浏览器
app.commandLine.appendSwitch('remote-debugging-port', '8315')

const automation = new DouyinAutomation()

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    automation.initView(mainWindow)
  })

  // Listen to window resize to adjust the embedded douyin view
  mainWindow.on('resize', () => {
    automation.updateBounds()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Set up IPC
  ipcMain.handle('store:get', () => store.get())
  ipcMain.handle('store:set', (_, data) => {
    store.set(data)
    reschedule(automation)
    return store.get()
  })

  ipcMain.handle('automation:login', async () => {
    await automation.loginAndSaveState()
  })

  ipcMain.handle('automation:getFriends', async () => {
    const friends = await automation.getFriendsList()
    store.set({ friends })
    return friends
  })

  ipcMain.handle('automation:execute', async (event, isManual: boolean) => {
    event.sender.send('automation:progress', '正在同步最新好友列表...')
    try {
      const friends = await automation.getFriendsList()
      if (friends && friends.length > 0) {
        // 不再强制清理由于网络或渲染延迟未能抓取到的好友，以防丢失选中状态
        // 只更新 friends 列表，保持 selectedFriends 状态不动
        store.set({ friends })
      }
    } catch {
      event.sender.send('automation:progress', '同步最新好友列表失败，继续执行...')
    }

    const data = store.get()
    await automation.executeStreak(
      data.selectedFriends || [],
      data.messageText,
      data.videoPath,
      data.messageType,
      isManual,
      (msg) => {
        event.sender.send('automation:progress', msg)
      }
    )

    return store.get()
  })

  ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov'] }]
    })
    if (!canceled && filePaths.length > 0) {
      return filePaths[0]
    }
    return null
  })

  ipcMain.handle('automation:showWindow', () => {
    automation.showPage()
  })

  ipcMain.handle('automation:hideWindow', () => {
    automation.hide()
  })

  ipcMain.handle('automation:logout', async () => {
    // 调用自动化引擎清除 Cookie
    await automation.logoutAndClearData()
    // 清除 store 里的好友和状态数据
    store.clear()
    return store.get()
  })

  initScheduler(automation)

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
