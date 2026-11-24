import type { CalEvent, Note } from './db'
import { eventRow, type CalHandlers } from './calendar'
import { titleOf } from './links'

interface TodayDeps {
  events: CalEvent[]
  notes: Note[]
  handlers: CalHandlers
  pending: () => HTMLElement
  openNote: (id: string) => void
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

const startOfDay = (d: Date): number => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.getTime()
}

function section(title: string): HTMLElement {
  const s = el('section', 'tsec')
  s.append(el('h4', '', title))
  return s
}

export function renderToday(root: HTMLElement, d: TodayDeps): void {
  root.innerHTML = ''
  const wrap = el('div', 'todaywrap')
  const now = new Date()
  const t0 = startOfDay(now)
  const t1 = t0 + 86400000
  const t2 = t1 + 86400000
  const live = d.events.filter((e) => e.state !== 'dismissed')

  const hour = now.getHours()
  const hello = hour < 6 ? 'Buenas noches' : hour < 14 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches'
  const head = el('div', 'thead')
  head.append(
    el('div', 'thello', hello),
    el('div', 'tdate', now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })),
  )
  wrap.append(head)

  const lists: [string, CalEvent[]][] = [
    ['Atrasados', live.filter((e) => e.state === 'active' && e.at < t0).slice(-5)],
    ['Hoy', live.filter((e) => e.at >= t0 && e.at < t1)],
    ['Mañana', live.filter((e) => e.at >= t1 && e.at < t2)],
  ]
  let shown = 0
  for (const [title, list] of lists) {
    if (!list.length) continue
    shown += list.length
    const s = section(title)
    for (const e of list.sort((a, b) => a.at - b.at)) s.append(eventRow(e, d.handlers, title === 'Atrasados'))
    wrap.append(s)
  }
  if (!shown) {
    const s = section('Agenda')
    s.append(el('div', 'none', 'Nada programado para hoy ni mañana.'))
    wrap.append(s)
  }

  const pend = d.pending()
  if (pend.querySelector('.pend')) wrap.append(pend)

  const recent = d.notes.slice(0, 5)
  if (recent.length) {
    const s = section('Recientes')
    for (const n of recent) {
      const b = el('button', 'fnote', titleOf(n.body))
      b.onclick = () => d.openNote(n.id)
      s.append(b)
    }
    wrap.append(s)
  }
  root.append(wrap)
}
