import type { Note } from './db'

const RE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]\s+(.*)$/

export interface TaskLine {
  line: number
  done: boolean
  text: string
}

export function taskLines(body: string): TaskLine[] {
  const out: TaskLine[] = []
  let fence = false
  body.split('\n').forEach((raw, line) => {
    if (raw.trim().startsWith('```')) {
      fence = !fence
      return
    }
    if (fence) return
    const m = RE.exec(raw)
    if (m) out.push({ line, done: m[2] !== ' ', text: m[3].trim() })
  })
  return out
}

export function toggleLine(body: string, line: number): string {
  const lines = body.split('\n')
  const m = RE.exec(lines[line] ?? '')
  if (!m) return body
  lines[line] = `${m[1]}[${m[2] === ' ' ? 'x' : ' '}] ${m[3]}`
  return lines.join('\n')
}

export interface Pending {
  note: Note
  tasks: TaskLine[]
}

export function pendingTasks(notes: Note[]): Pending[] {
  const out: Pending[] = []
  for (const note of notes) {
    const tasks = taskLines(note.body).filter((t) => !t.done)
    if (tasks.length) out.push({ note, tasks })
  }
  return out
}
