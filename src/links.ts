import type { Note } from './db'

const RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function titleOf(body: string): string {
  for (const line of body.split('\n')) {
    const t = line.replace(/^#+\s*/, '').trim()
    if (t) return t
  }
  return 'Sin título'
}

export function linkTargets(body: string): string[] {
  return [...body.matchAll(RE)].map((m) => m[1].trim())
}

export function nodeCounts(notes: Note[]): { name: string; count: number }[] {
  const map = new Map<string, { name: string; count: number }>()
  for (const n of notes) {
    for (const name of n.nodes) {
      const k = name.toLowerCase()
      const cur = map.get(k)
      if (cur) cur.count++
      else map.set(k, { name, count: 1 })
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'))
}

export interface GNode {
  id: string
  label: string
  kind: 'note' | 'tag'
  degree: number
}

export interface GLink {
  source: string
  target: string
}

export function buildGraph(notes: Note[]): { nodes: GNode[]; links: GLink[] } {
  const byTitle = new Map(notes.map((n) => [titleOf(n.body).toLowerCase(), n]))
  const nodes = new Map<string, GNode>()
  const links: GLink[] = []
  const seen = new Set<string>()

  const add = (a: string, b: string) => {
    if (a === b) return
    const k = a < b ? `${a}|${b}` : `${b}|${a}`
    if (seen.has(k)) return
    seen.add(k)
    links.push({ source: a, target: b })
    nodes.get(a)!.degree++
    nodes.get(b)!.degree++
  }

  for (const n of notes) nodes.set(n.id, { id: n.id, label: titleOf(n.body), kind: 'note', degree: 0 })

  for (const n of notes) {
    for (const t of linkTargets(n.body)) {
      const m = byTitle.get(t.toLowerCase())
      if (m) add(n.id, m.id)
    }
    for (const name of n.nodes) {
      const tid = `node:${name.toLowerCase()}`
      if (!nodes.has(tid)) nodes.set(tid, { id: tid, label: name, kind: 'tag', degree: 0 })
      add(n.id, tid)
    }
  }

  return { nodes: [...nodes.values()], links }
}

export function renderLinks(body: string): string {
  return body.replace(
    RE,
    (_, t: string, a?: string) =>
      `<a href="#" class="wl" data-t="${esc(t.trim())}">${esc((a ?? t).trim())}</a>`,
  )
}

export function findByTitle(notes: Note[], title: string): Note | undefined {
  const k = title.trim().toLowerCase()
  return notes.find((n) => titleOf(n.body).toLowerCase() === k)
}

export function backlinks(notes: Note[], note: Note): Note[] {
  const k = titleOf(note.body).toLowerCase()
  return notes.filter(
    (n) => n.id !== note.id && linkTargets(n.body).some((t) => t.toLowerCase() === k),
  )
}
