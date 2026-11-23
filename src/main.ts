import { marked } from 'marked'
import DOMPurify from 'dompurify'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/instrument-sans'
import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { icons } from './icons'
import {
  addEvent,
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
} from './db'
import { backlinks, findByTitle, nodeCounts, renderLinks, titleOf } from './links'
import { currentEmail, signIn, signOut, signUp, supabase, sync } from './sync'
import { hideMap, refreshMap, showMap } from './graph'
import { defaultRemind, detectEvents, fmtWhen, remindOptions, type Proposal } from './events'
import { renderCalendar } from './calendar'
import { enableNotifications, notificationsState, startReminders } from './reminders'
import { disablePush, enablePush, pushActive, pushSupported, resyncPush } from './push'
import { Recorder, loadModel, modelCached, transcribe } from './voice'

const root = document.querySelector<HTMLDivElement>('#app')!

root.innerHTML = `
<div class="app" id="shell">
  <nav class="rail" id="rail" aria-label="Secciones">
    <span class="mark">${icons.mark}</span>
    <button class="tab on" id="tabnotes">${icons.notes}<span>Notas</span></button>
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
    <div class="search">${icons.search}<input id="q" type="search" placeholder="Buscar notas" autocomplete="off" /></div>
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
      <span class="sp"></span>
      <button class="btn ghost icon danger" id="del" title="Borrar nota">${icons.trash}</button>
    </div>
    <div class="nodebar" id="nodebar" hidden>
      <span id="chips"></span>
      <div class="nodewrap">
        <button class="btn ghost small" id="nodebtn">${icons.plus}Nodo</button>
        <div id="nodepop" hidden>
          <div class="newnode">
            <input id="nnew" placeholder="Nuevo nodo" autocomplete="off" />
            <button class="btn primary small" id="nadd">Crear</button>
          </div>
          <div id="nlist"></div>
        </div>
      </div>
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
        <article id="pv" hidden></article>
        <section id="prop"></section>
        <section id="bl"></section>
      </div>
    </div>
    <div id="mapview" hidden>
      <div id="graph"></div>
      <div class="maphud"><div class="card"><span><i class="nota"></i>Nota</span><span><i class="nodo"></i>Nodo</span><span id="mapinfo"></span></div></div>
      <div class="maphint">Arrastra para girar · rueda o pellizco para acercar · toca una nota para abrirla</div>
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
const calEl = $('calview')
const calBody = $('calbody')
const calNotif = $('calnotif')
const toastEl = $('toast')
const docEl = $('doc')
const pulseEl = $('pulse')
const micBtn = $<HTMLButtonElement>('mic')
const tabs: Record<string, HTMLElement> = { none: $('tabnotes'), map: $('mapbtn'), cal: $('calbtn') }

type Panel = 'none' | 'map' | 'cal'

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
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
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
      nodes.textContent = n.nodes.join(', ')
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
  const html = marked.parse(renderLinks(n.body), { async: false }) as string
  pvEl.innerHTML = DOMPurify.sanitize(html)
}

function renderNodeBar(): void {
  const n = current()
  chipsEl.innerHTML = ''
  if (!n) return
  for (const name of n.nodes) {
    const chip = document.createElement('span')
    chip.className = 'chip'
    chip.textContent = name
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
  const mine = new Set(n.nodes.map((x) => x.toLowerCase()))
  const all = nodeCounts(notes)
  if (!all.length) {
    const none = document.createElement('div')
    none.className = 'none'
    none.textContent = 'Aún no hay nodos. Crea el primero arriba.'
    nodeList.append(none)
  }
  for (const it of all) {
    const label = document.createElement('label')
    label.className = 'nrow'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = mine.has(it.name.toLowerCase())
    cb.onchange = () => toggleNode(it.name)
    const name = document.createElement('span')
    name.textContent = it.name
    const count = document.createElement('small')
    count.textContent = String(it.count)
    label.append(cb, name, count)
    nodeList.append(label)
  }
}

async function toggleNode(name: string): Promise<void> {
  const n = current()
  if (!n) return
  const k = name.toLowerCase()
  const has = n.nodes.some((x) => x.toLowerCase() === k)
  const next = has ? n.nodes.filter((x) => x.toLowerCase() !== k) : [...n.nodes, name]
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
  const name = nodeInput.value.trim()
  if (!name) return
  const existing = nodeCounts(notes).find((x) => x.name.toLowerCase() === name.toLowerCase())
  nodeInput.value = ''
  const n = current()
  if (n && n.nodes.some((x) => x.toLowerCase() === name.toLowerCase())) return
  await toggleNode(existing?.name ?? name)
}

function renderProposals(): void {
  propEl.innerHTML = ''
  const n = current()
  if (!n || panel !== 'none') return
  const props = detectEvents(n).filter((p) => !evKeys.has(p.key) && !evKeys.has(`${p.noteId}|${p.at}`))
  if (!props.length) return
  const h = document.createElement('h4')
  h.innerHTML = icons.calendar
  h.append('Eventos detectados')
  propEl.append(h)
  for (const p of props) propEl.append(proposalRow(p))
}

function proposalRow(p: Proposal): HTMLElement {
  const r = document.createElement('div')
  r.className = 'pr'
  const text = document.createElement('span')
  text.className = 'ptext'
  text.textContent = `${fmtWhen(p)} — ${p.title}`
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
  })
  await reloadEvents()
  if (state === 'active') toast('Evento añadido', `${fmtWhen(p)} — ${p.title}`)
  queueSync(500)
}

function renderCal(): void {
  void refreshAvisos()
  renderCalendar(calBody, events, {
    openNote: (id) => open(id),
    toggleDone: async (e) => {
      await patchEvent(e.id, { state: e.state === 'done' ? 'active' : 'done' })
      await reloadEvents()
      queueSync(500)
    },
    remove: async (e) => {
      if (!confirm(`¿Borrar «${e.title}»?`)) return
      await removeEvent(e.id)
      await reloadEvents()
      queueSync(500)
    },
  })
}

function renderMain(): void {
  const n = current()
  const inPanel = panel !== 'none'
  mapEl.hidden = panel !== 'map'
  calEl.hidden = panel !== 'cal'
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
    return
  }
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

async function openPanel(p: 'map' | 'cal'): Promise<void> {
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

async function reloadEvents(): Promise<void> {
  events = await allEvents()
  evKeys = await eventKeys()
  if (panel === 'cal') renderCal()
  else if (panel === 'none') renderProposals()
}

async function reload(): Promise<void> {
  notes = await allNotes()
  if (currentId && !current()) currentId = null
  renderList()
  renderMain()
  if (panel === 'map') mapInfo.textContent = refreshMap(notes)
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

$('new').onclick = async () => {
  const n = await createNote('')
  qEl.value = ''
  notes = await allNotes()
  open(n.id)
}

$('mapbtn').onclick = () => openPanel('map')
$('calbtn').onclick = () => openPanel('cal')

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
  clearTimeout(propTimer)
  propTimer = window.setTimeout(renderProposals, 700)
  queueSync()
}

pvEl.onclick = async (e) => {
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
}

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
