import { marked } from 'marked'
import DOMPurify from 'dompurify'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/instrument-sans'
import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { icons } from './icons'
import { exportJson, exportMarkdown, importBackup } from './backup'
import { pendingTasks, taskLines, toggleLine } from './tasks'
import { norm, suggestNodes, suggestTitle } from './suggest'
import { initPalette, type PaletteItem } from './palette'
import {
  addEvent,
  addVersion,
  versionsOf,
  allEvents,
  allNotes,
  createNote,
  eventKeys,
  patchEvent,
  removeEvent,
  removeNote,
  saveBody,
  setNodes,
  type CalEvent,
  type EventState,
  type Note,
  type Repeat,
} from './db'
import {
  MAX_TIER,
  backlinks,
  deepestNodes,
  findByTitle,
  joinPath,
  leafOf,
  nodeTree,
  pathKey,
  pathParts,
  renderLinks,
  showPath,
  titleOf,
} from './links'
import { currentEmail, signIn, signOut, signUp, supabase, sync } from './sync'
import { flyToNode, getFocus, getTierMax, hideMap, refreshMap, setFocus, setTierMax, showMap } from './graph'
import { ADJ_RE, attachmentIds, blobOf, kindOf, saveAttachment, shrink, uploadPending, urlFor } from './files'
import { openDrawing } from './draw'
import { REPEAT_LABEL, defaultRemind, detectEvents, fmtWhen, nextOccurrence, remindOptions, type Proposal } from './events'
import { renderCalendar, type CalHandlers } from './calendar'
import { renderToday } from './today'
import { enableNotifications, notificationsState, startReminders } from './reminders'
import { disablePush, enablePush, pushActive, pushSupported, resyncPush } from './push'
import { Recorder, loadModel, modelCached, transcribe } from './voice'

const root = document.querySelector<HTMLDivElement>('#app')!

root.innerHTML = `
<div class="app" id="shell">
  <nav class="rail" id="rail" aria-label="Secciones">
    <span class="mark">${icons.mark}</span>
    <button class="tab on" id="tabnotes">${icons.notes}<span>Notas</span></button>
    <button class="tab" id="todaybtn">${icons.sun}<span>Hoy</span></button>
    <button class="tab" id="foldbtn">${icons.folder}<span>Carpetas</span></button>
    <button class="tab" id="mapbtn">${icons.map}<span>Mapa</span></button>
    <button class="tab" id="calbtn">${icons.calendar}<span>Agenda</span></button>
    <span class="grow"></span>
    <button class="tab" id="acct" title="Cuenta">${icons.user}<span>Cuenta</span><i class="pulse" id="pulse"></i></button>
  </nav>
  <aside class="side">
    <header class="side-head">
      <h1>Notas</h1>
      <button class="btn primary small" id="new">${icons.plus}Nueva</button>
    </header>
    <div class="search">${icons.search}<input id="q" type="search" placeholder="Buscar notas (Ctrl+K)" autocomplete="off" /></div>
    <ul id="list"></ul>
    <div class="side-foot">
      <span id="status"></span>
    </div>
  </aside>
  <main class="main">
    <div class="bar" id="bar" hidden>
      <button class="btn ghost icon" id="back" title="Volver">${icons.back}</button>
      <button class="btn small" id="mode"></button>
      <button class="btn small" id="mic"></button>
      <button class="btn ghost icon" id="photo" title="Añadir foto">${icons.image}</button>
      <button class="btn ghost icon" id="draw" title="Dibujar a mano">${icons.brush}</button>
      <input type="file" id="pfile" accept="image/*" multiple hidden />
      <span class="sp"></span>
      <button class="btn ghost icon" id="hist" title="Historial de versiones">${icons.history}</button>
      <button class="btn ghost icon danger" id="del" title="Borrar nota">${icons.trash}</button>
    </div>
    <div class="nodebar" id="nodebar" hidden>
      <span id="chips"></span>
      <div class="nodewrap">
        <button class="btn ghost small" id="nodebtn">${icons.plus}Nodo</button>
        <div id="nodepop" hidden>
          <div class="newnode">
            <select id="nparent" aria-label="Dentro de"></select>
            <input id="nnew" placeholder="Nuevo nodo" autocomplete="off" />
            <button class="btn primary small" id="nadd">Crear</button>
          </div>
          <div id="nlist"></div>
        </div>
      </div>
      <button class="btn ghost small" id="nbhd" title="Ver solo lo conectado a esta nota">${icons.hub}Vecindario</button>
    </div>
    <div id="empty">
      ${icons.constellation}
      <h2>Tu mapa empieza aquí</h2>
      <p>Apunta una idea, enlázala con otra y verás cómo se forma tu constelación.</p>
      <button class="btn primary" id="emptynew">${icons.plus}Nueva nota</button>
    </div>
    <div class="doc" id="doc" hidden>
      <div class="col">
        <textarea id="ed" hidden spellcheck="false" placeholder="Escribe aquí. Enlaza notas con [[Título]]"></textarea>
        <div id="atts" hidden></div>
        <article id="pv" hidden></article>
        <section id="prop"></section>
        <section id="bl"></section>
      </div>
    </div>
    <div id="mapview" hidden>
      <div id="graph"></div>
      <div class="maphud"><div class="card"><span><i class="nota"></i>Nota</span><span><i class="nodo"></i>Nodo</span><span id="mapinfo"></span></div>
        <div class="card mapctl">
          <input id="mapq" type="search" placeholder="Buscar nodo…" autocomplete="off" aria-label="Buscar en el mapa" />
          <span class="seg" id="tierseg">
            <button type="button" data-t="1">Nivel 1</button>
            <button type="button" data-t="2">1–2</button>
            <button type="button" data-t="3" class="on">Todo</button>
          </span>
        </div>
        <div class="card mapctl" id="focuschip" hidden><span id="focustxt"></span><button type="button" class="btn small" id="focusoff">Ver todo</button></div></div>
      <div class="maphint">Arrastra para girar · rueda o pellizco para acercar · toca una nota para abrirla</div>
    </div>
    <div id="todayview" hidden>
      <div id="todaybody"></div>
    </div>
    <div id="foldview" hidden>
      <div class="pagehead"><h2>Carpetas</h2></div>
      <div id="foldbody"></div>
    </div>
    <div id="calview" hidden>
      <div class="pagehead">
        <h2>Agenda</h2>
        <button class="btn small" id="calnotif" hidden>${icons.bell}Activar avisos</button>
        <button class="btn primary small" id="caladd">${icons.plus}Evento</button>
      </div>
      <div id="calbody"></div>
    </div>
  </main>
  <dialog id="dlg">
    <form method="dialog" id="dform">
      <strong id="dtitle">Cuenta</strong>
      <input id="dmail" type="email" placeholder="Email" autocomplete="email" />
      <input id="dpass" type="password" placeholder="Contraseña" autocomplete="current-password" />
      <div id="dmsg"></div>
      <div class="row">
        <button type="button" class="btn primary" id="dlogin">Entrar</button>
        <button type="button" class="btn" id="dsignup">Crear cuenta</button>
      </div>
      <div class="row">
        <button type="button" class="btn" id="dlogout">Cerrar sesión</button>
        <button type="button" class="btn ghost" id="dclose">Cerrar</button>
      </div>
      <div id="dgbox" hidden>
        <hr />
        <strong class="sub">Resumen matinal</strong>
        <div class="row">
          <label class="chk"><input type="checkbox" id="dgon" />Avisarme cada mañana</label>
          <select id="dghour" aria-label="Hora del resumen">
            ${[6, 7, 8, 9, 10].map((h) => `<option value="${h}">${h}:00</option>`).join('')}
          </select>
        </div>
        <div id="dgmsg"></div>
      </div>
      <hr />
      <strong class="sub">Copia de seguridad</strong>
      <div class="row">
        <button type="button" class="btn" id="bjson">Exportar copia</button>
        <button type="button" class="btn" id="bmd">Exportar texto</button>
      </div>
      <button type="button" class="btn" id="bimp">Importar copia</button>
      <input type="file" id="bfile" accept="application/json,.json" hidden />
      <div id="bmsg"></div>
    </form>
  </dialog>
  <dialog id="pdlg">
    <div id="pbox">
      <input id="pq" type="search" placeholder="Buscar nota o ir a…" autocomplete="off" aria-label="Buscar" />
      <div id="pres"></div>
    </div>
  </dialog>
  <dialog id="vdlg">
    <div id="vbox">
      <img id="vimg" alt="" />
      <div class="row">
        <button type="button" class="btn" id="vedit" hidden>${icons.brush}Seguir dibujando</button>
        <button type="button" class="btn ghost" id="vclose">Cerrar</button>
      </div>
    </div>
  </dialog>
  <dialog id="hdlg">
    <form method="dialog">
      <strong>Historial de versiones</strong>
      <div id="hlist"></div>
      <div class="row"><button type="button" class="btn ghost" id="hclose">Cerrar</button></div>
    </form>
  </dialog>
  <dialog id="edlg">
    <form method="dialog">
      <strong>Nuevo evento</strong>
      <input id="etitle" placeholder="Título" autocomplete="off" />
      <div class="row">
        <input id="edate" type="date" />
        <input id="etime" type="time" />
      </div>
      <select id="eremind"></select>
      <select id="erepeat" aria-label="Repetir">
        ${(Object.entries(REPEAT_LABEL) as [string, string][]).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
      <div id="emsg"></div>
      <div class="row">
        <button type="button" class="btn primary" id="esave">Guardar</button>
        <button type="button" class="btn ghost" id="ecancel">Cancelar</button>
      </div>
    </form>
  </dialog>
  <div id="toast" hidden></div>
</div>`

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const shell = $('shell')
const listEl = $('list')
const qEl = $<HTMLInputElement>('q')
const edEl = $<HTMLTextAreaElement>('ed')
const pvEl = $('pv')
const attsEl = $('atts')
const blEl = $('bl')
const propEl = $('prop')
const barEl = $('bar')
const nodebarEl = $('nodebar')
const chipsEl = $('chips')
const nodePop = $('nodepop')
const nodeList = $('nlist')
const nodeInput = $<HTMLInputElement>('nnew')
const emptyEl = $('empty')
const modeBtn = $('mode')
const statusEl = $('status')
const acctBtn = $('acct')
const dlg = $<HTMLDialogElement>('dlg')
const edlg = $<HTMLDialogElement>('edlg')
const mapEl = $('mapview')
const graphEl = $('graph')
const mapInfo = $('mapinfo')
const foldEl = $('foldview')
const foldBody = $('foldbody')
const parentSel = $<HTMLSelectElement>('nparent')
const calEl = $('calview')
const calBody = $('calbody')
const calNotif = $('calnotif')
const toastEl = $('toast')
const docEl = $('doc')
const pulseEl = $('pulse')
const micBtn = $<HTMLButtonElement>('mic')
const todayEl = $('todayview')
const todayBody = $('todaybody')
const tabs: Record<string, HTMLElement> = {
  none: $('tabnotes'),
  today: $('todaybtn'),
  folders: $('foldbtn'),
  map: $('mapbtn'),
  cal: $('calbtn'),
}

type Panel = 'none' | 'map' | 'cal' | 'folders' | 'today'

const openFolders = new Set<string>()
let foldersSeeded = false

let panel: Panel = 'none'
let notes: Note[] = []
let events: CalEvent[] = []
let evKeys = new Set<string>()
let currentId: string | null = null
let reading = false
let syncTimer: number | undefined
let propTimer: number | undefined
let toastTimer: number | undefined
let syncing = false

function current(): Note | undefined {
  return notes.find((n) => n.id === currentId)
}

function rel(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  if (d === 1) return 'ayer'
  if (d < 7) return `hace ${d} días`
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function fitEditor(): void {
  edEl.style.height = 'auto'
  edEl.style.height = `${edEl.scrollHeight}px`
}

function toast(title: string, body: string): void {
  toastEl.innerHTML = icons.bell
  const t = document.createElement('strong')
  t.textContent = title
  const b = document.createElement('span')
  b.textContent = body
  toastEl.append(t, b)
  toastEl.hidden = false
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), 10000)
}

toastEl.onclick = () => (toastEl.hidden = true)

function snippet(body: string): string {
  const lines = body
    .split('\n')
    .map((l) => l.replace(ADJ_RE, '').trim())
    .filter(Boolean)
  return (lines[1] ?? '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1').slice(0, 80)
}

function renderList(): void {
  const q = qEl.value.trim().toLowerCase()
  const shown = q
    ? notes.filter((n) => n.body.toLowerCase().includes(q) || n.nodes.some((x) => x.toLowerCase().includes(q)))
    : notes
  listEl.innerHTML = ''
  if (!shown.length) {
    const li = document.createElement('li')
    li.className = 'none'
    li.textContent = q ? 'Ninguna nota coincide con la búsqueda' : 'Aún no tienes notas'
    listEl.append(li)
  }
  for (const n of shown) {
    const li = document.createElement('li')
    if (n.id === currentId && panel === 'none') li.className = 'active'
    const t = document.createElement('div')
    t.className = 't'
    t.textContent = titleOf(n.body)
    const s = document.createElement('div')
    s.className = 's'
    s.textContent = snippet(n.body)
    const m = document.createElement('div')
    m.className = 'm'
    if (n.nodes.length) {
      const nodes = document.createElement('span')
      nodes.className = 'n'
      nodes.textContent = deepestNodes(n.nodes).map(showPath).join(', ')
      m.append(nodes)
    }
    const time = document.createElement('time')
    time.textContent = rel(n.updatedAt)
    m.append(time)
    li.append(t, s, m)
    li.onclick = () => open(n.id)
    listEl.append(li)
  }
}

let attsKey = ''

function renderAtts(force = false): void {
  const n = current()
  const list = n && !reading && panel === 'none' ? attachmentIds(n.body) : []
  const key = list.map((a) => a.id).join(',')
  attsEl.hidden = !list.length
  if (key === attsKey && !force) return
  attsKey = key
  attsEl.innerHTML = ''
  for (const a of list) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'thumb'
    b.title = a.alt || 'Imagen'
    const img = document.createElement('img')
    img.alt = a.alt
    void urlFor(a.id).then((u) => {
      if (u) img.src = u
    })
    b.append(img)
    b.onclick = () => void viewAttachment(a.id)
    attsEl.append(b)
  }
}

let viewing = ''

async function viewAttachment(id: string): Promise<void> {
  const u = await urlFor(id)
  if (!u) {
    toast('Imagen no disponible', 'Todavía no se ha descargado. Prueba con conexión y sincroniza')
    return
  }
  viewing = id
  $<HTMLImageElement>('vimg').src = u
  $('vedit').hidden = (await kindOf(id)) !== 'draw'
  const d = $<HTMLDialogElement>('vdlg')
  if (!d.open) d.showModal()
}

function insertBlock(text: string): void {
  if (reading) {
    reading = false
    renderMain()
  }
  const v = edEl.value
  const pos = Math.min(edEl.selectionStart ?? v.length, v.length)
  const before = v.slice(0, pos)
  const after = v.slice(pos)
  const lead = before && !before.endsWith('\n') ? '\n\n' : before ? '\n' : ''
  const trail = after && !after.startsWith('\n') ? '\n\n' : '\n'
  edEl.value = before + lead + text + trail + after
  const caret = (before + lead + text + trail).length
  edEl.setSelectionRange(caret, caret)
  edEl.dispatchEvent(new Event('input'))
  edEl.focus()
}

async function addAttachment(blob: Blob, kind: 'photo' | 'draw'): Promise<void> {
  if (!current()) return
  try {
    const id = await saveAttachment(kind === 'photo' ? await shrink(blob) : blob, kind)
    insertBlock(`![${kind === 'photo' ? 'foto' : 'dibujo'}](adj:${id})`)
  } catch {
    toast('No se pudo añadir', 'No se pudo leer esa imagen')
  }
}

async function addImages(files: Iterable<File>): Promise<void> {
  for (const f of files) if (f.type.startsWith('image/')) await addAttachment(f, 'photo')
}

async function editDrawing(id: string): Promise<void> {
  const n = current()
  const old = await blobOf(id)
  if (!n || !old) return
  const out = await openDrawing(old)
  if (!out) return
  const nid = await saveAttachment(out, 'draw')
  const saved = await saveBody(n.id, n.body.split(id).join(nid))
  if (!saved) return
  const i = notes.findIndex((x) => x.id === saved.id)
  notes[i] = saved
  renderMain()
  queueSync()
}

function renderBacklinks(): void {
  const n = current()
  blEl.innerHTML = ''
  if (!n) return
  const bl = backlinks(notes, n)
  if (!bl.length) return
  const h = document.createElement('h4')
  h.textContent = 'Enlazada desde'
  blEl.append(h)
  for (const b of bl) {
    const a = document.createElement('a')
    a.textContent = titleOf(b.body)
    a.onclick = () => open(b.id)
    blEl.append(a)
  }
}

function renderPreview(): void {
  const n = current()
  if (!n) return
  const withImgs = n.body.replace(
    ADJ_RE,
    (_, alt: string, id: string) =>
      `<img class="adj" data-adj="${id}" alt="${alt.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)}">`,
  )
  const html = marked.parse(renderLinks(withImgs), { async: false }) as string
  pvEl.innerHTML = DOMPurify.sanitize(html)
  for (const img of pvEl.querySelectorAll<HTMLImageElement>('img[data-adj]')) {
    void urlFor(img.dataset.adj!).then((u) => {
      if (u) img.src = u
      else img.alt = 'Imagen no disponible todavía'
    })
  }
  const boxes = [...pvEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
  const tasks = taskLines(n.body)
  if (boxes.length === tasks.length) {
    boxes.forEach((b, i) => {
      b.disabled = false
      b.dataset.line = String(tasks[i].line)
    })
  }
}

async function toggleTask(noteId: string, line: number): Promise<void> {
  const n = notes.find((x) => x.id === noteId)
  if (!n) return
  const saved = await saveBody(n.id, toggleLine(n.body, line))
  if (!saved) return
  const i = notes.findIndex((x) => x.id === saved.id)
  notes[i] = saved
  notes.sort((a, b) => b.updatedAt - a.updatedAt)
  renderList()
  if (panel === 'cal') renderCal()
  else if (panel === 'today') renderTodayView()
  else if (reading) renderPreview()
  queueSync()
}

function pendingSection(limit = Infinity): HTMLElement {
  let left = limit
  const list = pendingTasks(notes)
    .map(({ note, tasks }) => {
      const take = tasks.slice(0, Math.max(0, left))
      left -= take.length
      return { note, tasks: take }
    })
    .filter((p) => p.tasks.length)
  const wrap = document.createElement('section')
  wrap.className = 'pendwrap'
  const h = document.createElement('h4')
  h.textContent = 'Pendientes'
  wrap.append(h)
  if (!list.length) {
    const none = document.createElement('div')
    none.className = 'none'
    none.textContent = 'Nada pendiente. Escribe «- [ ] tarea» en una nota y aparecerá aquí.'
    wrap.append(none)
  }
  for (const { note, tasks } of list) {
    const box = document.createElement('div')
    box.className = 'pend'
    const t = document.createElement('a')
    t.textContent = titleOf(note.body)
    t.onclick = () => open(note.id)
    box.append(t)
    for (const task of tasks) {
      const label = document.createElement('label')
      label.className = 'task'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.onchange = () => toggleTask(note.id, task.line)
      const span = document.createElement('span')
      span.textContent = task.text
      label.append(cb, span)
      box.append(label)
    }
    wrap.append(box)
  }
  return wrap
}

function renderTodayView(): void {
  renderToday(todayBody, {
    events,
    notes,
    handlers: calHandlers,
    pending: () => pendingSection(6),
    openNote: (id) => open(id),
  })
}

function renderNodeBar(): void {
  const n = current()
  chipsEl.innerHTML = ''
  if (!n) return
  for (const name of n.nodes) {
    const chip = document.createElement('span')
    chip.className = 'chip'
    chip.textContent = showPath(name)
    const x = document.createElement('button')
    x.innerHTML = icons.close
    x.title = 'Quitar'
    x.onclick = () => toggleNode(name)
    chip.append(x)
    chipsEl.append(chip)
  }
}

function renderNodePop(): void {
  const n = current()
  nodeList.innerHTML = ''
  if (!n) return
  const mine = new Set(n.nodes.map(pathKey))
  const all = nodeTree(notes)
  const prevParent = parentSel.value
  parentSel.innerHTML = ''
  const root = document.createElement('option')
  root.value = ''
  root.textContent = 'Tier 1 (raíz)'
  parentSel.append(root)
  for (const it of all) {
    if (it.tier >= MAX_TIER) continue
    const o = document.createElement('option')
    o.value = it.path
    o.textContent = `Tier ${it.tier + 1} en ${showPath(it.path)}`
    parentSel.append(o)
  }
  parentSel.value = [...parentSel.options].some((o) => o.value === prevParent) ? prevParent : ''
  if (!all.length) {
    const none = document.createElement('div')
    none.className = 'none'
    none.textContent = 'Aún no hay nodos. Crea el primero arriba.'
    nodeList.append(none)
  }
  for (const it of all) {
    const label = document.createElement('label')
    label.className = 'nrow'
    label.style.paddingLeft = `${10 + (it.tier - 1) * 18}px`
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = mine.has(it.key)
    cb.onchange = () => toggleNode(it.path)
    const name = document.createElement('span')
    name.textContent = leafOf(it.path)
    const tier = document.createElement('em')
    tier.className = `tier t${it.tier}`
    tier.textContent = `T${it.tier}`
    const count = document.createElement('small')
    count.textContent = String(it.count)
    label.append(cb, name, tier, count)
    nodeList.append(label)
  }
}

async function toggleNode(name: string): Promise<void> {
  const n = current()
  if (!n) return
  const k = pathKey(name)
  const has = n.nodes.some((x) => pathKey(x) === k)
  const next = has ? n.nodes.filter((x) => pathKey(x) !== k) : [...n.nodes, name]
  const saved = await setNodes(n.id, next)
  if (!saved) return
  const i = notes.findIndex((x) => x.id === saved.id)
  notes[i] = saved
  notes.sort((a, b) => b.updatedAt - a.updatedAt)
  renderNodeBar()
  renderNodePop()
  renderList()
  queueSync()
}

async function createNode(): Promise<void> {
  const name = nodeInput.value.replace(/\//g, ' ').trim()
  if (!name) return
  const full = joinPath([...pathParts(parentSel.value), name])
  const existing = nodeTree(notes).find((x) => x.key === pathKey(full))
  nodeInput.value = ''
  const n = current()
  if (n && n.nodes.some((x) => pathKey(x) === pathKey(full))) return
  await toggleNode(existing?.path ?? full)
}

function folderBranch(path: string | null, tree: ReturnType<typeof nodeTree>): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'fold-children'
  const depth = path ? pathParts(path).length : 0
  const prefix = path ? `${pathKey(path)}/` : ''
  const kids = tree.filter((x) => x.tier === depth + 1 && x.key.startsWith(prefix))
  for (const k of kids) {
    const det = document.createElement('details')
    det.className = `folder t${k.tier}`
    det.open = openFolders.has(k.key)
    det.ontoggle = () => {
      if (det.open) openFolders.add(k.key)
      else openFolders.delete(k.key)
    }
    const sum = document.createElement('summary')
    const name = document.createElement('span')
    name.textContent = leafOf(k.path)
    const tier = document.createElement('em')
    tier.className = `tier t${k.tier}`
    tier.textContent = `T${k.tier}`
    const count = document.createElement('small')
    count.textContent = String(k.count)
    sum.append(icon('folder'), name, tier, count)
    det.append(sum)
    det.append(folderBranch(k.path, tree))
    const own = notes.filter((nt) => deepestNodes(nt.nodes).some((p) => pathKey(p) === k.key))
    for (const nt of own) det.lastElementChild!.append(folderNote(nt))
    wrap.append(det)
  }
  return wrap
}

function icon(name: 'folder' | 'notes'): HTMLElement {
  const s = document.createElement('span')
  s.className = 'ficon'
  s.innerHTML = icons[name]
  return s
}

function folderNote(nt: Note): HTMLElement {
  const a = document.createElement('button')
  a.className = 'fnote'
  a.textContent = titleOf(nt.body)
  a.onclick = () => open(nt.id)
  return a
}

function renderFolders(): void {
  const tree = nodeTree(notes)
  if (!foldersSeeded) {
    foldersSeeded = true
    for (const t of tree) if (t.tier === 1) openFolders.add(t.key)
  }
  foldBody.innerHTML = ''
  if (!tree.length) {
    const none = document.createElement('div')
    none.className = 'none'
    none.textContent = 'Aún no hay carpetas. Crea un nodo desde una nota y aparecerá aquí.'
    foldBody.append(none)
  } else {
    const box = document.createElement('div')
    box.className = 'foldwrap'
    box.append(folderBranch(null, tree))
    foldBody.append(box)
  }
  const loose = notes.filter((nt) => !nt.nodes.length)
  if (loose.length) {
    const h = document.createElement('h4')
    h.className = 'loosehead'
    h.textContent = `Sin clasificar · ${loose.length}`
    const box = document.createElement('div')
    box.className = 'foldwrap loose'
    for (const nt of loose) box.append(folderNote(nt))
    foldBody.append(h, box)
  }
}

function renderProposals(): void {
  propEl.innerHTML = ''
  const n = current()
  if (!n || panel !== 'none') return
  const props = detectEvents(n).filter((p) => !evKeys.has(p.key) && !evKeys.has(`${p.noteId}|${p.at}`))
  const sugs = suggestionsFor(n)
  if (sugs.length) {
    const h = document.createElement('h4')
    h.innerHTML = icons.spark
    h.append('Sugerencias')
    propEl.append(h)
    for (const s of sugs) propEl.append(s)
  }
  if (!props.length) return
  const h = document.createElement('h4')
  h.innerHTML = icons.calendar
  h.append('Eventos detectados')
  propEl.append(h)
  for (const p of props) propEl.append(proposalRow(p))
}

const dismissedSug = new Set<string>()

function sugRow(id: string, label: string, apply: string, run: () => Promise<void>): HTMLElement {
  const r = document.createElement('div')
  r.className = 'pr'
  const text = document.createElement('span')
  text.className = 'ptext'
  text.textContent = label
  const ok = document.createElement('button')
  ok.className = 'btn primary small'
  ok.textContent = apply
  ok.onclick = async () => {
    await run()
    queueSync(500)
  }
  const skip = document.createElement('button')
  skip.className = 'btn ghost small'
  skip.textContent = 'Ignorar'
  skip.onclick = () => {
    dismissedSug.add(id)
    renderProposals()
  }
  r.append(text, ok, skip)
  return r
}

async function applyBody(id: string, body: string): Promise<void> {
  const saved = await saveBody(id, body)
  if (!saved) return
  const i = notes.findIndex((x) => x.id === saved.id)
  notes[i] = saved
  notes.sort((a, b) => b.updatedAt - a.updatedAt)
  renderList()
  renderMain()
}

function suggestionsFor(n: Note): HTMLElement[] {
  const out: HTMLElement[] = []
  const title = suggestTitle(n.body)
  const tid = `${n.id}|t|${title}`
  if (title && !dismissedSug.has(tid)) {
    out.push(sugRow(tid, `Poner título «${title}»`, 'Poner', () => applyBody(n.id, `# ${title}\n\n${n.body.replace(/^\s+/, '')}`)))
  }
  for (const path of suggestNodes(n, notes)) {
    const id = `${n.id}|n|${pathKey(path)}`
    if (dismissedSug.has(id)) continue
    out.push(
      sugRow(id, `Añadir al nodo «${showPath(path)}»`, 'Añadir', async () => {
        const saved = await setNodes(n.id, [...n.nodes, path])
        if (!saved) return
        const i = notes.findIndex((x) => x.id === saved.id)
        notes[i] = saved
        renderList()
        renderMain()
      }),
    )
  }
  return out
}

function proposalRow(p: Proposal): HTMLElement {
  const r = document.createElement('div')
  r.className = 'pr'
  const text = document.createElement('span')
  text.className = 'ptext'
  text.textContent = `${fmtWhen(p)} — ${p.title}${p.repeat !== 'none' ? ` · ${REPEAT_LABEL[p.repeat].toLowerCase()}` : ''}`
  const sel = document.createElement('select')
  for (const [v, label] of remindOptions(p.allDay)) {
    const o = document.createElement('option')
    o.value = String(v)
    o.textContent = label
    sel.append(o)
  }
  sel.value = String(defaultRemind(p.allDay))
  const add = document.createElement('button')
  add.className = 'btn primary small'
  add.textContent = 'Añadir'
  add.onclick = () => saveProposal(p, +sel.value, 'active')
  const skip = document.createElement('button')
  skip.className = 'btn ghost small'
  skip.textContent = 'Ignorar'
  skip.onclick = () => saveProposal(p, 0, 'dismissed')
  r.append(text, sel, add, skip)
  return r
}

async function saveProposal(p: Proposal, remindMin: number, state: EventState): Promise<void> {
  await addEvent({
    noteId: p.noteId,
    title: p.title,
    at: p.at,
    allDay: p.allDay,
    remindMin,
    state,
    key: p.key,
    repeat: state === 'active' ? p.repeat : 'none',
  })
  await reloadEvents()
  if (state === 'active') toast('Evento añadido', `${fmtWhen(p)} — ${p.title}`)
  queueSync(500)
}

const calHandlers: CalHandlers = {
  openNote: (id) => open(id),
  toggleDone: async (e) => {
    const rep = e.repeat ?? 'none'
    if (rep !== 'none' && e.state !== 'done') {
      const next = nextOccurrence(e.at, rep, Math.max(Date.now(), e.at))
      await patchEvent(e.id, { at: next, state: 'active' })
      toast('Hecho', `Próxima vez: ${fmtWhen({ at: next, allDay: e.allDay })}`)
    } else {
      await patchEvent(e.id, { state: e.state === 'done' ? 'active' : 'done' })
    }
    await reloadEvents()
    queueSync(500)
  },
  remove: async (e) => {
    if (!confirm(`¿Borrar «${e.title}»?`)) return
    await removeEvent(e.id)
    await reloadEvents()
    queueSync(500)
  },
}

function renderCal(): void {
  void refreshAvisos()
  renderCalendar(calBody, events, calHandlers)
  calBody.append(pendingSection())
}

function renderMain(): void {
  const n = current()
  const inPanel = panel !== 'none'
  mapEl.hidden = panel !== 'map'
  calEl.hidden = panel !== 'cal'
  foldEl.hidden = panel !== 'folders'
  todayEl.hidden = panel !== 'today'
  barEl.hidden = inPanel || !n
  nodebarEl.hidden = inPanel || !n
  emptyEl.hidden = inPanel || !!n
  docEl.hidden = inPanel || !n
  edEl.hidden = inPanel || !n || reading
  pvEl.hidden = inPanel || !n || !reading
  modeBtn.innerHTML = reading ? `${icons.pencil}Editar` : `${icons.eye}Leer`
  shell.classList.toggle('show-editor', inPanel || !!n)
  shell.classList.toggle('editing', !inPanel && !!n)
  for (const [k, b] of Object.entries(tabs)) b.classList.toggle('on', k === panel)
  if (inPanel || !n) {
    nodePop.hidden = true
    blEl.innerHTML = ''
    propEl.innerHTML = ''
    attsEl.hidden = true
    return
  }
  renderAtts()
  if (reading) renderPreview()
  else {
    if (edEl.value !== n.body) edEl.value = n.body
    fitEditor()
  }
  renderNodeBar()
  renderBacklinks()
  renderProposals()
}

function closePanel(): void {
  if (panel === 'map') hideMap()
  panel = 'none'
}

async function openPanel(p: 'map' | 'cal' | 'folders' | 'today'): Promise<void> {
  if (panel === p) {
    closePanel()
    renderList()
    renderMain()
    return
  }
  closePanel()
  panel = p
  renderList()
  renderMain()
  if (p === 'cal') {
    renderCal()
    return
  }
  if (p === 'folders') {
    renderFolders()
    return
  }
  if (p === 'today') {
    renderTodayView()
    return
  }
  mapInfo.textContent = 'Cargando…'
  mapInfo.textContent = await showMap(graphEl, notes, (id) => open(id))
}

function open(id: string, startReading = false): void {
  closePanel()
  currentId = id
  reading = startReading
  renderList()
  renderMain()
  if (!reading) edEl.focus()
}

async function rollRepeats(): Promise<void> {
  const limit = Date.now() - 3600000
  let any = false
  for (const e of await allEvents()) {
    const rep = e.repeat ?? 'none'
    if (rep === 'none' || e.state === 'dismissed' || e.at >= limit) continue
    await patchEvent(e.id, { at: nextOccurrence(e.at, rep, Date.now()), state: 'active' })
    any = true
  }
  if (any) queueSync(800)
}

async function reloadEvents(): Promise<void> {
  await rollRepeats()
  events = await allEvents()
  evKeys = await eventKeys()
  if (panel === 'cal') renderCal()
  else if (panel === 'today') renderTodayView()
  else if (panel === 'none') renderProposals()
}

async function reload(): Promise<void> {
  notes = await allNotes()
  if (currentId && !current()) currentId = null
  renderList()
  renderMain()
  if (panel === 'map') mapInfo.textContent = refreshMap(notes)
  if (panel === 'folders') renderFolders()
  if (panel === 'today') renderTodayView()
  await reloadEvents()
}

function queueSync(delay = 2000): void {
  clearTimeout(syncTimer)
  syncTimer = window.setTimeout(runSync, delay)
}

async function runSync(): Promise<void> {
  if (syncing) return
  syncing = true
  try {
    const r = await sync()
    if (r === 'ok' || r === 'partial') await uploadPending().catch(() => {})
    if (r === 'off') statusEl.textContent = 'Solo local'
    else if (r === 'nologin') statusEl.textContent = 'Sin iniciar sesión'
    else {
      const hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      statusEl.textContent = r === 'partial' ? `Notas sincronizadas ${hora} (eventos sin tabla)` : `Sincronizado ${hora}`
      if (document.activeElement !== edEl) await reload()
      else await reloadEvents()
    }
  } catch {
    statusEl.textContent = 'Sin conexión'
  } finally {
    syncing = false
  }
}

async function refreshAccount(): Promise<void> {
  const email = await currentEmail()
  acctBtn.title = email ?? 'Cuenta'
  pulseEl.classList.toggle('on', !!email)
  $('dlogout').hidden = !email
  $('dlogin').hidden = !!email
  $('dsignup').hidden = !!email
  $('dmail').hidden = !!email
  $('dpass').hidden = !!email
  $('dtitle').textContent = email ? `Sesión: ${email}` : 'Cuenta'
}

async function newNote(): Promise<void> {
  const n = await createNote('')
  qEl.value = ''
  notes = await allNotes()
  open(n.id)
}

$('new').onclick = newNote

function syncTierSeg(): void {
  const cur = getTierMax()
  for (const b of $('tierseg').querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.t) === cur)
}

$('tierseg').onclick = (e) => {
  const b = (e.target as HTMLElement).closest('button')
  if (!b) return
  setTierMax(Number(b.dataset.t))
  syncTierSeg()
}

$<HTMLInputElement>('mapq').onkeydown = (e) => {
  if (e.key !== 'Enter') return
  const input = e.target as HTMLInputElement
  const found = flyToNode(input.value)
  if (found) input.blur()
  else toast('No encontrado', `No hay ningún nodo ni nota que contenga «${input.value.trim()}»`)
  syncTierSeg()
  syncFocusChip()
}

function paletteItems(query: string): PaletteItem[] {
  const k = norm(query.trim())
  const go = (label: string, run: () => void): PaletteItem => ({ label, hint: 'Ir a', run })
  const cmds: PaletteItem[] = [
    { label: 'Nueva nota', hint: 'Acción', run: () => void newNote() },
    go('Hoy', () => void openPanel('today')),
    go('Carpetas', () => void openPanel('folders')),
    go('Mapa', () => void openPanel('map')),
    go('Agenda', () => void openPanel('cal')),
  ]
  const asItem = (n: Note): PaletteItem => ({
    label: titleOf(n.body),
    hint: n.nodes.length ? deepestNodes(n.nodes).map(showPath).join(', ') : rel(n.updatedAt),
    run: () => open(n.id),
  })
  if (!k) return [...cmds, ...notes.slice(0, 5).map(asItem)]
  const scored: [number, PaletteItem][] = []
  for (const n of notes) {
    const t = norm(titleOf(n.body))
    const nodes = norm(n.nodes.join(' '))
    let s = 0
    if (t.startsWith(k)) s = 4
    else if (t.includes(k)) s = 3
    else if (nodes.includes(k)) s = 2
    else if (norm(n.body).includes(k)) s = 1
    if (s) scored.push([s, asItem(n)])
  }
  scored.sort((a, b) => b[0] - a[0])
  const hits = cmds.filter((c) => norm(c.label).includes(k))
  return [...hits, ...scored.map((x) => x[1])]
}

const togglePalette = initPalette(paletteItems)

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    togglePalette()
  }
})

$('mapbtn').onclick = () => {
  setFocus(null)
  $('focuschip').hidden = true
  void openPanel('map')
}
$('calbtn').onclick = () => openPanel('cal')
$('foldbtn').onclick = () => openPanel('folders')
$('todaybtn').onclick = () => openPanel('today')

type VoiceState = 'idle' | 'loading' | 'recording' | 'transcribing'

const MAX_DICTADO = 180000
let voice: VoiceState = 'idle'
let recorder: Recorder | null = null
let dictTick: number | undefined
let dictNoteId: string | null = null
let dictPos = 0
let dictStart = 0

function setMic(state: VoiceState, label: string): void {
  voice = state
  micBtn.className = state === 'recording' ? 'btn small rec' : 'btn small'
  micBtn.disabled = state === 'loading' || state === 'transcribing'
  micBtn.innerHTML = `${state === 'recording' ? icons.stop : icons.mic}${label}`
}

function micError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Permite el micrófono en los ajustes del sitio'
  if (name === 'NotFoundError') return 'No se encontró ningún micrófono'
  return err instanceof Error ? err.message : 'Inténtalo de nuevo'
}

async function insertDictado(text: string): Promise<void> {
  const id = dictNoteId
  const note = notes.find((n) => n.id === id)
  if (!id || !note) return
  if (!text) {
    toast('No se entendió nada', 'Habla más cerca del micrófono e inténtalo otra vez')
    return
  }
  const same = id === currentId && !reading && panel === 'none'
  const base = same ? edEl.value : note.body
  const pos = same ? Math.min(dictPos, base.length) : base.length
  const before = base.slice(0, pos)
  const after = base.slice(pos)
  const lead = before && !/\s$/.test(before) ? ' ' : ''
  const trail = after && !/^\s/.test(after) ? ' ' : ''
  const next = before + lead + text + trail + after
  if (same) {
    edEl.value = next
    const caret = (before + lead + text).length
    edEl.setSelectionRange(caret, caret)
    edEl.dispatchEvent(new Event('input'))
    edEl.focus()
    return
  }
  await saveBody(id, next)
  notes = await allNotes()
  renderList()
  queueSync()
  toast('Dictado añadido', `A «${titleOf(next)}»`)
}

async function stopDictado(): Promise<void> {
  clearInterval(dictTick)
  const r = recorder
  recorder = null
  if (!r) return
  setMic('transcribing', 'Transcribiendo…')
  try {
    const audio = await r.stop()
    await insertDictado(await transcribe(audio))
  } catch (err) {
    toast('No se pudo transcribir', err instanceof Error ? err.message : 'Inténtalo de nuevo')
  } finally {
    setMic('idle', 'Dictar')
  }
}

micBtn.onclick = async () => {
  if (voice === 'recording') {
    await stopDictado()
    return
  }
  if (voice !== 'idle' || !current()) return
  if (reading) {
    reading = false
    renderMain()
  }
  dictNoteId = currentId
  dictPos = edEl.selectionStart ?? edEl.value.length
  if (!modelCached() && !confirm('Para dictar se descarga el modelo de voz una sola vez (unos 80 MB). Mejor con wifi. ¿Descargar ahora?')) return
  try {
    setMic('loading', 'Preparando…')
    await loadModel((pct) => setMic('loading', `Descargando ${Math.round(pct)}%`))
    recorder = new Recorder()
    await recorder.start()
    dictStart = Date.now()
    setMic('recording', '0:00')
    dictTick = window.setInterval(() => {
      const s = Math.floor((Date.now() - dictStart) / 1000)
      micBtn.lastChild!.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
      if (Date.now() - dictStart > MAX_DICTADO) void stopDictado()
    }, 500)
  } catch (err) {
    recorder?.cancel()
    recorder = null
    clearInterval(dictTick)
    setMic('idle', 'Dictar')
    toast('No se pudo dictar', micError(err))
  }
}

setMic('idle', 'Dictar')

$('photo').onclick = () => $<HTMLInputElement>('pfile').click()

$<HTMLInputElement>('pfile').onchange = async (e) => {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  await addImages(files)
}

$('draw').onclick = async () => {
  if (!current()) return
  const out = await openDrawing()
  if (out) await addAttachment(out, 'draw')
}

edEl.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
  if (!files.length) return
  e.preventDefault()
  void addImages(files)
})

edEl.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
})

edEl.addEventListener('drop', (e) => {
  const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'))
  if (!files.length) return
  e.preventDefault()
  void addImages(files)
})

$('vclose').onclick = () => $<HTMLDialogElement>('vdlg').close()
$<HTMLDialogElement>('vdlg').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) (e.currentTarget as HTMLDialogElement).close()
})
$('vedit').onclick = () => {
  const id = viewing
  $<HTMLDialogElement>('vdlg').close()
  void editDrawing(id)
}

function syncFocusChip(): void {
  const id = getFocus()
  const chip = $('focuschip')
  chip.hidden = !id
  if (id) {
    const n = notes.find((x) => x.id === id)
    $('focustxt').textContent = `Vecindario de «${n ? titleOf(n.body) : 'nota'}»`
  }
}

$('nbhd').onclick = async () => {
  const id = currentId
  if (!id) return
  if (panel !== 'map') await openPanel('map')
  setFocus(id)
  syncFocusChip()
}

$('focusoff').onclick = () => {
  setFocus(null)
  syncFocusChip()
}

$('tabnotes').onclick = () => {
  closePanel()
  if (window.matchMedia('(max-width: 720px)').matches) currentId = null
  renderList()
  renderMain()
}

$('emptynew').onclick = () => $('new').click()

$('back').onclick = () => {
  currentId = null
  renderList()
  renderMain()
}

modeBtn.onclick = () => {
  reading = !reading
  renderMain()
  if (!reading) edEl.focus()
}

$('del').onclick = async () => {
  const n = current()
  if (!n || !confirm(`¿Borrar «${titleOf(n.body)}»?`)) return
  await removeNote(n.id)
  currentId = null
  await reload()
  queueSync(500)
}

$('nodebtn').onclick = () => {
  nodePop.hidden = !nodePop.hidden
  if (!nodePop.hidden) {
    renderNodePop()
    nodeInput.focus()
  }
}

$('nadd').onclick = createNode
nodeInput.onkeydown = (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    createNode()
  }
}

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement
  if (!nodePop.hidden && !t.closest('#nodepop') && !t.closest('#nodebtn') && !t.closest('.chip')) nodePop.hidden = true
})

qEl.oninput = renderList

edEl.oninput = async () => {
  const n = current()
  if (!n) return
  const saved = await saveBody(n.id, edEl.value)
  if (!saved) return
  const i = notes.findIndex((x) => x.id === saved.id)
  notes[i] = saved
  notes.sort((a, b) => b.updatedAt - a.updatedAt)
  fitEditor()
  renderList()
  renderBacklinks()
  renderAtts()
  clearTimeout(propTimer)
  propTimer = window.setTimeout(renderProposals, 700)
  queueSync()
}

pvEl.onchange = (e) => {
  const b = e.target as HTMLInputElement
  if (b.type === 'checkbox' && b.dataset.line && currentId) void toggleTask(currentId, Number(b.dataset.line))
}

pvEl.onclick = async (e) => {
  const img = (e.target as HTMLElement).closest('img[data-adj]') as HTMLImageElement | null
  if (img) {
    void viewAttachment(img.dataset.adj!)
    return
  }
  const a = (e.target as HTMLElement).closest('a.wl') as HTMLElement | null
  if (!a) return
  e.preventDefault()
  const title = a.dataset.t ?? ''
  let target = findByTitle(notes, title)
  if (!target) {
    target = await createNote(`# ${title}\n\n`)
    notes = await allNotes()
    queueSync()
  }
  open(target.id, true)
}

acctBtn.onclick = async () => {
  if (!supabase) {
    statusEl.textContent = 'Configura .env con Supabase'
    return
  }
  $('dmsg').textContent = ''
  await refreshAccount()
  dlg.showModal()
  void loadDigest()
}

async function loadDigest(): Promise<void> {
  const box = $('dgbox')
  const email = await currentEmail()
  box.hidden = !email
  if (!email || !supabase) return
  const { data, error } = await supabase.from('user_settings').select('digest_enabled, digest_hour').maybeSingle()
  $('dgmsg').textContent = error ? 'Falta ejecutar el SQL de la fase 5 en Supabase' : ''
  $<HTMLInputElement>('dgon').checked = data?.digest_enabled ?? true
  $<HTMLSelectElement>('dghour').value = String(data?.digest_hour ?? 8)
}

async function saveDigest(): Promise<void> {
  if (!supabase) return
  const { data: s } = await supabase.auth.getSession()
  const uid = s.session?.user.id
  if (!uid) return
  const { error } = await supabase.from('user_settings').upsert({
    user_id: uid,
    digest_enabled: $<HTMLInputElement>('dgon').checked,
    digest_hour: Number($<HTMLSelectElement>('dghour').value),
  })
  $('dgmsg').textContent = error ? 'No se pudo guardar (¿falta el SQL de la fase 5?)' : 'Guardado'
}

$('dgon').onchange = saveDigest
$('dghour').onchange = saveDigest

async function auth(kind: 'in' | 'up'): Promise<void> {
  const email = $<HTMLInputElement>('dmail').value.trim()
  const pass = $<HTMLInputElement>('dpass').value
  if (!email || !pass) {
    $('dmsg').textContent = 'Rellena email y contraseña'
    return
  }
  $('dmsg').textContent = '…'
  const err = kind === 'in' ? await signIn(email, pass) : await signUp(email, pass)
  if (err) {
    $('dmsg').textContent = err
    return
  }
  await refreshAccount()
  const logged = await currentEmail()
  if (logged) {
    dlg.close()
    runSync()
  } else {
    $('dmsg').textContent = 'Revisa tu correo para confirmar la cuenta'
  }
}

$('dlogin').onclick = () => auth('in')
$('dsignup').onclick = () => auth('up')
$('dlogout').onclick = async () => {
  await signOut()
  await refreshAccount()
  dlg.close()
  statusEl.textContent = 'Sin iniciar sesión'
}
$('dclose').onclick = () => dlg.close()

const bmsg = $('bmsg')
$('bjson').onclick = async () => {
  bmsg.textContent = `${await exportJson()} notas exportadas`
}
$('bmd').onclick = async () => {
  bmsg.textContent = `${await exportMarkdown()} notas exportadas`
}
$('bimp').onclick = () => $<HTMLInputElement>('bfile').click()
$<HTMLInputElement>('bfile').onchange = async (e) => {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  try {
    const r = await importBackup(f)
    bmsg.textContent = `Importado: ${r.added} notas nuevas, ${r.versions} versiones en historial, ${r.events} eventos`
    await reload()
    queueSync(500)
  } catch (err) {
    bmsg.textContent = err instanceof Error ? err.message : 'No se pudo importar'
  }
}

const hdlg = $<HTMLDialogElement>('hdlg')
const hList = $('hlist')
$('hclose').onclick = () => hdlg.close()
$('hist').onclick = async () => {
  const n = current()
  if (!n) return
  const list = await versionsOf(n.id)
  hList.innerHTML = ''
  if (!list.length) {
    const none = document.createElement('div')
    none.className = 'none'
    none.textContent = 'Aún no hay versiones anteriores de esta nota.'
    hList.append(none)
  }
  for (const v of list) {
    const row = document.createElement('div')
    row.className = 'vrow'
    const info = document.createElement('div')
    const when = document.createElement('b')
    when.textContent = new Date(v.at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    const why = document.createElement('small')
    why.textContent = v.why
    const snip = document.createElement('p')
    snip.textContent = v.body.replace(/\s+/g, ' ').trim().slice(0, 110)
    info.append(when, why, snip)
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn small'
    btn.textContent = 'Restaurar'
    btn.onclick = async () => {
      await addVersion(n, 'antes de restaurar', true)
      await saveBody(n.id, v.body)
      await setNodes(n.id, v.nodes)
      hdlg.close()
      await reload()
      queueSync(500)
    }
    row.append(info, btn)
    hList.append(row)
  }
  hdlg.showModal()
}

const eTitle = $<HTMLInputElement>('etitle')
const eDate = $<HTMLInputElement>('edate')
const eTime = $<HTMLInputElement>('etime')
const eRemind = $<HTMLSelectElement>('eremind')

function fillRemind(): void {
  const allDay = !eTime.value
  eRemind.innerHTML = ''
  for (const [v, label] of remindOptions(allDay)) {
    const o = document.createElement('option')
    o.value = String(v)
    o.textContent = label
    eRemind.append(o)
  }
  eRemind.value = String(defaultRemind(allDay))
}

function isoDate(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

$('caladd').onclick = () => {
  eTitle.value = ''
  eDate.value = isoDate(new Date())
  eTime.value = ''
  $<HTMLSelectElement>('erepeat').value = 'none'
  $('emsg').textContent = ''
  fillRemind()
  edlg.showModal()
  eTitle.focus()
}

eTime.onchange = fillRemind
eTime.oninput = fillRemind

$('ecancel').onclick = () => edlg.close()

$('esave').onclick = async () => {
  const title = eTitle.value.trim()
  if (!title || !eDate.value) {
    $('emsg').textContent = 'Pon un título y una fecha'
    return
  }
  const [y, m, d] = eDate.value.split('-').map(Number)
  const [hh, mm] = eTime.value ? eTime.value.split(':').map(Number) : [0, 0]
  const at = new Date(y, m - 1, d, hh, mm).getTime()
  await addEvent({
    noteId: null,
    title,
    at,
    allDay: !eTime.value,
    remindMin: +eRemind.value,
    state: 'active',
    key: `manual|${crypto.randomUUID()}`,
    repeat: $<HTMLSelectElement>('erepeat').value as Repeat,
  })
  edlg.close()
  await reloadEvents()
  queueSync(500)
}

async function refreshAvisos(): Promise<void> {
  if (pushSupported()) {
    const on = await pushActive()
    calNotif.hidden = false
    calNotif.className = on ? 'btn ghost small' : 'btn small'
    calNotif.innerHTML = `${icons.bell}${on ? 'Avisos activos' : 'Activar avisos'}`
    return
  }
  calNotif.hidden = notificationsState() !== 'default'
  calNotif.className = 'btn small'
  calNotif.innerHTML = `${icons.bell}Activar avisos`
}

calNotif.onclick = async () => {
  if (!pushSupported()) {
    const r = await enableNotifications()
    if (r === 'denied') toast('Avisos bloqueados', 'Actívalos en los permisos del navegador')
    await refreshAvisos()
    return
  }
  if (await pushActive()) {
    if (!confirm('¿Desactivar los avisos en este dispositivo?')) return
    await disablePush()
    await refreshAvisos()
    return
  }
  const r = await enablePush()
  if (r === 'ok') toast('Avisos activados', 'Te avisaremos aunque la app esté cerrada')
  else if (r === 'nologin') toast('Inicia sesión primero', 'Los avisos se envían a tu cuenta')
  else if (r === 'denied') toast('Avisos bloqueados', 'Actívalos en los permisos del navegador')
  else toast('No se pudo activar', 'Inténtalo de nuevo en unos segundos')
  await refreshAvisos()
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') queueSync(300)
})
window.addEventListener('online', () => queueSync(300))
window.setInterval(() => queueSync(0), 60000)

registerSW({ immediate: true })

await reload()
await refreshAccount()
startReminders(() => events, toast)
void resyncPush()
runSync()

const query = new URLSearchParams(location.search)
const accion = query.get('accion')
const shared = ['title', 'text', 'url']
  .map((k) => (query.get(k) ?? '').trim())
  .filter(Boolean)
  .filter((v, i, a) => a.indexOf(v) === i)
if (shared.length) {
  history.replaceState(null, '', location.pathname)
  const [first, ...rest] = shared
  const note = await createNote(`# ${first.split('\n')[0].slice(0, 80)}\n\n${[...rest, ...(first.includes('\n') ? [first] : [])].join('\n\n')}`.trimEnd() + '\n')
  notes = await allNotes()
  open(note.id, true)
  queueSync(500)
  toast('Guardado en Mapa de notas', 'La nota compartida ya está creada')
} else if (accion === 'nueva' || accion === 'dictar') {
  history.replaceState(null, '', location.pathname)
  await newNote()
  if (accion === 'dictar') micBtn.click()
} else if (notes.length && !currentId) {
  await openPanel('today')
}
