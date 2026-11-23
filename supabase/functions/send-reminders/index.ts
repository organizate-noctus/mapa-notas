import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const DAY = 86400000
const WINDOW = 12 * 3600 * 1000

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const dayFmt = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Madrid',
})
const timeFmt = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
})

interface Ev {
  id: string
  user_id: string
  title: string
  starts_at: number
  all_day: boolean
  remind_min: number
  notified_at: number
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }

  const now = Date.now()
  const { data, error } = await db
    .from('events')
    .select('id, user_id, title, starts_at, all_day, remind_min, notified_at')
    .eq('state', 'active')
    .eq('deleted', false)
    .neq('remind_min', 0)
    .gte('starts_at', now - 2 * DAY)
    .lte('starts_at', now + 3 * DAY)
  if (error) return new Response(error.message, { status: 500 })

  const due = ((data ?? []) as Ev[])
    .map((e) => ({ e, at: e.starts_at - e.remind_min * 60000 }))
    .filter(({ e, at }) => at <= now && now - at < WINDOW && e.notified_at < at)

  let sent = 0
  let removed = 0

  for (const { e, at } of due) {
    const { data: subs } = await db
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', e.user_id)

    const when = new Date(e.starts_at)
    const body = e.all_day ? dayFmt.format(when) : `${dayFmt.format(when)}, ${timeFmt.format(when)}`
    const payload = JSON.stringify({ title: e.title, body, tag: `${e.id}:${at}`, url: './' })

    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 3600 },
        )
        sent++
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) {
          await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
          removed++
        }
      }
    }

    await db.from('events').update({ notified_at: at }).eq('id', e.id)
  }

  return Response.json({ due: due.length, sent, removed })
})
