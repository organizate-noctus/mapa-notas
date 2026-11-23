import * as chrono from 'chrono-node'
import type { CalEvent, Note } from './db'
import { titleOf } from './links'

export interface Proposal {
  title: string
  at: number
  allDay: boolean
  key: string
  noteId: string
}

const STOP = /^(el|la|los|las|para|de|del|a|en|dia|día|este|esta|que|y|,|:|-|—|–)$/i

function normalize(line: string): string {
  return line
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a: string, b?: string) => b ?? a)
    .replace(/\b(\d{1,2})-(\d{1,2})(?:-(\d{2,4}))?\b/g, (m, d: string, mo: string, y?: string) =>
      +d <= 31 && +mo <= 12 ? `${d}/${mo}${y ? '/' + y : ''}` : m,
    )
}

function cleanTitle(s: string, fallback: string): string {
  const t = s
    .replace(/#[\p{L}\p{N}_-]+/gu, ' ')
    .replace(/^[\s>*+-]+/, '')
    .replace(/^\[[ xX]\]\s*/, '')
    .replace(/^#+\s*/, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const w = t.split(' ').filter(Boolean)
  const bare = (x: string) => x.replace(/[.,;:]+$/, '')
  while (w.length && STOP.test(bare(w[w.length - 1]))) w.pop()
  while (w.length && STOP.test(bare(w[0]))) w.shift()
  const out = w.join(' ').replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '')
  return out || fallback
}

export function detectEvents(note: Note, now = new Date()): Proposal[] {
  const out: Proposal[] = []
  const seen = new Set<string>()
  const fallback = titleOf(note.body)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  for (const raw of note.body.split('\n')) {
    const line = normalize(raw)
    if (!line.trim()) continue
    for (const r of chrono.es.parse(line, now, { forwardDate: true })) {
      const timed = r.start.isCertain('hour')
      const d = r.start.date()
      if (!timed) d.setHours(0, 0, 0, 0)
      if (timed ? d.getTime() <= now.getTime() : d.getTime() < today.getTime()) continue
      const title = cleanTitle(line.slice(0, r.index) + ' ' + line.slice(r.index + r.text.length), fallback)
      const key = `${note.id}|${title.toLowerCase()}|${d.getTime()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ title, at: d.getTime(), allDay: !timed, key, noteId: note.id })
    }
  }
  return out
}

export function defaultRemind(allDay: boolean): number {
  return allDay ? 360 : 60
}

export function remindOptions(allDay: boolean): [number, string][] {
  return allDay
    ? [
        [360, 'Día antes, 18:00'],
        [-540, 'Mismo día, 9:00'],
        [0, 'Sin aviso'],
      ]
    : [
        [10, '10 min antes'],
        [60, '1 hora antes'],
        [1440, '1 día antes'],
        [0, 'Sin aviso'],
      ]
}

export function remindAt(e: Pick<CalEvent, 'at' | 'remindMin'>): number | null {
  return e.remindMin === 0 ? null : e.at - e.remindMin * 60000
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export function fmtWhen(e: Pick<CalEvent, 'at' | 'allDay'>): string {
  const d = new Date(e.at)
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric'
  const day = d.toLocaleDateString('es-ES', opts)
  return e.allDay ? day : `${day} · ${fmtTime(e.at)}`
}
