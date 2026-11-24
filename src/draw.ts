import { icons } from './icons'

type Paper = 'dark' | 'light' | 'grid'

const PAPER_BG: Record<Paper, string> = { dark: '#0d1020', light: '#fbf8ef', grid: '#0d1020' }
const INKS = ['#eceaf4', '#f2b84b', '#7aa2ff', '#ff7a8a', '#7ee0a1', '#1b1d2e']
const SIZES: [string, number][] = [
  ['Fino', 3],
  ['Medio', 7],
  ['Grueso', 18],
]
const MAX_UNDO = 10

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

function gridStep(w: number): number {
  return Math.round(w / 24)
}

function paintGrid(g: CanvasRenderingContext2D, w: number, h: number): void {
  const s = gridStep(w)
  g.strokeStyle = 'rgba(150,160,255,0.3)'
  g.lineWidth = 1
  g.beginPath()
  for (let x = s; x < w; x += s) {
    g.moveTo(x + 0.5, 0)
    g.lineTo(x + 0.5, h)
  }
  for (let y = s; y < h; y += s) {
    g.moveTo(0, y + 0.5)
    g.lineTo(w, y + 0.5)
  }
  g.stroke()
}

export async function openDrawing(initial?: Blob): Promise<Blob | null> {
  let W = window.innerWidth < window.innerHeight ? 900 : 1200
  let H = window.innerWidth < window.innerHeight ? 1200 : 800
  let bmp: ImageBitmap | null = null
  if (initial) {
    try {
      bmp = await createImageBitmap(initial)
      const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height))
      W = Math.round(bmp.width * k)
      H = Math.round(bmp.height * k)
    } catch {
      bmp = null
    }
  }

  const dlg = el('dialog', 'drawdlg')
  const bar = el('div', 'drawbar')
  const area = el('div', 'drawarea')
  const canvas = el('canvas', 'drawcv')
  canvas.width = W
  canvas.height = H
  canvas.style.aspectRatio = `${W} / ${H}`
  area.append(canvas)
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  g.lineCap = 'round'
  g.lineJoin = 'round'
  if (bmp) {
    g.drawImage(bmp, 0, 0, W, H)
    bmp.close()
  }

  let paper: Paper = 'dark'
  let ink = INKS[0]
  let size = SIZES[1][1]
  let eraser = false
  const undo: ImageData[] = []

  const applyPaper = () => {
    canvas.style.backgroundColor = PAPER_BG[paper]
    if (paper === 'grid') {
      const s = (gridStep(W) / W) * 100
      canvas.style.backgroundImage = `linear-gradient(rgba(150,160,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(150,160,255,0.3) 1px, transparent 1px)`
      canvas.style.backgroundSize = `${s}% ${(gridStep(W) / H) * 100}%`
    } else canvas.style.backgroundImage = 'none'
  }
  applyPaper()

  const inks = el('div', 'inks')
  const inkBtns: HTMLButtonElement[] = INKS.map((c) => {
    const b = el('button', 'ink')
    b.type = 'button'
    b.style.background = c
    b.title = 'Color'
    b.onclick = () => {
      ink = c
      eraser = false
      sync()
    }
    inks.append(b)
    return b
  })

  const sizes = el('div', 'seg')
  const sizeBtns: HTMLButtonElement[] = SIZES.map(([label, px]) => {
    const b = el('button', '', label)
    b.type = 'button'
    b.onclick = () => {
      size = px
      sync()
    }
    sizes.append(b)
    return b
  })

  const eraserBtn = el('button', 'btn small', 'Goma')
  eraserBtn.type = 'button'
  eraserBtn.onclick = () => {
    eraser = !eraser
    sync()
  }

  const paperBtn = el('button', 'btn small', 'Papel')
  paperBtn.type = 'button'
  paperBtn.onclick = () => {
    const was = paper
    paper = paper === 'dark' ? 'grid' : paper === 'grid' ? 'light' : 'dark'
    if (paper === 'light' && ink === INKS[0]) ink = INKS[5]
    if (was === 'light' && ink === INKS[5]) ink = INKS[0]
    applyPaper()
    sync()
  }

  const undoBtn = el('button', 'btn small icon')
  undoBtn.type = 'button'
  undoBtn.innerHTML = icons.undo
  undoBtn.title = 'Deshacer'
  undoBtn.onclick = () => {
    const s = undo.pop()
    if (s) g.putImageData(s, 0, 0)
    sync()
  }

  const clearBtn = el('button', 'btn small ghost', 'Borrar todo')
  clearBtn.type = 'button'
  clearBtn.onclick = () => {
    push()
    g.clearRect(0, 0, W, H)
    sync()
  }

  const sync = () => {
    inkBtns.forEach((b, i) => b.classList.toggle('on', !eraser && INKS[i] === ink))
    sizeBtns.forEach((b, i) => b.classList.toggle('on', SIZES[i][1] === size))
    eraserBtn.classList.toggle('on', eraser)
    paperBtn.textContent = paper === 'dark' ? 'Papel: oscuro' : paper === 'grid' ? 'Papel: cuadrícula' : 'Papel: claro'
    undoBtn.disabled = !undo.length
  }

  const push = () => {
    undo.push(g.getImageData(0, 0, W, H))
    if (undo.length > MAX_UNDO) undo.shift()
  }

  const pos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }

  const px = () => size * (W / 900)
  const widthFor = (e: PointerEvent) =>
    e.pointerType === 'pen' && e.pressure > 0 ? px() * (0.35 + e.pressure * 1.3) : px()

  let drawing = false
  let last: { x: number; y: number } | null = null
  let mid: { x: number; y: number } | null = null

  const stroke = (e: PointerEvent) => {
    const p = pos(e)
    g.globalCompositeOperation = eraser ? 'destination-out' : 'source-over'
    g.strokeStyle = ink
    g.fillStyle = ink
    g.lineWidth = eraser ? px() * 2.4 : widthFor(e)
    if (!last) {
      g.beginPath()
      g.arc(p.x, p.y, g.lineWidth / 2, 0, Math.PI * 2)
      g.fill()
      last = p
      mid = p
      return
    }
    const m = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 }
    g.beginPath()
    g.moveTo(mid!.x, mid!.y)
    g.quadraticCurveTo(last.x, last.y, m.x, m.y)
    g.stroke()
    last = p
    mid = m
  }

  canvas.onpointerdown = (e) => {
    if (e.button > 0) return
    e.preventDefault()
    canvas.setPointerCapture(e.pointerId)
    push()
    drawing = true
    last = null
    stroke(e)
    sync()
  }
  canvas.onpointermove = (e) => {
    if (!drawing) return
    e.preventDefault()
    const list = e.getCoalescedEvents?.() ?? []
    if (list.length) for (const c of list) stroke(c)
    else stroke(e)
  }
  const end = () => {
    if (!drawing) return
    drawing = false
    if (last && mid && (last.x !== mid.x || last.y !== mid.y)) {
      g.beginPath()
      g.moveTo(mid.x, mid.y)
      g.lineTo(last.x, last.y)
      g.stroke()
    }
    last = null
    mid = null
    g.globalCompositeOperation = 'source-over'
  }
  canvas.onpointerup = end
  canvas.onpointercancel = end

  const save = el('button', 'btn primary', 'Guardar')
  save.type = 'button'
  const cancel = el('button', 'btn ghost', 'Cancelar')
  cancel.type = 'button'

  const row1 = el('div', 'drawrow')
  row1.append(inks, sizes, eraserBtn)
  const row2 = el('div', 'drawrow')
  row2.append(paperBtn, undoBtn, clearBtn, el('span', 'sp'), cancel, save)
  bar.append(row1, row2)
  dlg.append(area, bar)
  document.body.append(dlg)
  sync()

  return new Promise((resolve) => {
    let result: Blob | null = null
    dlg.addEventListener('close', () => {
      dlg.remove()
      resolve(result)
    })
    dlg.addEventListener('cancel', () => {
      result = null
    })
    cancel.onclick = () => dlg.close()
    save.onclick = async () => {
      const out = el('canvas')
      out.width = W
      out.height = H
      const o = out.getContext('2d')!
      o.fillStyle = PAPER_BG[paper]
      o.fillRect(0, 0, W, H)
      if (paper === 'grid') paintGrid(o, W, H)
      o.drawImage(canvas, 0, 0)
      result = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/webp', 0.92))
      if (!result || result.type !== 'image/webp') {
        result = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'))
      }
      dlg.close()
    }
    dlg.showModal()
  })
}
