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

async function native(title: string, body: string, tag: string): Promise<void> {
  if (notificationsState() !== 'granted') return
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.showNotification(title, { body, tag, icon: 'icon-192.png', badge: 'icon-192.png' })
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
      if (document.visibilityState !== 'visible') void native(e.title, fmtWhen(e), id)
    }
    if (changed) saveFired(fired)
  }

  navigator.serviceWorker?.addEventListener('message', (ev) => {
    const d = ev.data as { type?: string; title?: string; body?: string; tag?: string } | undefined
    if (d?.type !== 'reminder') return
    const fired = firedSet()
    if (d.tag && fired.has(d.tag)) return
    if (d.tag) {
      fired.add(d.tag)
      saveFired(fired)
    }
    toast(d.title ?? 'Recordatorio', d.body ?? '')
  })

  check()
  window.setInterval(check, 30000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
}
