import type { Note } from './db'
import { leafOf, nodeTree, pathKey } from './links'

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function suggestTitle(body: string): string | null {
  const first = body.split('\n').find((l) => l.trim())
  if (!first) return null
  const line = first.trim()
  if (/^(#|[-*+>\d]|\[)/.test(line)) return null
  if (body.trim().length < 24) return null
  let t = line.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1').split(/[.!?:;]/)[0].trim()
  if (t.length > 48) {
    t = t.slice(0, 48)
    t = t.slice(0, Math.max(t.lastIndexOf(' '), 20)).trim()
  }
  if (t.length < 3) return null
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function suggestNodes(note: Note, notes: Note[]): string[] {
  const text = norm(note.body)
  if (text.trim().length < 12) return []
  const mine = new Set(note.nodes.map(pathKey))
  const hits = nodeTree(notes).filter((n) => {
    if (mine.has(n.key)) return false
    const leaf = norm(leafOf(n.path)).trim()
    if (leaf.length < 3) return false
    const re = new RegExp(`(^|[^a-z0-9])${leaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`)
    return re.test(text)
  })
  const keys = hits.map((h) => h.key)
  return hits
    .filter((h) => !keys.some((k) => k.startsWith(`${h.key}/`)))
    .filter((h) => !note.nodes.some((p) => pathKey(p).startsWith(`${h.key}/`)))
    .slice(0, 3)
    .map((h) => h.path)
}
