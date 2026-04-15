import schedule from 'node-schedule'
import { store } from './store'
import { DouyinAutomation } from './automation'

let currentJob: schedule.Job | null = null

export function initScheduler(automation: DouyinAutomation): void {
  reschedule(automation)
}

export function reschedule(automation: DouyinAutomation): void {
  if (currentJob) {
    currentJob.cancel()
    currentJob = null
  }

  const { cronExpression, isScheduleEnabled } = store.get()

  if (!cronExpression || !isScheduleEnabled) {
    console.log('Scheduler is disabled or no cron expression set.')
    return
  }

  currentJob = schedule.scheduleJob(cronExpression, async (): Promise<void> => {
    console.log('Scheduled job triggered at', new Date())

    // 定时任务执行时，通知渲染进程切换到“抖音页面”显示执行进度
    if (automation.mainWindow) {
      if (automation.mainWindow.isMinimized()) {
        automation.mainWindow.restore()
      }
      automation.mainWindow.show()
      automation.mainWindow.webContents.send('automation:route', 'douyin')
      automation.mainWindow.webContents.send(
        'automation:progress',
        '⏰ 定时任务已触发，正在准备执行...'
      )
    }

    try {
      const friends = await automation.getFriendsList()
      if (friends && friends.length > 0) {
        // 同理，定时任务中也不主动清理 selectedFriends，防止误删
        store.set({ friends })
      }
    } catch (e) {
      console.error('Scheduled friend fetch failed', e)
    }

    const data = store.get()
    const { selectedFriends, messageText, videoPath, messageType } = data

    if (!selectedFriends || selectedFriends.length === 0) {
      console.log('No friends selected, skipping scheduled execution')
      if (automation.mainWindow) {
        automation.mainWindow.webContents.send(
          'automation:progress',
          '定时任务已取消：未选择任何需要续火花的好友'
        )
      }
      return
    }

    try {
      // 传入 true 表示需要显示操作页面供用户观察，同时传入进度回调
      await automation.executeStreak(
        selectedFriends,
        messageText,
        videoPath,
        messageType,
        true,
        (msg): void => {
          if (automation.mainWindow) {
            automation.mainWindow.webContents.send('automation:progress', msg)
          }
        }
      )
      console.log('Streak executed successfully')
      if (automation.mainWindow) {
        automation.mainWindow.webContents.send('automation:progress', '⏰ 定时任务执行完成！')
      }
    } catch (e) {
      console.error('Failed to execute streak in scheduled job', e)
      if (automation.mainWindow) {
        automation.mainWindow.webContents.send('automation:progress', `定时任务执行失败: ${e}`)
      }
    }
  })

  console.log(`Job scheduled with cron: ${cronExpression}`)
}
