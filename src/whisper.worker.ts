import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false

const MODEL = 'onnx-community/whisper-base'

type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>

interface Progress {
  status: string
  file?: string
  loaded?: number
  total?: number
}

let asr: Asr | null = null
const files = new Map<string, { loaded: number; total: number }>()

function report(p: Progress): void {
  if (p.status !== 'progress' || !p.file || !p.total) return
  files.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
  let loaded = 0
  let total = 0
  for (const f of files.values()) {
    loaded += f.loaded
    total += f.total
  }
  self.postMessage({ type: 'progress', pct: total ? (loaded / total) * 100 : 0 })
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data as { type: string; audio?: Float32Array }
  try {
    if (m.type === 'load') {
      asr ??= (await pipeline('automatic-speech-recognition', MODEL, {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: report,
      })) as unknown as Asr
      self.postMessage({ type: 'ready' })
    } else if (m.type === 'run' && asr && m.audio) {
      const out = await asr(m.audio, {
        language: 'spanish',
        task: 'transcribe',
        chunk_length_s: 30,
        stride_length_s: 5,
      })
      const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text
      self.postMessage({ type: 'text', text: text.trim() })
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
