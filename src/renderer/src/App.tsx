import { useEffect, useState } from 'react'

const SIDEBAR_WIDTH = 260

export default function App() {
  const [store, setStore] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [route, setRoute] = useState<'dashboard' | 'schedule' | 'douyin'>('dashboard')
  const [localMessageText, setLocalMessageText] = useState('')
  const [scheduleHour, setScheduleHour] = useState(10)
  const [scheduleMinute, setScheduleMinute] = useState(0)

  const defaultMenu = [
    { id: 'dashboard', label: '好友列表管理' },
    { id: 'schedule', label: '定时任务' },
    { id: 'douyin', label: '抖音页面' }
  ]

  const [menuItems, setMenuItems] = useState(() => {
    const saved = localStorage.getItem('menuOrder')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed && parsed.length === 3) return parsed
      } catch (e) {}
    }
    return defaultMenu
  })

  const [draggedItem, setDraggedItem] = useState<string | null>(null)

  useEffect(() => {
    window.api.getStore().then((data: any) => {
      setStore(data)
      setLocalMessageText(data?.messageText || '')
      
      if (data?.cronExpression) {
        const parts = data.cronExpression.split(' ')
        if (parts.length >= 2) {
          setScheduleMinute(parseInt(parts[0]) || 0)
          setScheduleHour(parseInt(parts[1]) || 0)
        }
      }
      
      // 启动时自动静默获取一次好友列表
      setTimeout(() => {
        handleGetFriends(true)
      }, 1000)
    })
    window.api.onProgress((msg: string) => {
      setStatus(msg)
    })
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
    setStatus('正在清除数据并退出...')
    try {
      const newStore = await window.api.logout()
      setStore(newStore)
      setStatus('已成功退出当前账号，本地数据已清除。')
    } catch (e: any) {
      setStatus('退出失败: ' + e.message)
    }
    setLoading(false)
    setShowLogoutConfirm(false)
  }

  const handleGetFriends = async (silent = false) => {
    if (!silent) setLoading(true)
    setStatus('正在同步好友列表...')
    try {
      const friends = await window.api.getFriends()
      if (friends && friends.length > 0) {
        const newStore = await window.api.setStore({ friends })
        setStore(newStore)
        setStatus(`好友列表同步成功，共 ${friends.length} 个好友`)
      } else if (!silent) {
        setStatus('未获取到好友数据，请检查是否已登录')
      } else {
        setStatus('暂无运行任务')
      }
    } catch (e: any) {
      if (!silent) setStatus('获取失败: ' + e.message)
      else setStatus('暂无运行任务')
    }
    if (!silent) setLoading(false)
  }

  const handleExecute = async () => {
    setLoading(true)
    setStatus('正在准备执行续火花任务...')
    setRoute('douyin') // 执行时自动切换到抖音页面
    try {
      const newStore = await window.api.executeStreak(true) // true 表示手动执行
      if (newStore) setStore(newStore)
      setStatus('执行完成！')
    } catch (e: any) {
      setStatus('执行失败: ' + e.message)
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

  const updateConfig = async (key: string, value: any) => {
    const newStore = await window.api.setStore({ [key]: value })
    setStore(newStore)
  }

  const handleSelectVideo = async () => {
    const path = await window.api.openFile()
    if (path) {
      updateConfig('videoPath', path)
    }
  }

  const handleScheduleChange = (type: 'hour' | 'minute', value: number) => {
    let h = scheduleHour
    let m = scheduleMinute
    if (type === 'hour') h = value
    if (type === 'minute') m = value

    setScheduleHour(h)
    setScheduleMinute(m)

    const newCron = `${m} ${h} * * *`
    updateConfig('cronExpression', newCron)
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItem(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (!draggedItem || draggedItem === id) return
    const draggedIndex = menuItems.findIndex(item => item.id === draggedItem)
    const targetIndex = menuItems.findIndex(item => item.id === id)
    
    const newItems = [...menuItems]
    const [removed] = newItems.splice(draggedIndex, 1)
    newItems.splice(targetIndex, 0, removed)
    setMenuItems(newItems)
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
    localStorage.setItem('menuOrder', JSON.stringify(menuItems))
  }

  const renderFriendCard = (friend: any, isSelected: boolean) => {
    const displayName = friend.name
    const displayDate = friend.date || ''

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
          <span className="truncate font-medium text-gray-200" title={displayName}>{displayName}</span>
        </div>
        {displayDate && (
          <span className="text-xs text-pink-400 bg-pink-400/10 px-2 py-1 rounded shrink-0">
            {displayDate}
          </span>
        )}
      </label>
    )
  }

  if (!store) return <div className="p-8 text-white">Loading...</div>

  return (
    <div className="h-screen w-full bg-gray-900 text-white flex overflow-hidden">
      <aside
        className="bg-gray-950/60 border-r border-gray-800 p-4 flex flex-col gap-2 relative shrink-0"
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div className="text-xl font-bold text-pink-500 px-2 py-2">抖音续火花</div>
        
        {menuItems.map(item => (
          <button
            key={item.id}
            draggable
            onDragStart={(e) => handleDragStart(e, item.id)}
            onDragOver={(e) => handleDragOver(e, item.id)}
            onDragEnd={handleDragEnd}
            onClick={() => setRoute(item.id as any)}
            className={`text-left px-3 py-2 rounded transition-colors ${
              route === item.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/60'
            } ${draggedItem === item.id ? 'opacity-50' : 'opacity-100'} cursor-move`}
          >
            {item.label}
          </button>
        ))}

        <div className="mt-8 px-2 flex flex-col gap-2">
          <div className="text-sm font-semibold text-gray-400 border-b border-gray-800 pb-1 mb-1">
            当前任务状态
          </div>
          <div className={`text-sm ${status.includes('失败') ? 'text-red-400' : 'text-green-400'} min-h-[40px]`}>
            {status || '暂无运行任务'}
          </div>
        </div>

        <div className="flex-1" />
        <div className="text-xs text-gray-500 px-2 leading-5">
          进入“抖音页面”后如出现验证码，可直接在该页面手动完成。
        </div>

        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="mt-4 text-left px-3 py-2 rounded text-red-400 hover:bg-red-500/20 transition-colors"
        >
          退出当前用户
        </button>
      </aside>

      <main className="flex-1 p-6 overflow-y-auto relative">
        {route === 'douyin' && (
          <div className="h-full w-full flex items-center justify-center text-gray-400">
            抖音页面已加载在右侧区域（切换回“好友列表管理”可收回）。
          </div>
        )}

        {route === 'schedule' && (
          <div className="flex flex-col gap-6">
            <header className="flex justify-between items-center bg-gray-800 p-4 rounded-lg shadow">
              <h1 className="text-2xl font-bold text-pink-500">定时任务与消息设置</h1>
            </header>
            <div className="bg-gray-800 p-6 rounded-lg flex flex-col gap-6 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">每天执行时间</label>
                <div className="flex flex-col gap-6 bg-gray-900/50 p-6 rounded-xl border border-gray-700 shadow-inner">
                  <div className="text-center">
                    <div className="text-5xl font-mono text-pink-500 font-bold tracking-wider drop-shadow-md">
                      {String(scheduleHour).padStart(2, '0')}:{String(scheduleMinute).padStart(2, '0')}
                    </div>
                    <div className="text-gray-400 mt-3 text-sm">将在每天的这个时间自动为您续火花</div>
                  </div>

                  <div className="flex flex-col gap-5 px-4 mt-2">
                    <div className="flex items-center gap-4">
                      <span className="text-gray-400 w-12 text-right text-sm">小时</span>
                      <input
                        type="range"
                        min="0"
                        max="23"
                        value={scheduleHour}
                        onChange={(e) => handleScheduleChange('hour', parseInt(e.target.value))}
                        className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500 hover:accent-pink-400 transition-all"
                      />
                      <span className="text-gray-300 w-8 font-mono text-sm">{String(scheduleHour).padStart(2, '0')}</span>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-gray-400 w-12 text-right text-sm">分钟</span>
                      <input
                        type="range"
                        min="0"
                        max="59"
                        value={scheduleMinute}
                        onChange={(e) => handleScheduleChange('minute', parseInt(e.target.value))}
                        className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500 hover:accent-pink-400 transition-all"
                      />
                      <span className="text-gray-300 w-8 font-mono text-sm">{String(scheduleMinute).padStart(2, '0')}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">消息类型</label>
                <select
                  value={store.messageType}
                  onChange={(e) => updateConfig('messageType', e.target.value)}
                  className="w-full bg-gray-700 p-3 rounded border border-gray-600 focus:border-pink-500 outline-none transition"
                >
                  <option value="text">发送文本消息</option>
                  <option value="video">发送指定视频</option>
                </select>
              </div>

              {store.messageType === 'text' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">续火花文本内容</label>
                  <textarea
                    value={localMessageText}
                    onChange={(e) => setLocalMessageText(e.target.value)}
                    onBlur={(e) => updateConfig('messageText', e.target.value)}
                    className="w-full bg-gray-700 p-3 rounded border border-gray-600 focus:border-pink-500 outline-none h-32 transition resize-none"
                    placeholder="请输入要发送的文本..."
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">续火花视频路径</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={store.videoPath}
                      className="w-full bg-gray-700 p-3 rounded border border-gray-600 outline-none text-sm text-gray-300"
                      placeholder="未选择视频"
                    />
                    <button
                      onClick={handleSelectVideo}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded whitespace-nowrap transition"
                    >
                      浏览文件
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
              <h1 className="text-2xl font-bold text-pink-500">好友管理与执行</h1>
              <div className="flex gap-4">
                <button
                  onClick={handleGetFriends}
                  disabled={loading}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition disabled:opacity-50"
                >
                  获取好友
                </button>
                <button
                  onClick={handleExecute}
                  disabled={loading || store.selectedFriends.length === 0}
                  className="px-4 py-2 bg-pink-600 hover:bg-pink-700 rounded transition disabled:opacity-50"
                >
                  手动执行
                </button>
              </div>
            </header>

            <div className="flex-1 bg-gray-800 p-6 rounded-lg flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">好友列表</h2>
                <span className="text-sm text-gray-400">
                  已选 {store.selectedFriends?.length || 0} / {store.friends?.length || 0}
                </span>
              </div>

              {store.friends?.length === 0 ? (
                <div className="flex-1 border border-gray-700 rounded bg-gray-900 flex items-center justify-center text-gray-500">
                  暂无好友数据，请点击右上角“获取好友”
                </div>
              ) : (
                <div className="flex-1 flex gap-6 min-h-0">
                  {/* Left Column: Selected */}
                  <div className="flex-1 flex flex-col border border-gray-700 rounded-lg bg-gray-900 overflow-hidden">
                    <div className="bg-gray-800/80 p-3 border-b border-gray-700 text-sm font-medium text-pink-500 flex justify-between items-center shrink-0">
                      <span>待执行任务好友</span>
                      <span className="bg-pink-500/20 px-2 py-0.5 rounded text-xs">{store.friends?.filter((f: any) => store.selectedFriends?.includes(f.name)).length || 0}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {store.friends?.filter((f: any) => store.selectedFriends?.includes(f.name)).length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-600 text-sm">暂未选择好友</div>
                      ) : (
                        store.friends?.filter((f: any) => store.selectedFriends?.includes(f.name)).map((friend: any) => renderFriendCard(friend, true))
                      )}
                    </div>
                  </div>

                  {/* Right Column: Unselected */}
                  <div className="flex-1 flex flex-col border border-gray-700 rounded-lg bg-gray-900 overflow-hidden">
                    <div className="bg-gray-800/80 p-3 border-b border-gray-700 text-sm font-medium text-gray-400 flex justify-between items-center shrink-0">
                      <span>未选择好友</span>
                      <span className="bg-gray-700 px-2 py-0.5 rounded text-xs">{store.friends?.filter((f: any) => !store.selectedFriends?.includes(f.name)).length || 0}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {store.friends?.filter((f: any) => !store.selectedFriends?.includes(f.name)).length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-600 text-sm">全部已选</div>
                      ) : (
                        store.friends?.filter((f: any) => !store.selectedFriends?.includes(f.name)).map((friend: any) => renderFriendCard(friend, false))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Logout Confirm Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 transform transition-all">
            <h3 className="text-xl font-bold text-white mb-2">确认退出当前用户？</h3>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              退出操作将会：
              <ul className="list-disc ml-5 mt-2 space-y-1">
                <li>清除当前抖音网页版的登录状态 (Cookie)</li>
                <li>清空本地已保存的好友列表数据</li>
                <li>取消所有已勾选的执行任务</li>
              </ul>
              数据清除后无法恢复，您需要重新扫码登录。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                disabled={loading}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition"
              >
                取消
              </button>
              <button
                onClick={handleLogout}
                disabled={loading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition disabled:opacity-50"
              >
                {loading ? '正在清除...' : '确认清除并退出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
