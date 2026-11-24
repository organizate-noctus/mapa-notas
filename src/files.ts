import { getFile, markUploaded, pendingFiles, putFile, type StoredFile } from './db'
import { supabase } from './sync'

const BUCKET = 'adjuntos'
const MAX_SIDE = 1600

export const ADJ_RE = /!\[([^\]]*)\]\(adj:([0-9a-f]{16})\)/g

const urls = new Map<string, string>()

function newId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')
}

function toBlob(c: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return new Promise((res) => c.toBlob(res, type, q))
}

export async function shrink(src: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(src, { imageOrientation: 'from-image' })
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * k))
  c.height = Math.max(1, Math.round(bmp.height * k))
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  const webp = await toBlob(c, 'image/webp', 0.82)
  if (webp && webp.type === 'image/webp') return webp
  return (await toBlob(c, 'image/jpeg', 0.85)) ?? src
}

export async function saveAttachment(blob: Blob, kind: 'photo' | 'draw'): Promise<string> {
  const id = newId()
  await putFile({ id, blob, kind, uploaded: false, at: Date.now() })
  return id
}

async function userPath(id: string): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  return uid ? `${uid}/${id}` : null
}

export async function blobOf(id: string): Promise<Blob | null> {
  const local = await getFile(id)
  if (local) return local.blob
  try {
    const path = await userPath(id)
    if (!path) return null
    const { data, error } = await supabase!.storage.from(BUCKET).download(path)
    if (error || !data) return null
    await putFile({ id, blob: data, kind: 'photo', uploaded: true, at: Date.now() })
    return data
  } catch {
    return null
  }
}

export async function urlFor(id: string): Promise<string | null> {
  const known = urls.get(id)
  if (known) return known
  const b = await blobOf(id)
  if (!b) return null
  const u = URL.createObjectURL(b)
  urls.set(id, u)
  return u
}

export async function kindOf(id: string): Promise<StoredFile['kind'] | null> {
  return (await getFile(id))?.kind ?? null
}

export function attachmentIds(body: string): { id: string; alt: string }[] {
  return [...body.matchAll(ADJ_RE)].map((m) => ({ id: m[2], alt: m[1] }))
}

export async function uploadPending(): Promise<void> {
  if (!supabase) return
  const todo = await pendingFiles()
  if (!todo.length) return
  for (const f of todo) {
    const path = await userPath(f.id)
    if (!path) return
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, f.blob, { contentType: f.blob.type || 'image/webp', upsert: true })
    if (error) return
    await markUploaded(f.id)
  }
}
