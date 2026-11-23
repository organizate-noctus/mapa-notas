const READY_KEY = 'voz-lista'

let worker: Worker | null = null
let ready = false

export function modelCached(): boolean {
  try {
    return localStorage.getItem(READY_KEY) === '1'
  } catch {
    return false
  }
}

function getWorker(): Worker {
  worker ??= new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
  return worker
}

export function loadModel(onProgress: (pct: number) => void): Promise<void> {
  if (ready) return Promise.resolve()
  const w = getWorker()
  return new Promise((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      const d = e.data as { type: string; pct?: number; message?: string }
      if (d.type === 'progress') onProgress(d.pct ?? 0)
      else if (d.type === 'ready') {
        ready = true
        try {
          localStorage.setItem(READY_KEY, '1')
        } catch {
          void 0
        }
        w.removeEventListener('message', handler)
        resolve()
      } else if (d.type === 'error') {
        w.removeEventListener('message', handler)
        reject(new Error(d.message))
      }
    }
    w.addEventListener('message', handler)
    w.postMessage({ type: 'load' })
  })
}

export function transcribe(audio: Float32Array): Promise<string> {
  const w = getWorker()
  return new Promise((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      const d = e.data as { type: string; text?: string; message?: string }
      if (d.type === 'text') {
        w.removeEventListener('message', handler)
        resolve(d.text ?? '')
      } else if (d.type === 'error') {
        w.removeEventListener('message', handler)
        reject(new Error(d.message))
      }
    }
    w.addEventListener('message', handler)
    w.postMessage({ type: 'run', audio }, [audio.buffer])
  })
}

export async function decodeAudio(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16000 })
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    return new Float32Array(buf.getChannelData(0))
  } finally {
    await ctx.close()
  }
}

export class Recorder {
  private rec: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
    this.chunks = []
    this.rec = new MediaRecorder(this.stream)
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data)
    }
    this.rec.start()
  }

  stop(): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
      const r = this.rec
      if (!r) {
        reject(new Error('No se estaba grabando'))
        return
      }
      r.onstop = async () => {
        this.stream?.getTracks().forEach((t) => t.stop())
        try {
          resolve(await decodeAudio(new Blob(this.chunks, { type: r.mimeType })))
        } catch (err) {
          reject(err)
        }
      }
      r.stop()
    })
  }

  cancel(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    if (this.rec && this.rec.state !== 'inactive') {
      this.rec.onstop = null
      this.rec.stop()
    }
  }
}
