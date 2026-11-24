import type { CalEvent } from './db'
import { REPEAT_LABEL, fmtTime, fmtWhen } from './events'
import { icons } from './icons'

export interface CalHandlers {
  openNote: (id: string) => void
  toggleDone: (e: CalEvent) => void
  remove: (e: CalEvent) => void
}

const sod = (d: Date): Date => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const dkey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

let month = (() => {
  const d = sod(new Date())
  d.setDate(1)
  return d
})()
let selected = sod(new Date())

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

export function eventRow(e: CalEvent, h: CalHandlers, withDay: boolean): HTMLElement {
  const r = el('div', e.state === 'done' ? 'ev done' : 'ev')
  const when = el('span', 'when', withDay ? fmtWhen(e) : e.allDay ? 'Todo el día' : fmtTime(e.at))
  const title = el('span', 'etitle', e.title)
  if (e.noteId) {
    title.classList.add('link')
    title.onclick = () => h.openNote(e.noteId!)
  }
  const ok = el('button', 'btn ghost icon small')
  ok.innerHTML = e.state === 'done' ? icons.undo : icons.check
  ok.title = e.state === 'done' ? 'Reabrir' : 'Marcar como hecho'
  ok.onclick = () => h.toggleDone(e)
  const del = el('button', 'btn ghost icon small danger')
  del.innerHTML = icons.trash
  del.title = 'Borrar'
  del.onclick = () => h.remove(e)
  r.append(when, title)
  if (e.repeat && e.repeat !== 'none') r.append(el('span', 'rep', `↻ ${REPEAT_LABEL[e.repeat].toLowerCase()}`))
  r.append(ok, del)
  return r
}

export function renderCalendar(root: HTMLElement, all: CalEvent[], h: CalHandlers): void {
  const events = all.filter((e) => e.state !== 'dismissed')
  const byDay = new Map<string, CalEvent[]>()
  for (const e of events) {
    const k = dkey(new Date(e.at))
    byDay.set(k, [...(byDay.get(k) ?? []), e])
  }
  const again = () => renderCalendar(root, all, h)
  root.innerHTML = ''

  const head = el('div', 'calhead')
  const prev = el('button', 'btn ghost icon')
  prev.innerHTML = icons.prev
  prev.title = 'Mes anterior'
  const next = el('button', 'btn ghost icon')
  next.innerHTML = icons.next
  next.title = 'Mes siguiente'
  const today = el('button', 'btn small', 'Hoy')
  const title = el('strong', 'caltitle', month.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }))
  prev.onclick = () => {
    month = new Date(month.getFullYear(), month.getMonth() - 1, 1)
    again()
  }
  next.onclick = () => {
    month = new Date(month.getFullYear(), month.getMonth() + 1, 1)
    again()
  }
  today.onclick = () => {
    selected = sod(new Date())
    month = new Date(selected.getFullYear(), selected.getMonth(), 1)
    again()
  }
  head.append(title, today, prev, next)

  const grid = el('div', 'calgrid')
  for (const d of ['L', 'M', 'X', 'J', 'V', 'S', 'D']) grid.append(el('div', 'wd', d))
  const offset = (month.getDay() + 6) % 7
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - offset)
  const todayKey = dkey(new Date())
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const k = dkey(d)
    let cls = 'day'
    if (d.getMonth() !== month.getMonth()) cls += ' other'
    if (k === todayKey) cls += ' today'
    if (k === dkey(selected)) cls += ' sel'
    const b = el('button', cls)
    b.append(el('span', 'num', String(d.getDate())))
    const dots = el('span', 'dots')
    for (const e of (byDay.get(k) ?? []).slice(0, 3)) dots.append(el('i', e.state === 'done' ? 'dot done' : 'dot'))
    b.append(dots)
    b.onclick = () => {
      selected = sod(d)
      again()
    }
    grid.append(b)
  }

  const agenda = el('div', 'agenda')
  agenda.append(
    el('h4', '', selected.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })),
  )
  const todays = (byDay.get(dkey(selected)) ?? []).sort((a, b) => a.at - b.at)
  if (todays.length) for (const e of todays) agenda.append(eventRow(e, h, false))
  else agenda.append(el('div', 'none', 'Nada este día'))

  const limit = sod(new Date()).getTime()
  const upcoming = events.filter((e) => e.state === 'active' && e.at >= limit).slice(0, 8)
  agenda.append(el('h4', '', 'Próximos'))
  if (upcoming.length) for (const e of upcoming) agenda.append(eventRow(e, h, true))
  else agenda.append(el('div', 'none', 'No hay eventos próximos'))

  const left = el('div', 'calleft')
  left.append(head, grid)
  const wrap = el('div', 'calwrap')
  wrap.append(left, agenda)
  root.append(wrap)
}
