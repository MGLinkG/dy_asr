import { chromium, Browser, Page } from 'playwright-core'
import { BrowserWindow, WebContentsView } from 'electron'

type FriendItem = {
  name: string
  id: string
  avatar: string
  date?: string
  streak?: number
  disappearing?: string
}

export class DouyinAutomation {
  public botView: WebContentsView | null = null
  public mainWindow: BrowserWindow | null = null
  private mode: 'hidden' | 'page' = 'hidden'
  private sidebarWidth = 260
  private isAborted = false

  public initView(mainWindow: BrowserWindow): void {
    if (this.botView) return
    this.mainWindow = mainWindow

    this.botView = new WebContentsView({
      webPreferences: {
        partition: 'persist:douyin',
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    // 伪装成标准的 Chrome 浏览器，防止被抖音的反爬虫机制拦截导致无限加载
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    this.botView.webContents.setUserAgent(ua)

    // 隐藏 WebDriver 属性，防止被抖音安全策略识别为自动化脚本而一直卡在加载页面
    this.botView.webContents.executeJavaScript(`
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    `)

    // 允许抖音页面内的第三方登录弹窗正常弹出（否则默认会被 Electron 拦截导致无响应）
    this.botView.webContents.setWindowOpenHandler(() => {
      // 也可以选择在内部弹出一个临时小窗口：
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 800,
          height: 600,
          autoHideMenuBar: true,
          webPreferences: {
            partition: 'persist:douyin'
          }
        }
      }
    })

    // 抖音新版网页策略：如果在未登录状态下直接访问 /chat，会卡死在骨架屏且不会弹出登录框。
    // 因此默认初始页面必须加载首页（www.douyin.com），首页会自动弹出登录框
    this.botView.webContents.loadURL('https://www.douyin.com/')
  }

  public setSidebarWidth(width: number): void {
    if (Number.isFinite(width) && width > 0) {
      this.sidebarWidth = Math.floor(width)
    }
    this.updateBounds()
  }

  public showPage(): void {
    // Show the page view
    this.mode = 'page'
    if (!this.mainWindow || !this.botView) return
    if (!this.mainWindow.contentView.children.includes(this.botView)) {
      this.mainWindow.contentView.addChildView(this.botView)
    }
    this.updateBounds()
  }

  public hide(): void {
    this.mode = 'hidden'
    if (!this.mainWindow || !this.botView) return
    if (this.mainWindow.contentView.children.includes(this.botView)) {
      this.mainWindow.contentView.removeChildView(this.botView)
    }
  }

  public updateBounds(): void {
    if (!this.mainWindow || !this.botView) return
    if (this.mode === 'hidden') return
    // 使用 getContentBounds 获取实际内容区域，避免包含标题栏导致页面错位
    const bounds = this.mainWindow.getContentBounds()
    const x = Math.min(this.sidebarWidth, bounds.width)
    const width = Math.max(bounds.width - x, 0)
    this.botView.setBounds({ x, y: 0, width, height: bounds.height })
  }

  private async getPlaywrightPage(): Promise<{ browser: Browser; page: Page }> {
    const browser = await chromium.connectOverCDP('http://localhost:8315')
    const contexts = browser.contexts()

    for (const ctx of contexts) {
      const page = ctx.pages().find((p) => p.url().includes('douyin.com'))
      if (page) return { browser, page }
    }

    this.botView?.webContents.loadURL('https://www.douyin.com/')
    await new Promise((r) => setTimeout(r, 5000))
    const contexts2 = browser.contexts()
    for (const ctx of contexts2) {
      const page = ctx.pages().find((p) => p.url().includes('douyin.com'))
      if (page) return { browser, page }
    }

    throw new Error('无法连接到内嵌的抖音页面，请检查网络或重试。')
  }

  public async logoutAndClearData(): Promise<void> {
    if (this.botView) {
      // 清除持久化分区里的所有数据（Cookies, LocalStorage 等）
      await this.botView.webContents.session.clearStorageData()
      // 重新加载首页触发重新登录
      this.botView.webContents.loadURL('https://www.douyin.com/')
    }
  }

  public stop(): void {
    this.isAborted = true
  }

  public async loginAndSaveState(): Promise<void> {
    this.showPage()
    // 强制跳转到首页，触发未登录时的扫码登录框
    if (this.botView) {
      // 通过设置 referer 等方式进一步防止反爬
      this.botView.webContents.loadURL('https://www.douyin.com/', {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      })
    }
  }

  public async checkIsLoggedIn(): Promise<boolean> {
    if (!this.botView) return false
    const cookies = await this.botView.webContents.session.cookies.get({ domain: '.douyin.com' })
    // 只有 sessionid_ss 或 sessionid 存在才代表真正登录了账号
    // passport_csrf_token 等是游客也会分配的，绝对不能用作登录态判定！
    const sessionCookie = cookies.find((c) => c.name === 'sessionid' || c.name === 'sessionid_ss')
    return !!sessionCookie
  }

  public async getFriendsList(): Promise<FriendItem[]> {
    if (!this.botView) throw new Error('Bot view not initialized')

    // 如果未登录，尝试让用户去登录而不是直接抛出死锁异常
    const isLoggedIn = await this.checkIsLoggedIn()
    if (!isLoggedIn) {
      throw new Error('未登录抖音，请先完成扫码登录。')
    }

    // 【核心修复】由于获取列表需要模拟滚动触发前端的懒加载机制（IntersectionObserver），
    // 如果窗口处于 hidden 状态，懒加载将永远不会触发。
    // 所以必须在抓取前将页面显示出来，抓取完后再恢复。
    const wasHidden = this.mode === 'hidden'
    if (wasHidden) {
      this.showPage()
    }

    const { browser, page } = await this.getPlaywrightPage()

    try {
      await page.goto('https://www.douyin.com/chat')
      try {
        await page.waitForSelector('[class*="conversationConversationItemwrapper"]', {
          timeout: 15000
        })
      } catch {
        console.log('警告：等待好友列表加载超时，请检查网络。')
      }
      await page.waitForTimeout(2000)

      const friendsMap = new Map<string, FriendItem>()
      let previousCount = 0
      let noNewItemsCount = 0

      // 必须通过真实 DOM 的 scrollTop 步进滚动，否则无法触发懒加载
      for (let i = 0; i < 50; i++) {
        const currentBatch = await page.evaluate((): FriendItem[] => {
          const result: FriendItem[] = []
          const elements = document.querySelectorAll(
            '[class*="conversationConversationItemwrapper"]'
          )
          elements.forEach((item): void => {
            const nameEl =
              item.querySelector('[class*="conversationConversationItemtitleWrapper"]') ||
              item.querySelector('[class*="conversationConversationItemtitle"]')
            const avatarEl = item.querySelector('img')

            if (nameEl) {
              // 只提取真正的名称节点，防止包含右侧的数字和时间
              const titleNode = nameEl.querySelector('.conversationConversationItemtitle') || nameEl
              const nameStr = (titleNode as HTMLElement).innerText.trim().split('\n')[0].trim()

              // 获取时间 (例如："11分钟前", "昨天", "01/26")
              let dateStr = ''
              const timeEl = item.querySelector('[class*="timeStr"]')
              if (timeEl) {
                dateStr = (timeEl as HTMLElement).innerText.trim()
              }

              // 获取火花天数或消失状态
              let streakNum = 0
              let disappearing = ''
              const streakEl = item.querySelector('[class*="commonStreaknormalText"]')
              if (streakEl) {
                const text = (streakEl as HTMLElement).innerText.trim()
                // 检查是否包含"消失"字样
                if (text.includes('消失')) {
                  disappearing = text
                } else {
                  const match = text.match(/\d+/)
                  streakNum = match ? parseInt(match[0], 10) : 0
                }
              }

              let avatarUrl = avatarEl ? avatarEl.src : ''
              if (avatarUrl.startsWith('http://')) {
                avatarUrl = avatarUrl.replace('http://', 'https://')
              }

              result.push({
                name: nameStr,
                id: nameStr,
                date: dateStr,
                streak: streakNum,
                disappearing: disappearing,
                avatar: avatarUrl
              })
            }
          })

          // 执行滚动
          const firstItem = elements[0]
          if (firstItem) {
            let el = firstItem.parentElement
            while (el) {
              const style = window.getComputedStyle(el)
              if (
                style.overflowY === 'auto' ||
                style.overflowY === 'scroll' ||
                style.overflowY === 'overlay'
              ) {
                el.scrollTop += 800 // 每次往下滚 800px
                break
              }
              el = el.parentElement
            }
          }

          return result
        })

        for (const friend of currentBatch) {
          if (friend.name && !friendsMap.has(friend.name)) {
            friendsMap.set(friend.name, friend)
          }
        }

        if (friendsMap.size === previousCount) {
          noNewItemsCount++
          if (noNewItemsCount >= 3) {
            break
          }
        } else {
          noNewItemsCount = 0
          previousCount = friendsMap.size
        }

        await page.waitForTimeout(1000)
      }

      // 滚动回顶部
      await page.evaluate((): void => {
        const firstItem = document.querySelector('[class*="conversationConversationItemwrapper"]')
        if (firstItem) {
          let el = firstItem.parentElement
          while (el) {
            const style = window.getComputedStyle(el)
            if (
              style.overflowY === 'auto' ||
              style.overflowY === 'scroll' ||
              style.overflowY === 'overlay'
            ) {
              el.scrollTop = 0
              break
            }
            el = el.parentElement
          }
        }
      })

      return Array.from(friendsMap.values())
    } finally {
      await browser.close()
      // 恢复原先的窗口状态
      if (wasHidden) {
        this.hide()
      }
    }
  }

  private async ensureNoCaptcha(page: Page, log: (msg: string) => void): Promise<void> {
    const captcha = page.locator('#captcha_container')
    if ((await captcha.count()) > 0 && (await captcha.isVisible())) {
      log('检测到验证码弹窗，等待用户手动处理...')
      this.showPage()
      // 等待验证码消失，最长 60 秒
      await captcha.waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {})
      await page.waitForTimeout(2000)
      log('验证码已处理或已消失。')
    }
  }

  public async executeStreak(
    selectedFriends: string[],
    messageText: string,
    videoPath: string,
    type: 'text' | 'video',
    isManual: boolean = false,
    onProgress?: (msg: string) => void
  ): Promise<void> {
    if (!this.botView) throw new Error('Bot view not initialized')

    const isLoggedIn = await this.checkIsLoggedIn()
    if (!isLoggedIn) {
      throw new Error('未登录抖音，请先完成扫码登录。')
    }

    if (isManual) {
      this.showPage()
    }

    const log = (msg: string): void => {
      console.log(msg)
      if (onProgress) onProgress(msg)
    }

    this.isAborted = false

    log('正在连接到抖音页面...')
    const { browser, page } = await this.getPlaywrightPage()

    try {
      log('正在加载聊天列表...')
      await page.goto('https://www.douyin.com/chat')
      try {
        await page.waitForSelector('[class*="conversationConversationItemwrapper"]', {
          timeout: 15000
        })
      } catch {
        log('警告：等待好友列表加载超时，请检查网络。')
      }
      await page.waitForTimeout(2000)

      for (const friendName of selectedFriends) {
        if (this.isAborted) {
          log('【任务已终止】用户已强制停止了执行任务。')
          break
        }

        const targetFriendName = friendName.split('\n')[0].trim()
        log(`准备向好友 [${targetFriendName}] 发送消息...`)

        // 每次寻找新好友前，先将列表滚动回顶部，防止因为上一个好友在底部导致找不到上面的好友
        await page.evaluate((): void => {
          const firstItem = document.querySelector('[class*="conversationConversationItemwrapper"]')
          if (firstItem) {
            let el = firstItem.parentElement
            while (el) {
              const style = window.getComputedStyle(el)
              if (
                style.overflowY === 'auto' ||
                style.overflowY === 'scroll' ||
                style.overflowY === 'overlay'
              ) {
                el.scrollTop = 0
                break
              }
              el = el.parentElement
            }
          }
        })
        await page.waitForTimeout(1000)

        // Click on friend in list
        const friendElements = await page.$$('[class*="conversationConversationItemwrapper"]')
        let foundFriend = false

        // 辅助函数：由于抖音对过长的群聊名字会加上省略号，这里做一个容错的包含匹配
        const isNameMatch = (n1: string, n2: string): boolean => {
          const s1 = n1
            .replace(/\u00A0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          const s2 = n2
            .replace(/\u00A0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          if (s1 === s2) return true
          const base1 = s1
            .replace(/\.\.\.$/, '')
            .replace(/\(\d+\)$/, '')
            .trim()
          const base2 = s2
            .replace(/\.\.\.$/, '')
            .replace(/\(\d+\)$/, '')
            .trim()
          return base1.includes(base2) || base2.includes(base1)
        }

        for (const el of friendElements) {
          const nameEl = await el.$('[class*="conversationConversationItemtitle"]')
          if (nameEl) {
            const rawName = await nameEl.innerText()
            const name = rawName.split('\n')[0].trim()
            if (isNameMatch(name, targetFriendName)) {
              await el.scrollIntoViewIfNeeded().catch(() => {})
              await page.waitForTimeout(300)
              try {
                await el.click({ timeout: 1500 })
              } catch {
                await el.click({ force: true })
              }
              foundFriend = true
              break
            }
          }
        }

        if (!foundFriend) {
          log(`尝试向下滚动查找好友: ${targetFriendName}...`)
          // 纯 JS 步进滚动，比鼠标滚轮更稳定，且能触发懒加载
          for (let i = 0; i < 30; i++) {
            if (this.isAborted) break

            await page.evaluate((): void => {
              const firstItem = document.querySelector(
                '[class*="conversationConversationItemwrapper"]'
              )
              if (firstItem) {
                let el = firstItem.parentElement
                while (el) {
                  const style = window.getComputedStyle(el)
                  if (
                    style.overflowY === 'auto' ||
                    style.overflowY === 'scroll' ||
                    style.overflowY === 'overlay'
                  ) {
                    el.scrollTop += 800
                    break
                  }
                  el = el.parentElement
                }
              }
            })
            await page.waitForTimeout(1000)

            const newElements = await page.$$('[class*="conversationConversationItemwrapper"]')
            for (const el of newElements) {
              const nameEl = await el.$('[class*="conversationConversationItemtitle"]')
              if (nameEl) {
                const rawName = await nameEl.innerText()
                const name = rawName.split('\n')[0].trim()
                if (isNameMatch(name, targetFriendName)) {
                  await el.scrollIntoViewIfNeeded().catch(() => {})
                  await page.waitForTimeout(300)
                  try {
                    await el.click({ timeout: 1500 })
                  } catch {
                    await el.click({ force: true })
                  }
                  foundFriend = true
                  break
                }
              }
            }
            if (foundFriend) break
          }
        }

        if (!foundFriend) {
          log(`未在当前聊天列表中找到选中好友: ${targetFriendName}，将跳过。`)
          continue
        }

        // 等待右侧聊天面板加载出来
        log(`等待聊天面板加载...`)
        try {
          await page.waitForSelector(
            '.public-DraftEditor-content, [contenteditable="true"], [data-e2e="chat-text-input"], [data-e2e="msg-input"], textarea[placeholder*="发送消息"]',
            { timeout: 10000 }
          )
        } catch {
          log(`警告：等待输入框超时，页面可能未响应。`)
        }
        await page.waitForTimeout(1000)

        // 【关键安全拦截】验证右侧打开的聊天窗口名字是否匹配，防止点击失败导致发送给上一个好友
        let isSafeToSend = false
        try {
          // 等待顶部的名字更新为目标好友的名字，超时时间 5 秒
          await page.waitForFunction(
            (expectedName): boolean => {
              const el = document.querySelector('[class*="RightPanelHeadertitle"]')
              if (!el) return false
              const text = (el as HTMLElement).innerText.trim()
              const name = text.split('\n')[0].trim()

              const s1 = name
                .replace(/\u00A0/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
              const s2 = expectedName
                .replace(/\u00A0/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
              if (s1 === s2) return true
              const base1 = s1
                .replace(/\.\.\.$/, '')
                .replace(/\(\d+\)$/, '')
                .trim()
              const base2 = s2
                .replace(/\.\.\.$/, '')
                .replace(/\(\d+\)$/, '')
                .trim()
              return base1.includes(base2) || base2.includes(base1)
            },
            targetFriendName,
            { timeout: 5000 }
          )
          isSafeToSend = true
        } catch {
          const headerLocator = page.locator('[class*="RightPanelHeadertitle"]').first()
          if ((await headerLocator.count()) > 0) {
            const currentTitle = await headerLocator.innerText()
            const name = currentTitle.split('\n')[0].trim()
            if (isNameMatch(name, targetFriendName)) {
              isSafeToSend = true
            } else {
              log(
                `【严重安全拦截】当前打开的窗口（${name}）不是目标好友（${targetFriendName}），阻止发送防错乱！`
              )
            }
          } else {
            log(`【安全警告】未能找到聊天窗口的标题元素，尝试继续发送，请注意观察是否发错人。`)
            isSafeToSend = true
          }
        }

        if (!isSafeToSend) {
          continue
        }

        if (type === 'text') {
          log(`正在输入文本内容...`)
          let input = page.locator('.public-DraftEditor-content, [contenteditable="true"]')
          if ((await input.count()) === 0) {
            input = page.locator('[data-e2e="chat-text-input"]')
          }
          if ((await input.count()) === 0) {
            input = page.locator('[data-e2e="msg-input"]')
          }
          if ((await input.count()) === 0) {
            input = page.locator('textarea[placeholder*="发送消息"]')
          }

          if ((await input.count()) > 0) {
            const editor = input.first()
            try {
              await editor.click({ force: true })

              // 清空内容（全选+删除）
              const isMac = process.platform === 'darwin'
              await editor.press(isMac ? 'Meta+a' : 'Control+a')
              await editor.press('Backspace')

              // 使用纯 DOM ClipboardEvent 模拟真实的粘贴行为
              // 完美兼容 Draft.js/Slate 的多行文本和中文输入，不依赖系统剪贴板，不触发安全限制
              await editor.evaluate((el, text) => {
                const dt = new DataTransfer()
                dt.setData('text/plain', text)
                const pasteEvent = new ClipboardEvent('paste', {
                  clipboardData: dt,
                  bubbles: true,
                  cancelable: true
                })
                el.dispatchEvent(pasteEvent)
              }, messageText)

              await page.waitForTimeout(500)

              // 触发一个真实的按键事件来激活 React 的状态（防按钮置灰）
              await page.keyboard.press('Space')
              await page.waitForTimeout(100)
              await page.keyboard.press('Backspace')
              await page.waitForTimeout(300)

              // 在编辑器元素上直接触发回车发送
              await editor.press('Enter', { delay: 100 })
              await page.waitForTimeout(500)

              // 寻找真实的发送按钮并点击（作为补充手段）
              const sendBtn = page.locator(
                '.send-button, [aria-label*="发送"], [class*="send-btn"], [data-e2e="chat-send-btn"]'
              )
              if ((await sendBtn.count()) > 0) {
                await sendBtn
                  .first()
                  .click({ force: true, timeout: 1000 })
                  .catch(() => {})
              }

              // 发送后检查是否有验证码
              const captcha = page.locator('#captcha_container')
              if ((await captcha.count()) > 0 && (await captcha.isVisible())) {
                await this.ensureNoCaptcha(page, log)
                log('验证码处理完毕，尝试重新发送...')
                await editor.click({ force: true }).catch(() => {})
                await page.waitForTimeout(500)
                await editor.press('Enter', { delay: 100 })
                await page.waitForTimeout(500)
                if ((await sendBtn.count()) > 0) {
                  await sendBtn
                    .first()
                    .click({ force: true, timeout: 1000 })
                    .catch(() => {})
                }
              }

              log(`好友 [${targetFriendName}] 发送完成！`)
            } catch (e) {
              log(`Failed to interact with input for ${targetFriendName}: ${e}`)
            }
          } else {
            log(`Could not find chat input for ${targetFriendName}`)
          }
        } else if (type === 'video' && videoPath) {
          log(`正在上传视频文件...`)
          let fileInput = page.locator('input[type="file"]')
          if ((await fileInput.count()) === 0) {
            fileInput = page.locator('input[accept*="video"]')
          }

          if ((await fileInput.count()) > 0) {
            await fileInput.setInputFiles(videoPath)
            await page.waitForTimeout(3000)
            await page.keyboard.press('Enter')

            // 补充点击发送按钮
            const sendBtn = page.locator(
              '.send-button, [aria-label*="发送"], [class*="send-btn"], [data-e2e="chat-send-btn"]'
            )
            if ((await sendBtn.count()) > 0) {
              await sendBtn
                .first()
                .click({ force: true, timeout: 1000 })
                .catch(() => {})
            }

            const captcha = page.locator('#captcha_container')
            if ((await captcha.count()) > 0 && (await captcha.isVisible())) {
              await this.ensureNoCaptcha(page, log)
              log('验证码处理完毕，尝试重新发送视频...')
              await page.keyboard.press('Enter')
            }

            log(`好友 [${targetFriendName}] 视频发送完成！`)
          } else {
            log(`Could not find file input for ${targetFriendName}`)
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
