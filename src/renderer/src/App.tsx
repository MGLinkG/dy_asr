import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const SIDEBAR_WIDTH = 260

type Route = 'dashboard' | 'schedule' | 'message' | 'douyin'

const isRoute = (val: unknown): val is Route =>
  typeof val === 'string' && ['dashboard', 'schedule', 'message', 'douyin'].includes(val)

const DEFAULT_STORE: StoreData = {
  friends: [],
  selectedFriends: [],
  cronExpression: '0 10 * * *',
  isScheduleEnabled: false,
  messageType: 'text',
  messageText: '火花续上~',
  videoPath: ''
}

export default function App() {
  const { t, i18n } = useTranslation()

  const [store, setStore] = useState<StoreData>(DEFAULT_STORE)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [route, setRoute] = useState<Route>('dashboard')
  const [localMessageText, setLocalMessageText] = useState('')
  const [localScheduleEnabled, setLocalScheduleEnabled] = useState(false)
  const [scheduleHour, setScheduleHour] = useState(10)
  const [scheduleMinute, setScheduleMinute] = useState(0)
  const [showSaveToast, setShowSaveToast] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const defaultMenuIds: Array<Route> = ['dashboard', 'schedule', 'message', 'douyin']

  const [menuOrder, setMenuOrder] = useState<Array<Route>>(() => {
    const saved = localStorage.getItem('menuOrderIds')
    if (saved) {
      try {
        const parsed: unknown = JSON.parse(saved)
        if (
          Array.isArray(parsed) &&
          parsed.length === defaultMenuIds.length &&
          parsed.every(isRoute)
        ) {
          return parsed
        }
      } catch {
        localStorage.removeItem('menuOrderIds')
      }
    }
    return defaultMenuIds
  })

  // We can map route IDs to their current translated label dynamically
  const menuItems = menuOrder.map((id) => {
    let label = ''
    switch (id) {
      case 'dashboard':
        label = t('app.menu_dashboard')
        break
      case 'schedule':
        label = t('app.menu_schedule')
        break
      case 'message':
        label = t('app.menu_message')
        break
      case 'douyin':
        label = t('app.menu_douyin')
        break
    }
    return { id, label }
  })

  const [draggedItem, setDraggedItem] = useState<string | null>(null)

  async function handleGetFriends(silent = false): Promise<void> {
    if (!silent) setLoading(true)
    setStatus(t('app.syncing'))
    try {
      const friends = await window.api.getFriends()
      if (friends && friends.length > 0) {
        // 不再自动过滤和清除不在当前列表中的已选好友，除非用户主动退出账号
        const newStore = await window.api.setStore({ friends })
        setStore(newStore)
        setStatus(t('app.sync_success', { count: friends.length }))
      } else if (!silent) {
        setStatus(t('app.sync_fail_nologin'))
      } else {
        setStatus(t('app.status_empty'))
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (!silent) setStatus(t('app.get_fail', { msg: message }))
      else setStatus(t('app.status_empty'))
    }
    if (!silent) setLoading(false)
  }

  useEffect(() => {
    window.api.getStore().then((data) => {
      setStore(data)
      setLocalMessageText(data.messageText || '')
      setLocalScheduleEnabled(data.isScheduleEnabled || false)

      if (data.cronExpression) {
        const parts = data.cronExpression.split(' ')
        if (parts.length >= 2) {
          setScheduleMinute(parseInt(parts[0]) || 0)
          setScheduleHour(parseInt(parts[1]) || 0)
        }
      }

      // 启动时判断是否已登录，已登录才自动获取好友列表
      setTimeout(async () => {
        try {
          const loggedIn = await window.api.checkLogin()
          if (loggedIn) {
            handleGetFriends(true)
          } else {
            setStatus(t('app.not_logged_in_check'))
            // 如果未登录且好友列表为空，直接显示登录提示
            if (!data.friends || data.friends.length === 0) {
              setIsLoggingIn(true)
            }
          }
        } catch (e) {
          console.error('Check login failed:', e)
        }
      }, 1000)
    })
    window.api.onProgress((msg: string) => {
      setStatus(msg)
    })

    if (window.api.onRoute) {
      window.api.onRoute((r: string) => {
        if (isRoute(r)) {
          setRoute(r)
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (route === 'douyin') {
      window.api.showDouyinWindow()
    } else {
      window.api.hideDouyinWindow()
    }
  }, [route])

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const handleLogout = async () => {
    setLoading(true)
    setStatus(t('app.logging_out'))
    try {
      const newStore = await window.api.logout()
      setStore(newStore)
      setStatus(t('app.status_empty'))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setStatus(t('app.logout_fail', { msg: message }))
    }
    setLoading(false)
    setShowLogoutConfirm(false)
  }

  const handleExecute = async () => {
    setLoading(true)
    setStatus(t('app.prepare_run'))
    setRoute('douyin') // 执行时自动切换到抖音页面
    try {
      const newStore = await window.api.executeStreak(true) // true 表示手动执行
      if (newStore) setStore(newStore)
      setStatus(t('app.run_success'))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setStatus(t('app.run_fail', { msg: message }))
    }
    setLoading(false)
  }

  const toggleFriend = async (id: string) => {
    const selected = store.selectedFriends || []
    const newSelected = selected.includes(id)
      ? selected.filter((i: string) => i !== id)
      : [...selected, id]
    const newStore = await window.api.setStore({ selectedFriends: newSelected })
    setStore(newStore)
  }

  const updateConfig = async (key: string, value: unknown) => {
    const newStore = await window.api.setStore({ [key]: value })
    setStore(newStore)
  }

  const handleSelectVideo = async () => {
    const path = await window.api.openFile()
    if (path) {
      updateConfig('videoPath', path)
    }
  }

  const handleSaveMessage = () => {
    updateConfig('messageText', localMessageText)

    setShowSaveToast(true)
    setTimeout(() => {
      setShowSaveToast(false)
    }, 2000)
  }

  const handleSaveSchedule = () => {
    const newCron = `${scheduleMinute} ${scheduleHour} * * *`
    updateConfig('cronExpression', newCron)
    updateConfig('isScheduleEnabled', localScheduleEnabled)

    setShowSaveToast(true)
    setTimeout(() => {
      setShowSaveToast(false)
    }, 2000)
  }

  const handleScheduleChange = (type: 'hour' | 'minute', value: number) => {
    let h = scheduleHour
    let m = scheduleMinute
    if (type === 'hour') h = value
    if (type === 'minute') m = value

    setScheduleHour(h)
    setScheduleMinute(m)
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItem(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (!draggedItem || draggedItem === id) return

    const oldIndex = menuOrder.indexOf(draggedItem as Route)
    const newIndex = menuOrder.indexOf(id as Route)

    const newOrder = [...menuOrder]
    newOrder.splice(oldIndex, 1)
    newOrder.splice(newIndex, 0, draggedItem as Route)

    setMenuOrder(newOrder)
    localStorage.setItem('menuOrderIds', JSON.stringify(newOrder))
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
  }

  const renderFriendCard = (friend: FriendItem, isSelected: boolean) => {
    const displayName = friend.name
    const displayDate = friend.date || ''
    const streakNum = friend.streak || 0
    const disappearing = friend.disappearing || ''

    return (
      <label
        key={friend.name}
        className={`flex items-center justify-between p-3 rounded cursor-pointer transition border ${
          isSelected
            ? 'bg-pink-600/20 border-pink-500/50 shadow-[0_0_10px_rgba(236,72,153,0.1)]'
            : 'bg-gray-800 border-gray-700 hover:bg-gray-700 hover:border-gray-500'
        }`}
      >
        <input
          type="checkbox"
          className="hidden"
          checked={isSelected}
          onChange={() => toggleFriend(friend.name)}
        />
        <div className="flex items-center flex-1 min-w-0 pr-3">
          {friend.avatar ? (
            <img
              src={friend.avatar}
              alt="avatar"
              className="w-10 h-10 rounded-full mr-3 object-cover bg-gray-700 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full mr-3 bg-gray-700 shrink-0 flex items-center justify-center text-gray-400">
              ?
            </div>
          )}
          <span className="truncate font-medium text-gray-200" title={displayName}>
            {displayName}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {disappearing ? (
            <span className="flex items-center gap-1 text-xs font-bold text-gray-300 bg-gray-600/60 px-2 py-1 rounded">
              <svg className="w-3 h-3 fill-current text-gray-400" viewBox="0 0 24 24">
                <path d="M12.63 2.53a.75.75 0 00-1.26 0C8.45 6.7 5.5 9.77 5.5 13.5a6.5 6.5 0 0013 0c0-3.73-2.95-6.8-5.87-10.97zm.37 5.97a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z" />
              </svg>
              {disappearing}
            </span>
          ) : streakNum > 0 ? (
            <span className="flex items-center gap-1 text-xs font-bold text-orange-500 bg-orange-500/10 px-2 py-1 rounded">
              <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                <path d="M12.63 2.53a.75.75 0 00-1.26 0C8.45 6.7 5.5 9.77 5.5 13.5a6.5 6.5 0 0013 0c0-3.73-2.95-6.8-5.87-10.97zm.37 5.97a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z" />
              </svg>
              {streakNum}
            </span>
          ) : null}
          {displayDate && (
            <span className="text-xs text-gray-400 bg-gray-700/50 px-2 py-1 rounded">
              {displayDate}
            </span>
          )}
        </div>
      </label>
    )
  }

  return (
    <div className="h-screen w-full bg-gray-900 text-white flex overflow-hidden">
      <aside
        className="bg-gray-950/60 border-r border-gray-800 p-4 flex flex-col gap-2 relative shrink-0"
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div className="text-xl font-bold text-pink-500 px-2 py-2">{t('app.title')}</div>

        {menuItems.map((item) => (
          <button
            key={item.id}
            draggable
            onDragStart={(e) => handleDragStart(e, item.id)}
            onDragOver={(e) => handleDragOver(e, item.id)}
            onDragEnd={handleDragEnd}
            onClick={() => setRoute(item.id)}
            className={`flex items-center gap-2 text-left px-3 py-2 rounded transition-colors ${
              route === item.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/60'
            } ${draggedItem === item.id ? 'opacity-50' : 'opacity-100'} cursor-pointer`}
          >
            <svg
              className="w-4 h-4 text-gray-500 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
            <span>{item.label}</span>
          </button>
        ))}

        <div className="mt-8 px-2 flex flex-col gap-2">
          <div className="text-sm font-semibold text-gray-400 border-b border-gray-800 pb-1 mb-1">
            {t('app.status_title')}
          </div>
          <div
            className={`text-sm ${status.includes('失败') || status.includes('fail') ? 'text-red-400' : 'text-green-400'} min-h-[40px]`}
          >
            {status || t('app.status_empty')}
          </div>
        </div>

        <div className="flex-1" />
        <div className="text-xs text-gray-500 px-2 leading-5 mb-2">{t('app.captcha_hint')}</div>

        {isLoggingIn ? (
          <div className="p-3 bg-pink-600/10 border border-pink-500/30 rounded flex flex-col gap-2 mt-2">
            <span className="text-xs text-pink-400 text-center">{t('app.login_hint')}</span>
            <button
              onClick={async () => {
                // 在用户点击完成登录时，再检测一次是否真的登上了
                const loggedIn = await window.api.checkLogin()
                if (loggedIn) {
                  setIsLoggingIn(false)
                  setRoute('dashboard')
                  handleGetFriends(false)
                } else {
                  setStatus(t('app.login_not_detected'))
                }
              }}
              className="w-full px-3 py-2 bg-pink-600 hover:bg-pink-700 text-white text-sm rounded transition-colors"
            >
              {t('app.login_done')}
            </button>
            <button
              onClick={() => {
                setIsLoggingIn(false)
                setRoute('dashboard')
              }}
              className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors mt-1"
            >
              {t('app.login_cancel')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-2">
            <button
              onClick={() => {
                setIsLoggingIn(true)
                setRoute('douyin')
                window.api.login()
              }}
              className="w-full text-center px-3 py-2 rounded bg-gray-800/80 text-gray-300 hover:bg-gray-700 transition-colors text-sm"
            >
              {t('app.login_btn')}
            </button>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full text-center px-3 py-2 rounded text-red-400 hover:bg-red-500/20 transition-colors text-sm"
            >
              {t('app.logout_btn')}
            </button>
          </div>
        )}

        <div className="mt-4 border-t border-gray-800 pt-4 flex flex-col gap-2">
          <label className="text-xs text-gray-500 pl-1">{t('app.language')}</label>
          <select
            value={i18n.language}
            onChange={(e) => {
              const lng = e.target.value
              i18n.changeLanguage(lng)
              localStorage.setItem('appLanguage', lng)
            }}
            className="w-full bg-gray-800/80 text-gray-300 p-2 rounded border border-gray-700 text-sm outline-none focus:border-pink-500 transition"
          >
            <option value="zh-CN">{t('app.lang_zh_cn')}</option>
            <option value="zh-TW">{t('app.lang_zh_tw')}</option>
            <option value="en-US">{t('app.lang_en_us')}</option>
          </select>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-y-auto relative">
        {route === 'douyin' && (
          <div className="h-full w-full flex items-center justify-center text-gray-400">
            {t('app.douyin_loaded')}
          </div>
        )}

        {route === 'schedule' && (
          <div className="flex flex-col gap-6">
            <header className="flex justify-between items-center bg-gray-800 p-4 rounded-lg shadow shrink-0">
              <h1 className="text-2xl font-bold text-pink-500">{t('app.schedule_title')}</h1>
              <button
                onClick={handleSaveSchedule}
                className="px-6 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded transition-colors shadow-md hover:shadow-lg font-medium"
              >
                {t('app.save_btn')}
              </button>
            </header>
            <div className="bg-gray-800 p-6 rounded-lg flex flex-col gap-6 max-w-2xl">
              {/* Enable/Disable Toggle */}
              <div className="flex items-center justify-between bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                <div>
                  <div className="font-medium text-gray-200">{t('app.enable_schedule')}</div>
                  <div className="text-sm text-gray-500 mt-1">{t('app.schedule_desc')}</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={localScheduleEnabled}
                    onChange={(e) => setLocalScheduleEnabled(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                </label>
              </div>

              <div
                className={`transition-opacity duration-300 ${!localScheduleEnabled ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}
              >
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  {t('app.daily_time')}
                </label>
                <div className="flex flex-col gap-6 bg-gray-900/50 p-6 rounded-xl border border-gray-700 shadow-inner">
                  <div className="text-center">
                    <div className="text-5xl font-mono text-pink-500 font-bold tracking-wider drop-shadow-md">
                      {String(scheduleHour).padStart(2, '0')}:
                      {String(scheduleMinute).padStart(2, '0')}
                    </div>
                    <div className="text-gray-400 mt-3 text-sm">{t('app.daily_time_desc')}</div>
                  </div>

                  <div className="flex flex-col gap-5 px-4 mt-2">
                    <div className="flex items-center gap-4">
                      <span className="text-gray-400 w-12 text-right text-sm">{t('app.hour')}</span>
                      <input
                        type="range"
                        min="0"
                        max="23"
                        value={scheduleHour}
                        onChange={(e) => handleScheduleChange('hour', parseInt(e.target.value))}
                        className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500 hover:accent-pink-400 transition-all"
                      />
                      <span className="text-gray-300 w-8 font-mono text-sm">
                        {String(scheduleHour).padStart(2, '0')}
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-gray-400 w-12 text-right text-sm">
                        {t('app.minute')}
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="59"
                        value={scheduleMinute}
                        onChange={(e) => handleScheduleChange('minute', parseInt(e.target.value))}
                        className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500 hover:accent-pink-400 transition-all"
                      />
                      <span className="text-gray-300 w-8 font-mono text-sm">
                        {String(scheduleMinute).padStart(2, '0')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {route === 'message' && (
          <div className="flex flex-col gap-6">
            <header className="flex justify-between items-center bg-gray-800 p-4 rounded-lg shadow shrink-0">
              <h1 className="text-2xl font-bold text-pink-500">{t('app.message_title')}</h1>
              <button
                onClick={handleSaveMessage}
                className="px-6 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded transition-colors shadow-md hover:shadow-lg font-medium"
              >
                {t('app.save_btn')}
              </button>
            </header>

            <div className="bg-gray-800 p-6 rounded-lg flex flex-col gap-6 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {t('app.message_type')}
                </label>
                <select
                  value={store.messageType}
                  onChange={(e) => updateConfig('messageType', e.target.value)}
                  className="w-full bg-gray-700 p-3 rounded border border-gray-600 focus:border-pink-500 outline-none transition"
                >
                  <option value="text">{t('app.type_text')}</option>
                  <option value="video">{t('app.type_video')}</option>
                </select>
              </div>

              {store.messageType === 'text' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {t('app.text_content')}
                  </label>
                  <textarea
                    value={localMessageText}
                    onChange={(e) => setLocalMessageText(e.target.value)}
                    className="w-full bg-gray-700 p-3 rounded border border-gray-600 focus:border-pink-500 outline-none h-32 transition resize-none"
                    placeholder={t('app.text_placeholder')}
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {t('app.video_path')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={store.videoPath}
                      className="w-full bg-gray-700 p-3 rounded border border-gray-600 outline-none text-sm text-gray-300"
                      placeholder={t('app.no_video')}
                    />
                    <button
                      onClick={handleSelectVideo}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded whitespace-nowrap transition"
                    >
                      {t('app.browse_btn')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {route === 'dashboard' && (
          <div className="flex flex-col gap-6 h-full">
            <header className="flex justify-between items-center bg-gray-800 p-4 rounded-lg shadow">
              <h1 className="text-2xl font-bold text-pink-500">{t('app.dashboard_title')}</h1>
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    void handleGetFriends(false)
                  }}
                  disabled={loading}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition disabled:opacity-50"
                >
                  {t('app.get_friends')}
                </button>
                {loading ? (
                  <button
                    onClick={() => {
                      window.api.stopAutomation()
                      setStatus(t('app.stopping'))
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded transition shadow-[0_0_10px_rgba(220,38,38,0.5)] animate-pulse"
                  >
                    {t('app.force_stop')}
                  </button>
                ) : (
                  <button
                    onClick={handleExecute}
                    disabled={store.selectedFriends.length === 0}
                    className="px-4 py-2 bg-pink-600 hover:bg-pink-700 rounded transition disabled:opacity-50"
                  >
                    {t('app.manual_run')}
                  </button>
                )}
              </div>
            </header>

            <div className="flex-1 bg-gray-800 p-6 rounded-lg flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">{t('app.friends_list')}</h2>
                <span className="text-sm text-gray-400">
                  {t('app.selected_count')} {store.selectedFriends?.length || 0}
                </span>
              </div>

              {store.friends?.length === 0 ? (
                <div className="flex-1 border border-gray-700 rounded bg-gray-900 flex flex-col gap-4 items-center justify-center text-gray-500">
                  <p>{t('app.no_friends')}</p>
                  <button
                    onClick={() => {
                      setIsLoggingIn(true)
                      setRoute('douyin')
                      window.api.login()
                    }}
                    className="px-6 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded transition-colors shadow-md text-sm font-medium"
                  >
                    {t('app.go_login')}
                  </button>
                </div>
              ) : (
                <div className="flex-1 flex gap-6 min-h-0">
                  {/* Left Column: Selected */}
                  <div className="flex-1 flex flex-col border border-gray-700 rounded-lg bg-gray-900 overflow-hidden">
                    <div className="bg-gray-800/80 p-3 border-b border-gray-700 text-sm font-medium text-pink-500 flex justify-between items-center shrink-0">
                      <span>{t('app.selected_friends')}</span>
                      <span className="bg-pink-500/20 px-2 py-0.5 rounded text-xs">
                        {store.selectedFriends?.length || 0}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {store.selectedFriends?.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-600 text-sm">
                          {t('app.no_selected')}
                        </div>
                      ) : (
                        store.selectedFriends?.map((friendName: string) => {
                          const friend = store.friends.find((f) => f.name === friendName) || {
                            name: friendName,
                            id: friendName,
                            avatar: '',
                            date: ''
                          }
                          return renderFriendCard(friend, true)
                        })
                      )}
                    </div>
                  </div>

                  {/* Right Column: Unselected */}
                  <div className="flex-1 flex flex-col border border-gray-700 rounded-lg bg-gray-900 overflow-hidden">
                    <div className="bg-gray-800/80 p-3 border-b border-gray-700 text-sm font-medium text-gray-400 flex justify-between items-center shrink-0">
                      <span>{t('app.unselected_friends')}</span>
                      <span className="bg-gray-700 px-2 py-0.5 rounded text-xs">
                        {
                          store.friends.filter((f) => !store.selectedFriends.includes(f.name))
                            .length
                        }
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {store.friends.filter((f) => !store.selectedFriends.includes(f.name))
                        .length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-600 text-sm">
                          {t('app.all_selected')}
                        </div>
                      ) : (
                        store.friends
                          .filter((f) => !store.selectedFriends.includes(f.name))
                          .map((friend) => renderFriendCard(friend, false))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Save Success Toast */}
      {showSaveToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-green-500/90 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 z-50 animate-[fade-in-down_0.3s_ease-out]">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">{t('app.save_success')}</span>
        </div>
      )}

      {/* Logout Confirm Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 transform transition-all">
            <h3 className="text-xl font-bold text-white mb-2">
              {t('app.logout_confirm_title', '确认退出当前用户？')}
            </h3>
            <div className="text-gray-400 text-sm mb-6 leading-relaxed">
              {t('app.logout_confirm_desc', '退出操作将会：')}
              <ul className="list-disc ml-5 mt-2 space-y-1">
                <li>{t('app.logout_confirm_li1', '清除当前抖音网页版的登录状态 (Cookie)')}</li>
                <li>{t('app.logout_confirm_li2', '清空本地已保存的好友列表数据')}</li>
                <li>{t('app.logout_confirm_li3', '取消所有已勾选的执行任务')}</li>
              </ul>
              {t('app.logout_confirm_warn', '数据清除后无法恢复，您需要重新扫码登录。')}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                disabled={loading}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition"
              >
                {t('app.login_cancel', '取消')}
              </button>
              <button
                onClick={handleLogout}
                disabled={loading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition disabled:opacity-50"
              >
                {loading
                  ? t('app.logging_out', '正在清除...')
                  : t('app.logout_confirm_btn', '确认清除并退出')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
