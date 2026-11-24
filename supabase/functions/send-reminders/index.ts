import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const DAY = 86400000
const WINDOW = 12 * 3600 * 1000
const TZ = 'Europe/Madrid'
const SECRET = Deno.env.get('CRON_SECRET')!
const FN_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-reminders`

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const dayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ })
const timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
const wallFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }

interface Ev {
  id: string
  user_id: string
  title: string
  starts_at: number
  all_day: boolean
  remind_min: number
  notified_at: number
  repeat: string
  snooze_until: number
}

interface Wall {
  y: number
  m: number
  d: number
  h: number
  mi: number
}

function wall(ts: number): Wall {
  const o: Record<string, number> = {}
  for (const p of wallFmt.formatToParts(ts)) if (p.type !== 'literal') o[p.type] = Number(p.value)
  return { y: o.year, m: o.month, d: o.day, h: o.hour, mi: o.minute }
}

function fromWall(y: number, m: number, d: number, h: number, mi: number): number {
  const target = Date.UTC(y, m - 1, d, h, mi)
  let guess = target
  for (let i = 0; i < 3; i++) {
    const w = wall(guess)
    guess -= Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi) - target
  }
  return guess
}

function nextOccurrence(ts: number, repeat: string, after: number): number {
  const w = wall(ts)
  const cur = new Date(Date.UTC(w.y, w.m - 1, w.d))
  let t = ts
  for (let n = 0; n < 4000 && t <= after; n++) {
    if (repeat === 'weekly') cur.setUTCDate(cur.getUTCDate() + 7)
    else if (repeat === 'monthly') {
      cur.setUTCDate(1)
      cur.setUTCMonth(cur.getUTCMonth() + 1)
      const last = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0)).getUTCDate()
      cur.setUTCDate(Math.min(w.d, last))
    } else if (repeat === 'weekdays') {
      do cur.setUTCDate(cur.getUTCDate() + 1)
      while ([0, 6].includes(cur.getUTCDay()))
    } else cur.setUTCDate(cur.getUTCDate() + 1)
    t = fromWall(cur.getUTCFullYear(), cur.getUTCMonth() + 1, cur.getUTCDate(), w.h, w.mi)
  }
  return t
}

async function sign(text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function snoozeUrl(id: string, m: string): Promise<string> {
  const exp = Date.now() + DAY
  const s = await sign(`${id}.${m}.${exp}`)
  return `${FN_URL}?action=snooze&e=${id}&m=${m}&x=${exp}&s=${s}`
}

async function handleSnooze(url: URL): Promise<Response> {
  const id = url.searchParams.get('e') ?? ''
  const m = url.searchParams.get('m') ?? ''
  const exp = Number(url.searchParams.get('x'))
  const s = url.searchParams.get('s') ?? ''
  if (!id || !m || !exp || exp < Date.now() || s !== (await sign(`${id}.${m}.${exp}`))) {
    return new Response('forbidden', { status: 403, headers: CORS })
  }
  const now = Date.now()
  let until = now + Number(m) * 60000
  if (m === 'tomorrow') {
    const w = wall(now)
    until = fromWall(w.y, w.m, w.d + 1, 9, 0)
  } else if (!(Number(m) > 0)) {
    return new Response('bad request', { status: 400, headers: CORS })
  }
  const { error } = await db.from('events').update({ snooze_until: until, updated_at: now }).eq('id', id)
  if (error) return new Response(error.message, { status: 500, headers: CORS })
  return new Response('ok', { headers: CORS })
}

async function pushTo(userId: string, payload: Record<string, unknown>): Promise<{ sent: number; removed: number }> {
  const { data: subs } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', userId)
  const body = JSON.stringify(payload)
  let sent = 0
  let removed = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600 })
      sent++
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) {
        await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        removed++
      }
    }
  }
  return { sent, removed }
}

async function reminderPayload(e: Ev, tag: string): Promise<Record<string, unknown>> {
  const when = new Date(e.starts_at)
  const body = e.all_day ? dayFmt.format(when) : `${dayFmt.format(when)}, ${timeFmt.format(when)}`
  return {
    title: e.title,
    body,
    tag,
    url: './',
    actions: [
      { action: 'snooze10', title: '10 min' },
      { action: 'snooze60', title: '1 hora' },
      { action: 'tomorrow', title: 'Mañana' },
    ],
    snooze: {
      snooze10: await snoozeUrl(e.id, '10'),
      snooze60: await snoozeUrl(e.id, '60'),
      tomorrow: await snoozeUrl(e.id, 'tomorrow'),
    },
  }
}

const COLS = 'id, user_id, title, starts_at, all_day, remind_min, notified_at, repeat, snooze_until'

async function reminders() {
  const now = Date.now()
  let sent = 0
  let removed = 0
  let rolled = 0

  const { data, error } = await db
    .from('events')
    .select(COLS)
    .eq('state', 'active')
    .eq('deleted', false)
    .neq('remind_min', 0)
    .gte('starts_at', now - 2 * DAY)
    .lte('starts_at', now + 3 * DAY)
  if (error) throw error

  const due = ((data ?? []) as Ev[])
    .map((e) => ({ e, at: e.starts_at - e.remind_min * 60000 }))
    .filter(({ e, at }) => at <= now && now - at < WINDOW && e.notified_at < at)

  for (const { e, at } of due) {
    const r = await pushTo(e.user_id, await reminderPayload(e, `${e.id}:${at}`))
    sent += r.sent
    removed += r.removed
    await db.from('events').update({ notified_at: at }).eq('id', e.id)
  }

  const { data: snoozed } = await db
    .from('events')
    .select(COLS)
    .eq('deleted', false)
    .gt('snooze_until', 0)
    .lte('snooze_until', now)
  for (const e of (snoozed ?? []) as Ev[]) {
    if (now - e.snooze_until < WINDOW && e.state !== 'dismissed') {
      const r = await pushTo(e.user_id, await reminderPayload(e, `${e.id}:s${e.snooze_until}`))
      sent += r.sent
      removed += r.removed
    }
    await db.from('events').update({ snooze_until: 0, updated_at: now }).eq('id', e.id)
  }

  const { data: reps } = await db
    .from('events')
    .select(COLS)
    .eq('deleted', false)
    .neq('repeat', 'none')
    .in('state', ['active', 'done'])
    .lt('starts_at', now - 3600000)
  for (const e of (reps ?? []) as Ev[]) {
    const next = nextOccurrence(e.starts_at, e.repeat, now)
    await db
      .from('events')
      .update({ starts_at: next, state: 'active', notified_at: 0, snooze_until: 0, updated_at: now })
      .eq('id', e.id)
    rolled++
  }

  return { due: due.length, sent, removed, rolled }
}

function countTasks(body: string): number {
  let fence = false
  let n = 0
  for (const line of body.split('\n')) {
    if (line.trim().startsWith('```')) fence = !fence
    else if (!fence && /^\s*(?:[-*+]|\d+[.)])\s+\[ \]\s+\S/.test(line)) n++
  }
  return n
}

async function digest() {
  const now = Date.now()
  const w = wall(now)
  const today = `${w.y}-${w.m}-${w.d}`
  const start = fromWall(w.y, w.m, w.d, 0, 0)
  const end = fromWall(w.y, w.m, w.d + 1, 0, 0)

  const { data: subs } = await db.from('push_subscriptions').select('user_id')
  const users = [...new Set((subs ?? []).map((s) => s.user_id as string))]
  const { data: sets } = await db.from('user_settings').select('user_id, digest_enabled, digest_hour, digest_last')
  const byUser = new Map((sets ?? []).map((s) => [s.user_id as string, s]))

  let sent = 0
  for (const uid of users) {
    const s = byUser.get(uid)
    const enabled = s?.digest_enabled ?? true
    const hour = s?.digest_hour ?? 8
    if (!enabled || hour !== w.h || s?.digest_last === today) continue

    const { data: evs } = await db
      .from('events')
      .select('title, starts_at, all_day')
      .eq('user_id', uid)
      .eq('state', 'active')
      .eq('deleted', false)
      .gte('starts_at', start)
      .lt('starts_at', end)
      .order('starts_at')
    const { data: notes } = await db.from('notes').select('body').eq('user_id', uid).eq('deleted', false)
    const tasks = (notes ?? []).reduce((a, n) => a + countTasks(n.body as string), 0)

    const parts: string[] = []
    if (evs?.length) {
      const list = evs
        .slice(0, 4)
        .map((e) => (e.all_day ? e.title : `${timeFmt.format(new Date(e.starts_at as number))} ${e.title}`))
        .join(' · ')
      parts.push(`Hoy: ${list}${evs.length > 4 ? ` y ${evs.length - 4} más` : ''}`)
    }
    if (tasks) parts.push(`${tasks} ${tasks === 1 ? 'tarea pendiente' : 'tareas pendientes'}`)

    if (parts.length) {
      const r = await pushTo(uid, { title: 'Buenos días', body: parts.join('\n'), tag: `digest:${today}`, url: './' })
      sent += r.sent
    }
    await db.from('user_settings').upsert({ user_id: uid, digest_enabled: enabled, digest_hour: hour, digest_last: today })
  }
  return { digest: sent }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const url = new URL(req.url)
  if (url.searchParams.get('action') === 'snooze') return handleSnooze(url)

  if (req.headers.get('x-cron-secret') !== SECRET) return new Response('forbidden', { status: 403 })

  try {
    const body = await req.json().catch(() => ({}))
    const result = body?.action === 'digest' ? await digest() : await reminders()
    return Response.json(result)
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 })
  }
})
