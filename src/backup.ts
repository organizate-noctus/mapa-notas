import { addVersion, allEvents, allNotes, getRaw, putRaw, type CalEvent, type Note } from './db'

function download(name: string, mime: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export async function exportJson(): Promise<number> {
  const notes = await allNotes()
  const events = await allEvents()
  const data = { app: 'mapa-notas', version: 1, exportedAt: Date.now(), notes, events }
  download(`mapa-notas-${stamp()}.json`, 'application/json', JSON.stringify(data, null, 2))
  return notes.length
}

export async function exportMarkdown(): Promise<number> {
  const notes = await allNotes()
  const text = notes
    .map((n) => `${n.body.trim()}\n${n.nodes.length ? `\nNodos: ${n.nodes.join(', ')}\n` : ''}`)
    .join('\n\n---\n\n')
  download(`mapa-notas-${stamp()}.md`, 'text/markdown', text)
  return notes.length
}

export interface ImportResult {
  added: number
  versions: number
  events: number
}

export async function importBackup(file: File): Promise<ImportResult> {
  const data = JSON.parse(await file.text()) as { app?: string; notes?: Note[]; events?: CalEvent[] }
  if (data.app !== 'mapa-notas' || !Array.isArray(data.notes)) throw new Error('No es una copia de Mapa de notas')
  const res: ImportResult = { added: 0, versions: 0, events: 0 }
  for (const n of data.notes) {
    if (!n?.id || typeof n.body !== 'string') continue
    const cur = await getRaw<Note>('notes', n.id)
    if (!cur) {
      await putRaw('notes', { ...n, nodes: n.nodes ?? [], deleted: false, dirty: true, updatedAt: Date.now() })
      res.added++
    } else if (cur.deleted) {
      await putRaw('notes', { ...cur, body: n.body, nodes: n.nodes ?? [], deleted: false, dirty: true, updatedAt: Date.now() })
      res.added++
    } else if (cur.body !== n.body) {
      await addVersion({ id: n.id, body: n.body, nodes: n.nodes ?? [] }, 'importada', true)
      res.versions++
    }
  }
  for (const e of data.events ?? []) {
    if (!e?.id || (await getRaw<CalEvent>('events', e.id))) continue
    await putRaw('events', { ...e, deleted: false, dirty: true, updatedAt: Date.now() })
    res.events++
  }
  return res
}
