import { createClient } from '@supabase/supabase-js'
import {
  dirtyOf,
  getMeta,
  getRaw,
  putRaw,
  setMeta,
  type CalEvent,
  type Note,
  type Store,
  type Syncable,
} from './db'
import { titleOf } from './links'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase = url && key ? createClient(url, key) : null

export type SyncResult = 'off' | 'nologin' | 'ok' | 'partial'

interface Spec<T extends Syncable> {
  store: Store
  table: string
  fromRow: (r: Record<string, any>) => T
  toRow: (x: T, uid: string) => Record<string, unknown>
  optionalCols?: string[]
}

const notesSpec: Spec<Note> = {
  store: 'notes',
  table: 'notes',
  optionalCols: ['nodes'],
  fromRow: (r) => ({
    id: r.id,
    body: r.body,
    nodes: Array.isArray(r.nodes) ? r.nodes : [],
    updatedAt: r.updated_at,
    deleted: r.deleted,
    dirty: false,
  }),
  toRow: (n, uid) => ({
    id: n.id,
    user_id: uid,
    title: titleOf(n.body),
    body: n.body,
    nodes: n.nodes,
    updated_at: n.updatedAt,
    deleted: n.deleted,
  }),
}

const eventsSpec: Spec<CalEvent> = {
  store: 'events',
  table: 'events',
  fromRow: (r) => ({
    id: r.id,
    noteId: r.note_id,
    title: r.title,
    at: r.starts_at,
    allDay: r.all_day,
    remindMin: r.remind_min,
    state: r.state,
    key: r.key,
    updatedAt: r.updated_at,
    deleted: r.deleted,
    dirty: false,
  }),
  toRow: (e, uid) => ({
    id: e.id,
    user_id: uid,
    note_id: e.noteId,
    title: e.title,
    starts_at: e.at,
    all_day: e.allDay,
    remind_min: e.remindMin,
    state: e.state,
    key: e.key,
    updated_at: e.updatedAt,
    deleted: e.deleted,
  }),
}

export async function currentEmail(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.email ?? null
}

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Supabase no está configurado'
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error?.message ?? null
}

export async function signUp(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Supabase no está configurado'
  const { error } = await supabase.auth.signUp({ email, password })
  return error?.message ?? null
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
}

async function syncTable<T extends Syncable>(spec: Spec<T>, uid: string): Promise<void> {
  const client = supabase!
  const metaKey = `lastSync:${spec.table}`
  const last = (await getMeta(metaKey)) ?? 0
  let max = last

  const { data, error } = await client
    .from(spec.table)
    .select('*')
    .gt('updated_at', last)
    .order('updated_at')
  if (error) throw error

  for (const r of data ?? []) {
    const remote = spec.fromRow(r)
    max = Math.max(max, remote.updatedAt)
    const local = await getRaw<T>(spec.store, remote.id)
    if (local?.dirty && local.updatedAt > remote.updatedAt) continue
    await putRaw(spec.store, remote)
  }

  const dirty = await dirtyOf<T>(spec.store)
  if (dirty.length) {
    const rows = dirty.map((x) => spec.toRow(x, uid))
    let { error: e2 } = await client.from(spec.table).upsert(rows)
    if (e2 && spec.optionalCols?.length) {
      const slim = rows.map((r) => {
        const c = { ...r }
        for (const k of spec.optionalCols!) delete c[k]
        return c
      })
      ;({ error: e2 } = await client.from(spec.table).upsert(slim))
    }
    if (e2) throw e2
    for (const x of dirty) {
      const cur = await getRaw<T>(spec.store, x.id)
      if (cur && cur.updatedAt === x.updatedAt) await putRaw(spec.store, { ...cur, dirty: false })
      max = Math.max(max, x.updatedAt)
    }
  }

  await setMeta(metaKey, max)
}

export async function sync(): Promise<SyncResult> {
  if (!supabase) return 'off'
  const { data: s } = await supabase.auth.getSession()
  if (!s.session) return 'nologin'
  const uid = s.session.user.id
  await syncTable(notesSpec, uid)
  try {
    await syncTable(eventsSpec, uid)
  } catch {
    return 'partial'
  }
  return 'ok'
}
