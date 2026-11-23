import { supabase } from './sync'

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushResult = 'ok' | 'denied' | 'unsupported' | 'nologin' | 'error'

function keyBytes(s: string): Uint8Array<ArrayBuffer> {
  const b = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0))
}

export function pushSupported(): boolean {
  return !!KEY && !!supabase && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function pushActive(): Promise<boolean> {
  if (!pushSupported()) return false
  const reg = await navigator.serviceWorker.getRegistration()
  return !!(await reg?.pushManager.getSubscription())
}

async function save(sub: PushSubscription, uid: string): Promise<boolean> {
  const j = sub.toJSON()
  if (!j.endpoint || !j.keys) return false
  const { error } = await supabase!
    .from('push_subscriptions')
    .upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_id: uid }, { onConflict: 'endpoint' })
  return !error
}

export async function enablePush(): Promise<PushResult> {
  if (!pushSupported()) return 'unsupported'
  const { data } = await supabase!.auth.getSession()
  if (!data.session) return 'nologin'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY!) }))
    return (await save(sub, data.session.user.id)) ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function resyncPush(): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return
  const { data } = await supabase!.auth.getSession()
  if (!data.session) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) await save(sub, data.session.user.id)
}
