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
type L = { source: N | string; target: N | string; tree?: boolean }

const STAR = '#b9c4ff'
const GOLD = '#f2b84b'
const TIER_COLOR = ['', '#f2b84b', '#ffd27a', '#ffe9bf']
const TIER_BASE = [0, 5.4, 3.8, 2.8]
const TIER_HALO = [0, 0.72, 0.58, 0.46]
const TIER_FONT = [0, 6.6, 5.2, 4.2]
const TEXT = '#eceaf4'
const FONT = 'Instrument Sans Variable, system-ui, sans-serif'

let graph: ForceGraph3DInstance | null = null
let host: HTMLElement | null = null
let fitted = false
let active = false
let hlNodes = new Set<string>()
let hlLinks = new Set<object>()
let idleTimer: number | undefined

const radius = (n: GNode): number => (n.kind === 'tag' ? TIER_BASE[n.tier] ?? 4 : 3) * Math.cbrt(1 + n.degree)

const idOf = (e: N | string): string => (typeof e === 'object' ? e.id : e)

const quietLink = (l: L): string => (l.tree ? 'rgba(242,184,75,0.5)' : 'rgba(150,160,255,0.5)')
const dimLink = (l: L): string => (l.tree ? 'rgba(242,184,75,0.1)' : 'rgba(150,160,255,0.08)')

function glowTexture(THREE: ThreeLib) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.18, 'rgba(255,255,255,0.55)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.12)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

function nebula(THREE: ThreeLib) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 1024
  const g = c.getContext('2d')!
  g.fillStyle = '#070917'
  g.fillRect(0, 0, 1024, 1024)
  const blob = (x: number, y: number, r: number, color: string) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, color)
    grad.addColorStop(1, 'rgba(7,9,23,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 1024, 1024)
  }
  blob(760, 200, 620, 'rgba(36,44,110,0.85)')
  blob(160, 900, 560, 'rgba(62,36,98,0.7)')
  blob(520, 520, 700, 'rgba(18,22,58,0.55)')
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
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

let tierMax = 3
let byId = new Map<string, N>()
let noteTags = new Map<string, string[]>()

function visibleId(id: string): boolean {
  const n = byId.get(id)
  if (!n) return true
  if (n.kind === 'tag') return n.tier <= tierMax
  const tags = noteTags.get(id)
  return !tags?.length || tags.some((t) => visibleId(t))
}

function applyVisibility(): void {
  if (!graph) return
  graph
    .nodeVisibility((n) => visibleId((n as N).id))
    .linkVisibility((l) => visibleId(idOf((l as L).source)) && visibleId(idOf((l as L).target)))
}

export const getTierMax = (): number => tierMax

export function setTierMax(max: number): void {
  tierMax = max
  applyVisibility()
  window.setTimeout(() => fit(600), 80)
}

export function flyToNode(query: string): string | null {
  if (!graph) return null
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = norm(query.trim())
  if (!q) return null
  const nodes = graph.graphData().nodes as N[]
  const hit =
    nodes.find((n) => n.kind === 'tag' && norm(n.label) === q) ??
    nodes.find((n) => n.kind === 'tag' && norm(n.label).includes(q)) ??
    nodes.find((n) => norm(n.label).includes(q))
  if (!hit || !Number.isFinite(hit.x)) return null
  if (!visibleId(hit.id)) {
    tierMax = 3
    applyVisibility()
  }
  const x = hit.x ?? 0
  const y = hit.y ?? 0
  const z = hit.z ?? 0
  const k = 1 + 90 / Math.max(1, Math.hypot(x, y, z))
  graph.cameraPosition({ x: x * k, y: y * k, z: z * k }, { x, y, z }, 900)
  hover(hit)
  window.setTimeout(() => hover(null), 2600)
  return hit.label
}

function fit(ms: number): void {
  if (!graph || !host) return
  const nodes = (graph.graphData().nodes as N[]).filter((n) => Number.isFinite(n.x) && visibleId(n.id))
  if (!nodes.length) return
  let cx = 0
  let cy = 0
  let cz = 0
  for (const n of nodes) {
    cx += n.x ?? 0
    cy += n.y ?? 0
    cz += n.z ?? 0
  }
  cx /= nodes.length
  cy /= nodes.length
  cz /= nodes.length
  let reach = 20
  for (const n of nodes) {
    const d = Math.hypot((n.x ?? 0) - cx, (n.y ?? 0) - cy, (n.z ?? 0) - cz) + radius(n) * 2.2
    if (d > reach) reach = d
  }
  const cam = graph.camera() as unknown as { fov: number; position: { x: number; y: number; z: number } }
  const aspect = Math.max(0.3, host.clientWidth / Math.max(1, host.clientHeight))
  const vHalf = (cam.fov * Math.PI) / 360
  const half = Math.min(vHalf, Math.atan(Math.tan(vHalf) * aspect))
  const dist = (reach / Math.sin(half)) * 1.0
  let dx = cam.position.x - cx
  let dy = cam.position.y - cy
  let dz = cam.position.z - cz
  const len = Math.hypot(dx, dy, dz)
  if (len < 1e-3) {
    dx = 0
    dy = 0
    dz = 1
  } else {
    dx /= len
    dy /= len
    dz /= len
  }
  graph.cameraPosition({ x: cx + dx * dist, y: cy + dy * dist, z: cz + dz * dist }, { x: cx, y: cy, z: cz }, ms)
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
    .linkColor((l) => (hlLinks.has(l) ? 'rgba(242,184,75,0.95)' : active ? dimLink(l as L) : quietLink(l as L)))
    .linkWidth((l) => (hlLinks.has(l) ? 1 : (l as L).tree ? 0.9 : 0.55))
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
      const s = idOf(l.source)
      const t = idOf(l.target)
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
    const [{ default: ForceGraph3D }, { default: SpriteText }, THREE, { UnrealBloomPass }, { OutputPass }] =
      await Promise.all([
        import('3d-force-graph'),
        import('three-spritetext'),
        import('three'),
        import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
        import('three/examples/jsm/postprocessing/OutputPass.js'),
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
        const color = g.kind === 'tag' ? TIER_COLOR[g.tier] ?? GOLD : STAR
        const r = radius(g)
        const group = new THREE.Group()
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(r, 32, 24),
          new THREE.MeshBasicMaterial({ color, transparent: true }),
        )
        const base = g.kind === 'tag' ? TIER_HALO[g.tier] ?? 0.6 : 0.5
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
        halo.scale.setScalar(r * 4.6)
        const label = new SpriteText(g.label, g.kind === 'tag' ? TIER_FONT[g.tier] ?? 5 : 4.2, TEXT)
        label.fontFace = FONT
        label.fontSize = 150
        label.fontWeight = g.kind === 'tag' ? (g.tier === 1 ? '700' : '600') : '400'
        label.position.y = -(r + 6)
        label.material.depthWrite = false
        group.add(halo, core, label)
        group.userData = { halo, label, core, base }
        return group
      })
      .linkColor((l) => quietLink(l as L))
      .linkWidth((l) => ((l as L).tree ? 0.9 : 0.55))
      .linkResolution(10)
      .linkCurvature(0.08)
      .linkDirectionalParticleWidth(1.5)
      .linkDirectionalParticleSpeed(0.012)
      .linkDirectionalParticleColor(() => GOLD)
      .warmupTicks(140)
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
        fit(700)
      })

    const linkForce = graph.d3Force('link') as unknown as { distance: (f: (l: L) => number) => void } | undefined
    linkForce?.distance((l) => (l.tree ? 60 : 42))
    const charge = graph.d3Force('charge') as unknown as
      | { strength: (v: number) => void; distanceMax: (v: number) => void }
      | undefined
    charge?.strength(-90)
    charge?.distanceMax(120)

    const strong = (navigator.hardwareConcurrency ?? 4) >= 6
    const dpr = Math.min(window.devicePixelRatio || 1, strong ? 3 : 2)
    graph.renderer().setPixelRatio(dpr)
    graph.scene().background = nebula(THREE)
    graph.scene().add(starfield(THREE))

    const composer = graph.postProcessingComposer()
    composer.setPixelRatio(dpr)
    if (strong) {
      composer.renderTarget1.samples = 4
      composer.renderTarget2.samples = 4
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(el.clientWidth, el.clientHeight), 0.45, 0.5, 0.95))
      composer.addPass(new OutputPass())
    }

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
  byId = new Map((data.nodes as N[]).map((n) => [n.id, n]))
  noteTags = new Map()
  for (const l of data.links) {
    const a = byId.get(l.source)
    const b = byId.get(l.target)
    if (!a || !b || a.kind === b.kind) continue
    const [note, tag] = a.kind === 'note' ? [a, b] : [b, a]
    noteTags.set(note.id, [...(noteTags.get(note.id) ?? []), tag.id])
  }
  graph.graphData(data)
  applyVisibility()
  if (!fitted) window.setTimeout(() => fit(900), 1400)
  const tags = data.nodes.filter((n) => n.kind === 'tag').length
  const n = data.nodes.length - tags
  return `${n} ${n === 1 ? 'nota' : 'notas'} · ${tags} ${tags === 1 ? 'nodo' : 'nodos'} · ${data.links.length} ${data.links.length === 1 ? 'enlace' : 'enlaces'}`
}

export function hideMap(): void {
  graph?.pauseAnimation()
}
