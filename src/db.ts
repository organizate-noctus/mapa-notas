import { openDB, type IDBPDatabase } from 'idb'

export interface Syncable {
  id: string
  updatedAt: number
  deleted: boolean
  dirty: boolean
}

export interface Note extends Syncable {
  body: string
  nodes: string[]
}

export type EventState = 'active' | 'done' | 'dismissed'
export type Repeat = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly'

export interface CalEvent extends Syncable {
  repeat?: Repeat
  noteId: string | null
  title: string
  at: number
  allDay: boolean
  remindMin: number
  state: EventState
  key: string
}

export type Store = 'notes' | 'events'

let dbp: Promise<IDBPDatabase> | null = null

function db() {
  dbp ??= openDB('mapa-notas', 3, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('notes', { keyPath: 'id' })
        d.createObjectStore('meta')
      }
      if (oldVersion < 2) d.createObjectStore('events', { keyPath: 'id' })
      if (oldVersion < 3) {
        const v = d.createObjectStore('versions', { keyPath: 'id', autoIncrement: true })
        v.createIndex('noteId', 'noteId')
      }
    },
  })
  return dbp
}

export interface Version {
  id?: number
  noteId: string
  at: number
  body: string
  nodes: string[]
  why: string
}

const KEEP_VERSIONS = 40
const VERSION_GAP = 3 * 60 * 1000

export async function versionsOf(noteId: string): Promise<Version[]> {
  const list: Version[] = await (await db()).getAllFromIndex('versions', 'noteId', noteId)
  return list.sort((a, b) => b.at - a.at)
}

export async function addVersion(
  n: { id: string; body: string; nodes?: string[] },
  why: string,
  force = false,
): Promise<void> {
  if (!n.body.trim()) return
  const list = await versionsOf(n.id)
  const last = list[0]
  if (last && last.body === n.body) return
  if (!force && last && Date.now() - last.at < VERSION_GAP) return
  const d = await db()
  await d.add('versions', { noteId: n.id, at: Date.now(), body: n.body, nodes: n.nodes ?? [], why })
  for (const old of list.slice(KEEP_VERSIONS - 1)) await d.delete('versions', old.id!)
}

export async function getRaw<T extends Syncable>(store: Store, id: string): Promise<T | undefined> {
  return (await db()).get(store, id)
}

export async function putRaw<T extends Syncable>(store: Store, item: T): Promise<void> {
  await (await db()).put(store, item)
}

export async function dirtyOf<T extends Syncable>(store: Store): Promise<T[]> {
  const list: T[] = await (await db()).getAll(store)
  return list.filter((x) => x.dirty)
}

export async function getMeta(key: string): Promise<number | undefined> {
  return (await db()).get('meta', key)
}

export async function setMeta(key: string, value: number): Promise<void> {
  await (await db()).put('meta', value, key)
}

export async function allNotes(): Promise<Note[]> {
  const list: Note[] = await (await db()).getAll('notes')
  return list
    .filter((n) => !n.deleted)
    .map((n) => ({ ...n, nodes: n.nodes ?? [] }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getNote(id: string): Promise<Note | undefined> {
  const n = await getRaw<Note>('notes', id)
  return n && { ...n, nodes: n.nodes ?? [] }
}

export async function createNote(body = '', nodes: string[] = []): Promise<Note> {
  const n: Note = { id: crypto.randomUUID(), body, nodes, updatedAt: Date.now(), deleted: false, dirty: true }
  await putRaw('notes', n)
  return n
}

export async function saveBody(id: string, body: string): Promise<Note | undefined> {
  const n = await getNote(id)
  if (!n) return
  if (n.body !== body) await addVersion(n, 'edición')
  const next = { ...n, body, updatedAt: Date.now(), dirty: true }
  await putRaw('notes', next)
  return next
}

export async function setNodes(id: string, nodes: string[]): Promise<Note | undefined> {
  const n = await getNote(id)
  if (!n) return
  const next = { ...n, nodes, updatedAt: Date.now(), dirty: true }
  await putRaw('notes', next)
  return next
}

export async function removeNote(id: string): Promise<void> {
  const n = await getNote(id)
  if (!n) return
  await addVersion(n, 'borrada', true)
  await putRaw('notes', { ...n, deleted: true, updatedAt: Date.now(), dirty: true })
}

export async function allEvents(): Promise<CalEvent[]> {
  const list: CalEvent[] = await (await db()).getAll('events')
  return list.filter((e) => !e.deleted).sort((a, b) => a.at - b.at)
}

export async function eventKeys(): Promise<Set<string>> {
  const list: CalEvent[] = await (await db()).getAll('events')
  const keys = new Set<string>()
  for (const e of list) {
    keys.add(e.key)
    if (e.noteId) keys.add(`${e.noteId}|${e.at}`)
  }
  return keys
}

export async function addEvent(
  e: Omit<CalEvent, 'id' | 'updatedAt' | 'deleted' | 'dirty'>,
): Promise<CalEvent> {
  const ev: CalEvent = { repeat: 'none', ...e, id: crypto.randomUUID(), updatedAt: Date.now(), deleted: false, dirty: true }
  await putRaw('events', ev)
  return ev
}

export async function patchEvent(id: string, patch: Partial<CalEvent>): Promise<void> {
  const e = await getRaw<CalEvent>('events', id)
  if (!e) return
  await putRaw('events', { ...e, ...patch, updatedAt: Date.now(), dirty: true })
}

export async function removeEvent(id: string): Promise<void> {
  await patchEvent(id, { deleted: true })
}
