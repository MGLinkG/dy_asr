import schedule from 'node-schedule'
import { store } from './store'
import { DouyinAutomation } from './automation'

let currentJob: schedule.Job | null = null

export function initScheduler(automation: DouyinAutomation) {
  reschedule(automation)
}

export function reschedule(automation: DouyinAutomation) {
  if (currentJob) {
    currentJob.cancel()
    currentJob = null
  }

  const { cronExpression } = store.get()

  if (!cronExpression) {
    return
  }

  currentJob = schedule.scheduleJob(cronExpression, async () => {
    console.log('Scheduled job triggered at', new Date())
    
    try {
      const friends = await automation.getFriendsList()
      if (friends && friends.length > 0) {
        store.set({ friends })
      }
    } catch (e) {
      console.error('Scheduled friend fetch failed', e)
    }

    const { selectedFriends, messageText, videoPath, messageType } = store.get()

    if (!selectedFriends || selectedFriends.length === 0) {
      console.log('No friends selected, skipping scheduled execution')
      return
    }

    try {
      await automation.executeStreak(selectedFriends, messageText, videoPath, messageType, false)
      console.log('Streak executed successfully')
    } catch (e) {
      console.error('Failed to execute streak in scheduled job', e)
    }
  })
  
  console.log(`Job scheduled with cron: ${cronExpression}`)
}
