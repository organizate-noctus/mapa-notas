import * as chrono from 'chrono-node'
import type { CalEvent, Note, Repeat } from './db'
import { titleOf } from './links'

export interface Proposal {
  title: string
  at: number
  allDay: boolean
  key: string
  noteId: string
  repeat: Repeat
}

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: 'No se repite',
  daily: 'Cada día',
  weekdays: 'Lunes a viernes',
  weekly: 'Cada semana',
  monthly: 'Cada mes',
}

const REPEAT_PHRASES =
  /\b(de lunes a viernes|entre semana|laborables|todos los d[ií]as|cada d[ií]a|diariamente|a diario|cada mes|todos los meses|mensualmente|cada semana|semanalmente|todos los (lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)|cada (lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo))\b/gi

export function detectRepeat(line: string): Repeat {
  const t = line.toLowerCase()
  if (/\b(de lunes a viernes|entre semana|laborables)\b/.test(t)) return 'weekdays'
  if (/\b(todos los d[ií]as|cada d[ií]a|diariamente|a diario)\b/.test(t)) return 'daily'
  if (/\b(cada mes|todos los meses|mensualmente)\b/.test(t)) return 'monthly'
  if (/\b(cada semana|semanalmente|todos los (lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)|cada (lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo))\b/.test(t)) return 'weekly'
  return 'none'
}

export function nextOccurrence(at: number, repeat: Repeat, after: number): number {
  if (repeat === 'none') return at
  const d = new Date(at)
  const h = d.getHours()
  const mi = d.getMinutes()
  const dom = d.getDate()
  let t = at
  for (let n = 0; n < 4000 && t <= after; n++) {
    if (repeat === 'weekly') d.setDate(d.getDate() + 7)
    else if (repeat === 'monthly') {
      d.setDate(1)
      d.setMonth(d.getMonth() + 1)
      d.setDate(Math.min(dom, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
    } else if (repeat === 'weekdays') {
      do d.setDate(d.getDate() + 1)
      while (d.getDay() === 0 || d.getDay() === 6)
    } else d.setDate(d.getDate() + 1)
    d.setHours(h, mi, 0, 0)
    t = d.getTime()
  }
  return t
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
      const repeat = detectRepeat(line)
      let rest = line.slice(0, r.index) + ' ' + line.slice(r.index + r.text.length)
      if (repeat !== 'none') rest = rest.replace(REPEAT_PHRASES, ' ').replace(/\b(todos los|todas las|cada)\b/gi, ' ')
      const title = cleanTitle(rest, fallback)
      const key = `${note.id}|${title.toLowerCase()}|${d.getTime()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ title, at: d.getTime(), allDay: !timed, key, noteId: note.id, repeat })
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
