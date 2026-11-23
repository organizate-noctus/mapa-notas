import type { CalEvent } from './db'
import { fmtWhen, remindAt } from './events'

const FIRED = 'mapa-notas-fired'
const WINDOW = 12 * 3600 * 1000

function firedSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED) ?? '[]'))
  } catch {
    return new Set()
  }
}

function saveFired(s: Set<string>): void {
  try {
    localStorage.setItem(FIRED, JSON.stringify([...s].slice(-300)))
  } catch {
    return
  }
}

export function notificationsState(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

export async function enableNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.requestPermission()
}

function native(title: string, body: string): void {
  if (notificationsState() !== 'granted') return
  try {
    new Notification(title, { body })
  } catch {
    return
  }
}

export function startReminders(
  getEvents: () => CalEvent[],
  toast: (title: string, body: string) => void,
): void {
  const check = () => {
    const now = Date.now()
    const fired = firedSet()
    let changed = false
    for (const e of getEvents()) {
      if (e.state !== 'active' || e.deleted) continue
      const r = remindAt(e)
      if (r === null || r > now || now - r > WINDOW) continue
      const id = `${e.id}:${r}`
      if (fired.has(id)) continue
      fired.add(id)
      changed = true
      toast(e.title, fmtWhen(e))
      native(e.title, fmtWhen(e))
    }
    if (changed) saveFired(fired)
  }
  check()
  window.setInterval(check, 30000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
}
