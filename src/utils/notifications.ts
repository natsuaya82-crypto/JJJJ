import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

// 毎日決まった時刻に鳴る再訪リマインド。ゲームは実時間で進まないので、
// ゲーム内の期限ではなく「ログイン促進・復帰促進」の実時間通知だけを扱う。
const DAILY_NOTIFICATIONS = [
  { id: 1001, hour: 10, minute: 0, title: 'JPEL Manager', body: 'ログインボーナスを受け取ってチームを強化しよう！' },
  { id: 1002, hour: 18, minute: 0, title: 'JPEL Manager', body: 'チームが監督の帰りを待っています。今日の練習を進めよう。' },
]

export async function initLocalNotifications(): Promise<void> {
  // Web/未対応環境では何もしない（プラグインは native のみ）
  if (!Capacitor.isNativePlatform()) return
  try {
    const perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return

    // 既存の予約を一旦消してから再登録（起動ごとの重複を防ぐ）
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) })
    }

    await LocalNotifications.schedule({
      notifications: DAILY_NOTIFICATIONS.map(d => ({
        id: d.id,
        title: d.title,
        body: d.body,
        schedule: { on: { hour: d.hour, minute: d.minute }, repeats: true, allowWhileIdle: true },
      })),
    })
  } catch (e) {
    console.warn('local notifications setup failed', e)
  }
}
