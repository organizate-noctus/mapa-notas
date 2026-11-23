import type { ForceGraph3DInstance } from '3d-force-graph'
import type { Note } from './db'
import { buildGraph, type GNode } from './links'

type ThreeLib = typeof import('three')

type Obj = {
  halo: { material: { opacity: number } }
  label: { material: { opacity: number } }
  core: { material: { opacity: number } }
  base: number
}

type N = GNode & { x?: number; y?: number; z?: number; __threeObj?: { userData: Obj } }
type L = { source: N | string; target: N | string }

const STAR = '#b9c4ff'
const GOLD = '#f2b84b'
const TEXT = '#eceaf4'
const FONT = 'Instrument Sans Variable, system-ui, sans-serif'

let graph: ForceGraph3DInstance | null = null
let host: HTMLElement | null = null
let fitted = false
let active = false
let hlNodes = new Set<string>()
let hlLinks = new Set<object>()
let idleTimer: number | undefined

const radius = (n: GNode): number => (n.kind === 'tag' ? 5 : 3.4) * Math.cbrt(1 + n.degree)

function glowTexture(THREE: ThreeLib) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.18, 'rgba(255,255,255,0.55)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.12)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

function starfield(THREE: ThreeLib) {
  const count = 1500
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1
    const t = Math.random() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const r = 900 + Math.random() * 700
    pos[i * 3] = r * s * Math.cos(t)
    pos[i * 3 + 1] = r * u
    pos[i * 3 + 2] = r * s * Math.sin(t)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xaab4ff,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  )
}

function applyHighlight(): void {
  if (!graph) return
  for (const n of graph.graphData().nodes as N[]) {
    const u = n.__threeObj?.userData
    if (!u) continue
    const on = !active || hlNodes.has(n.id)
    u.halo.material.opacity = on ? u.base : u.base * 0.18
    u.label.material.opacity = on ? 1 : 0.16
    u.core.material.opacity = on ? 1 : 0.28
  }
  graph
    .linkColor((l) =>
      hlLinks.has(l) ? 'rgba(242,184,75,0.95)' : active ? 'rgba(150,160,255,0.08)' : 'rgba(150,160,255,0.5)',
    )
    .linkWidth((l) => (hlLinks.has(l) ? 1 : 0.55))
    .linkDirectionalParticles((l) => (hlLinks.has(l) ? 3 : 0))
}

function hover(n: N | null): void {
  if (!graph) return
  active = !!n
  hlNodes = new Set()
  hlLinks = new Set()
  if (n) {
    hlNodes.add(n.id)
    for (const l of graph.graphData().links as L[]) {
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const t = typeof l.target === 'object' ? l.target.id : l.target
      if (s === n.id || t === n.id) {
        hlNodes.add(s)
        hlNodes.add(t)
        hlLinks.add(l)
      }
    }
  }
  if (host) host.style.cursor = n ? 'pointer' : ''
  applyHighlight()
}

export async function showMap(
  el: HTMLElement,
  notes: Note[],
  onOpen: (id: string) => void,
): Promise<string> {
  host = el
  if (!graph) {
    const [{ default: ForceGraph3D }, { default: SpriteText }, THREE] = await Promise.all([
      import('3d-force-graph'),
      import('three-spritetext'),
      import('three'),
    ])
    const glow = glowTexture(THREE)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    graph = new ForceGraph3D(el, { controlType: 'orbit', rendererConfig: { antialias: true, alpha: true } })
      .backgroundColor('rgba(0,0,0,0)')
      .showNavInfo(false)
      .nodeLabel((n) => (n as N).label)
      .nodeThreeObjectExtend(false)
      .nodeThreeObject((n) => {
        const g = n as N
        const color = g.kind === 'tag' ? GOLD : STAR
        const r = radius(g)
        const group = new THREE.Group()
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(r, 20, 20),
          new THREE.MeshBasicMaterial({ color, transparent: true }),
        )
        const base = g.kind === 'tag' ? 0.8 : 0.55
        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glow,
            color,
            transparent: true,
            opacity: base,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        )
        halo.scale.setScalar(r * 7)
        const label = new SpriteText(g.label, g.kind === 'tag' ? 5.2 : 4.4, TEXT)
        label.fontFace = FONT
        label.fontWeight = g.kind === 'tag' ? '600' : '400'
        label.position.y = -(r + 6)
        label.material.depthWrite = false
        group.add(halo, core, label)
        group.userData = { halo, label, core, base }
        return group
      })
      .linkColor(() => 'rgba(150,160,255,0.5)')
      .linkWidth(0.55)
      .linkDirectionalParticleWidth(1.5)
      .linkDirectionalParticleSpeed(0.012)
      .linkDirectionalParticleColor(() => GOLD)
      .cooldownTime(3500)
      .onNodeHover((n) => hover(n as N | null))
      .onNodeClick((n) => {
        const g = n as N
        if (g.kind === 'note') {
          onOpen(g.id)
          return
        }
        const d = 110
        const x = g.x ?? 0
        const y = g.y ?? 0
        const z = g.z ?? 0
        const k = 1 + d / Math.max(1, Math.hypot(x, y, z))
        graph!.cameraPosition({ x: x * k, y: y * k, z: z * k }, { x, y, z }, 900)
      })
      .onEngineStop(() => {
        if (fitted) return
        fitted = true
        graph!.zoomToFit(600, 50)
      })

    graph.scene().add(starfield(THREE))

    const c = graph.controls() as unknown as {
      autoRotate: boolean
      autoRotateSpeed: number
      enableDamping: boolean
      addEventListener: (t: string, f: () => void) => void
    }
    c.enableDamping = true
    if (!reduce) {
      c.autoRotate = true
      c.autoRotateSpeed = 0.45
      c.addEventListener('start', () => {
        c.autoRotate = false
        clearTimeout(idleTimer)
      })
      c.addEventListener('end', () => {
        clearTimeout(idleTimer)
        idleTimer = window.setTimeout(() => (c.autoRotate = true), 8000)
      })
    }

    new ResizeObserver(() => {
      if (graph && host) graph.width(host.clientWidth).height(host.clientHeight)
    }).observe(el)
  }

  graph.width(el.clientWidth).height(el.clientHeight)
  graph.resumeAnimation()
  return refreshMap(notes)
}

export function refreshMap(notes: Note[]): string {
  if (!graph) return ''
  const data = buildGraph(notes)
  const prev = new Map((graph.graphData().nodes as N[]).map((n) => [n.id, n]))
  for (const n of data.nodes as N[]) {
    const p = prev.get(n.id)
    if (p) {
      n.x = p.x
      n.y = p.y
      n.z = p.z
    }
  }
  fitted = prev.size > 0
  active = false
  hlNodes = new Set()
  hlLinks = new Set()
  graph.graphData(data)
  if (!fitted) window.setTimeout(() => graph?.zoomToFit(900, 50), 1400)
  const tags = data.nodes.filter((n) => n.kind === 'tag').length
  const n = data.nodes.length - tags
  return `${n} ${n === 1 ? 'nota' : 'notas'} · ${tags} ${tags === 1 ? 'nodo' : 'nodos'} · ${data.links.length} ${data.links.length === 1 ? 'enlace' : 'enlaces'}`
}

export function hideMap(): void {
  graph?.pauseAnimation()
}
