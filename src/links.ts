import type { Note } from './db'

const RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function titleOf(body: string): string {
  for (const line of body.split('\n')) {
    const t = line.replace(/!\[[^\]]*\]\(adj:[0-9a-f]{16}\)/g, '').replace(/^#+\s*/, '').trim()
    if (t) return t
  }
  return 'Sin título'
}

export function linkTargets(body: string): string[] {
  return [...body.matchAll(RE)].map((m) => m[1].trim())
}

export const MAX_TIER = 3

export function pathParts(path: string): string[] {
  return path
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_TIER)
}

export function pathKey(path: string): string {
  return pathParts(path).join('/').toLowerCase()
}

export function tierOf(path: string): number {
  return pathParts(path).length
}

export function leafOf(path: string): string {
  const p = pathParts(path)
  return p[p.length - 1] ?? path
}

export function joinPath(parts: string[]): string {
  return parts.join('/')
}

export function showPath(path: string): string {
  return pathParts(path).join(' › ')
}

export interface NodeInfo {
  path: string
  key: string
  tier: number
  count: number
}

export function nodeTree(notes: Note[]): NodeInfo[] {
  const map = new Map<string, NodeInfo>()
  const canon = new Map<string, string>()
  const addPath = (full: string, noteId: string, seen: Map<string, Set<string>>) => {
    const parts = pathParts(full)
    const out: string[] = []
    for (const part of parts) {
      out.push(part)
      const k = out.join('/').toLowerCase()
      if (!canon.has(k)) canon.set(k, joinPath(out))
      let info = map.get(k)
      if (!info) {
        info = { path: canon.get(k)!, key: k, tier: out.length, count: 0 }
        map.set(k, info)
      }
      let s = seen.get(k)
      if (!s) seen.set(k, (s = new Set()))
      if (!s.has(noteId)) {
        s.add(noteId)
        info.count++
      }
    }
  }
  const seen = new Map<string, Set<string>>()
  for (const n of notes) for (const p of n.nodes) addPath(p, n.id, seen)
  return [...map.values()].sort((a, b) => {
    const pa = a.key.split('/')
    const pb = b.key.split('/')
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
      if (pa[i] !== pb[i]) return pa[i].localeCompare(pb[i], 'es')
    }
    return pa.length - pb.length
  })
}

export function deepestNodes(paths: string[]): string[] {
  const keys = paths.map(pathKey)
  return paths.filter((_, i) => !keys.some((k, j) => j !== i && k.startsWith(`${keys[i]}/`)))
}

export interface GNode {
  id: string
  label: string
  kind: 'note' | 'tag'
  degree: number
  tier: number
}

export interface GLink {
  source: string
  target: string
  tree?: boolean
}

export function buildGraph(notes: Note[]): { nodes: GNode[]; links: GLink[] } {
  const byTitle = new Map(notes.map((n) => [titleOf(n.body).toLowerCase(), n]))
  const nodes = new Map<string, GNode>()
  const links: GLink[] = []
  const seen = new Set<string>()

  const add = (a: string, b: string, tree = false) => {
    if (a === b) return
    const k = a < b ? `${a}|${b}` : `${b}|${a}`
    if (seen.has(k)) return
    seen.add(k)
    links.push(tree ? { source: a, target: b, tree } : { source: a, target: b })
    nodes.get(a)!.degree++
    nodes.get(b)!.degree++
  }

  for (const n of notes) nodes.set(n.id, { id: n.id, label: titleOf(n.body), kind: 'note', degree: 0, tier: 0 })

  const tagId = (parts: string[]): string => {
    const id = `node:${parts.join('/').toLowerCase()}`
    if (!nodes.has(id)) nodes.set(id, { id, label: parts[parts.length - 1], kind: 'tag', degree: 0, tier: parts.length })
    return id
  }

  for (const n of notes) {
    for (const t of linkTargets(n.body)) {
      const m = byTitle.get(t.toLowerCase())
      if (m) add(n.id, m.id)
    }
    for (const path of deepestNodes(n.nodes)) {
      const parts = pathParts(path)
      if (!parts.length) continue
      let parent = ''
      for (let i = 1; i <= parts.length; i++) {
        const id = tagId(parts.slice(0, i))
        if (parent) add(parent, id, true)
        parent = id
      }
      add(n.id, parent)
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
