import { chromium, Browser, Page } from 'playwright-core'
import { BrowserWindow, WebContentsView } from 'electron'

export class DouyinAutomation {
  public botView: WebContentsView | null = null
  private mainWindow: BrowserWindow | null = null
  private mode: 'hidden' | 'page' = 'hidden'
  private sidebarWidth = 260

  constructor() {}

  public initView(mainWindow: BrowserWindow) {
    if (this.botView) return
    this.mainWindow = mainWindow

    this.botView = new WebContentsView({
      webPreferences: {
        partition: 'persist:douyin',
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    // Remove bot fingerprint
    const ua = this.botView.webContents.getUserAgent()
      .replace(/Electron\/[\d\.]+ /, '')
      .replace(/douyin-auto-streak\/[\d\.]+ /, '')
    this.botView.webContents.setUserAgent(ua)

    // Load Douyin
    this.botView.webContents.loadURL('https://www.douyin.com/chat')
  }

  public setSidebarWidth(width: number) {
    if (Number.isFinite(width) && width > 0) {
      this.sidebarWidth = Math.floor(width)
    }
    this.updateBounds()
  }

  public showPage() {
    // Show the page view
    this.mode = 'page'
    if (!this.mainWindow || !this.botView) return
    if (!this.mainWindow.contentView.children.includes(this.botView)) {
      this.mainWindow.contentView.addChildView(this.botView)
    }
    this.updateBounds()
  }

  public hide() {
    this.mode = 'hidden'
    if (!this.mainWindow || !this.botView) return
    if (this.mainWindow.contentView.children.includes(this.botView)) {
      this.mainWindow.contentView.removeChildView(this.botView)
    }
  }

  public updateBounds() {
    if (!this.mainWindow || !this.botView) return
    if (this.mode === 'hidden') return
    const bounds = this.mainWindow.getBounds()
    const x = Math.min(this.sidebarWidth, bounds.width)
    const width = Math.max(bounds.width - x, 0)
    this.botView.setBounds({ x, y: 0, width, height: bounds.height })
  }

  private async getPlaywrightPage(): Promise<{ browser: Browser, page: Page }> {
    const browser = await chromium.connectOverCDP('http://localhost:8315')
    const contexts = browser.contexts()
    
    for (const ctx of contexts) {
      const page = ctx.pages().find(p => p.url().includes('douyin.com'))
      if (page) return { browser, page }
    }
    
    this.botView?.webContents.loadURL('https://www.douyin.com/chat')
    await new Promise(r => setTimeout(r, 5000))
    const contexts2 = browser.contexts()
    for (const ctx of contexts2) {
      const page = ctx.pages().find(p => p.url().includes('douyin.com'))
      if (page) return { browser, page }
    }

    throw new Error('无法连接到内嵌的抖音页面，请检查网络或重试。')
  }

  public async logoutAndClearData(): Promise<void> {
    if (this.botView) {
      // 清除持久化分区里的所有数据（Cookies, LocalStorage 等）
      await this.botView.webContents.session.clearStorageData()
      // 重新加载登录页面
      this.botView.webContents.loadURL('https://www.douyin.com/chat')
    }
  }

  public async getFriendsList(): Promise<Array<{name: string, id: string, avatar: string}>> {
    if (!this.botView) throw new Error('Bot view not initialized')
    const { browser, page } = await this.getPlaywrightPage()

    try {
      await page.goto('https://www.douyin.com/chat')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(3000)
      
      const friends = await page.evaluate(() => {
        const result: any[] = []
        // Douyin web chat item commonly has a class containing "ConversationItem"
        const items = document.querySelectorAll('[class*="conversationConversationItemwrapper"]')
        items.forEach(item => {
          // Look for title/name
          const nameEl = item.querySelector('[class*="conversationConversationItemtitle"]')
          // Look for avatar image
          const avatarEl = item.querySelector('img')
          
          if (nameEl) {
            const rawName = (nameEl as HTMLElement).innerText.trim()
            const parts = rawName.split('\n')
            const nameStr = parts[0].trim()
            const dateStr = parts.length > 1 ? parts[1].trim() : ''
            
            result.push({
              name: nameStr,
              id: nameStr,
              date: dateStr,
              avatar: avatarEl ? avatarEl.src : ''
            })
          }
        })
        return result
      })

      return friends
    } finally {
      // 仅断开 CDP 连接，不关闭真实窗口
      await browser.close()
    }
  }

  private async ensureNoCaptcha(page: Page, log: (msg: string) => void): Promise<void> {
    const captcha = page.locator('#captcha_container')
    if (await captcha.count() > 0 && await captcha.isVisible()) {
      log('检测到验证码弹窗，等待用户手动处理...')
      this.showPage()
      // 等待验证码消失，最长 60 秒
      await captcha.waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {})
      await page.waitForTimeout(2000)
      log('验证码已处理或已消失。')
    }
  }

  public async executeStreak(selectedFriends: string[], messageText: string, videoPath: string, type: 'text' | 'video', isManual: boolean = false, onProgress?: (msg: string) => void): Promise<void> {
    if (!this.botView) throw new Error('Bot view not initialized')
    if (isManual) {
      this.showPage()
    }

    const log = (msg: string) => {
      console.log(msg)
      if (onProgress) onProgress(msg)
    }

    log('正在连接到抖音页面...')
    const { browser, page } = await this.getPlaywrightPage()

    try {
      log('正在加载聊天列表...')
      await page.goto('https://www.douyin.com/chat')
      try {
        await page.waitForSelector('[class*="conversationConversationItemwrapper"]', { timeout: 15000 })
      } catch (e) {
        log('警告：等待好友列表加载超时，请检查网络。')
      }
      await page.waitForTimeout(2000)
      
      for (const friendName of selectedFriends) {
        log(`准备向好友 [${friendName}] 发送消息...`)
        // Click on friend in list
        const friendElements = await page.$$('[class*="conversationConversationItemwrapper"]')
        let foundFriend = false
        
        for (const el of friendElements) {
          const nameEl = await el.$('[class*="conversationConversationItemtitle"]')
          if (nameEl) {
            const rawName = await nameEl.innerText()
            const name = rawName.split('\n')[0].trim()
            // 精确匹配去掉前后空格
            if (name === friendName.split('\n')[0].trim()) {
              // 点击整个 wrapper 元素
              await el.click({ force: true })
              foundFriend = true
              break
            }
          }
        }
        
        if (!foundFriend) {
          log(`尝试向下滚动查找好友: ${friendName}...`)
          // hover on the first friend and scroll down
          if (friendElements.length > 0) {
            await friendElements[0].hover()
            for (let i = 0; i < 10; i++) {
              await page.mouse.wheel(0, 1500)
              await page.waitForTimeout(1000)
              
              const newElements = await page.$$('[class*="conversationConversationItemwrapper"]')
              for (const el of newElements) {
                const nameEl = await el.$('[class*="conversationConversationItemtitle"]')
                if (nameEl) {
                  const rawName = await nameEl.innerText()
                  const name = rawName.split('\n')[0].trim()
                  if (name === friendName.split('\n')[0].trim()) {
                    await el.click({ force: true })
                    foundFriend = true
                    break
                  }
                }
              }
              if (foundFriend) break
            }
          }
        }

        if (!foundFriend) {
          log(`未在当前聊天列表中找到选中好友: ${friendName}，将跳过。`)
          continue
        }
        
        // 等待右侧聊天面板加载出来
        log(`等待聊天面板加载...`)
        try {
          await page.waitForSelector('.public-DraftEditor-content, [contenteditable="true"], [data-e2e="chat-text-input"], [data-e2e="msg-input"], textarea[placeholder*="发送消息"]', { timeout: 10000 })
        } catch (e) {
          log(`警告：等待输入框超时，页面可能未响应。`)
        }
        await page.waitForTimeout(1000)

        if (type === 'text') {
          log(`正在输入文本内容...`)
          let input = page.locator('.public-DraftEditor-content, [contenteditable="true"]')
          if (await input.count() === 0) {
            input = page.locator('[data-e2e="chat-text-input"]')
          }
          if (await input.count() === 0) {
            input = page.locator('[data-e2e="msg-input"]')
          }
          if (await input.count() === 0) {
            input = page.locator('textarea[placeholder*="发送消息"]')
          }
          
          if (await input.count() > 0) {
            const editor = input.first()
            try {
              await editor.click({ force: true })
              
              // 清空内容（全选+删除）
              await editor.press('Meta+a')
              await editor.press('Backspace')
              
              // 使用 insertText，对包含中文的字符串能更稳定地触发完整字符输入
              await page.keyboard.insertText(messageText)
              
              await page.waitForTimeout(500)
              
              // 在编辑器元素上直接触发回车，比全局键盘按键更精准
              await editor.press('Enter', { delay: 100 })
              await page.waitForTimeout(500)
              
              // 寻找真实的发送按钮并点击（作为补充手段）
              const sendBtn = page.locator('.send-button, [aria-label*="发送"], [class*="send-btn"], [data-e2e="chat-send-btn"]')
              if (await sendBtn.count() > 0) {
                try {
                  await sendBtn.first().click({ force: true, timeout: 1000 })
                } catch (e) {}
              }
              
              // 发送后检查是否有验证码
              const captcha = page.locator('#captcha_container')
              if (await captcha.count() > 0 && await captcha.isVisible()) {
                await this.ensureNoCaptcha(page, log)
                log('验证码处理完毕，尝试重新发送...')
                await editor.click({ force: true }).catch(() => {})
                await page.waitForTimeout(500)
                await editor.press('Enter', { delay: 100 })
                await page.waitForTimeout(500)
                if (await sendBtn.count() > 0) {
                  try {
                    await sendBtn.first().click({ force: true, timeout: 1000 })
                  } catch (e) {}
                }
              }
              
              log(`好友 [${friendName}] 发送完成！`)
            } catch (e) {
              log(`Failed to interact with input for ${friendName}: ${e}`)
            }
          } else {
            log(`Could not find chat input for ${friendName}`)
          }
        } else if (type === 'video' && videoPath) {
          log(`正在上传视频文件...`)
          let fileInput = page.locator('input[type="file"]')
          if (await fileInput.count() === 0) {
            fileInput = page.locator('input[accept*="video"]')
          }
          
          if (await fileInput.count() > 0) {
            await fileInput.setInputFiles(videoPath)
            await page.waitForTimeout(3000)
            await page.keyboard.press('Enter')
            
            // 补充点击发送按钮
            const sendBtn = page.locator('.send-button, [aria-label*="发送"], [class*="send-btn"], [data-e2e="chat-send-btn"]')
            if (await sendBtn.count() > 0) {
              try { await sendBtn.first().click({ force: true, timeout: 1000 }) } catch (e) {}
            }
            
            const captcha = page.locator('#captcha_container')
            if (await captcha.count() > 0 && await captcha.isVisible()) {
              await this.ensureNoCaptcha(page, log)
              log('验证码处理完毕，尝试重新发送视频...')
              await page.keyboard.press('Enter')
            }
            
            log(`好友 [${friendName}] 视频发送完成！`)
          } else {
            log(`Could not find file input for ${friendName}`)
          }
        }
        
        // 最后再检查一次是否有遗留验证码
        await this.ensureNoCaptcha(page, log)

        await page.waitForTimeout(5000) // prevent rate limit
      }
    } finally {
      // 仅断开 CDP 连接，不关闭真实窗口
      await browser.close()
      log('全部任务执行完毕')
    }
  }
}
