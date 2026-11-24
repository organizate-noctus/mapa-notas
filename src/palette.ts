export interface PaletteItem {
  label: string
  hint: string
  run: () => void
}

export function initPalette(getItems: (query: string) => PaletteItem[]): () => void {
  const dlg = document.getElementById('pdlg') as HTMLDialogElement
  const input = document.getElementById('pq') as HTMLInputElement
  const list = document.getElementById('pres') as HTMLElement
  let items: PaletteItem[] = []
  let sel = 0

  const draw = () => {
    list.innerHTML = ''
    if (!items.length) {
      const none = document.createElement('div')
      none.className = 'pnone'
      none.textContent = 'Nada coincide'
      list.append(none)
      return
    }
    items.forEach((it, i) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = i === sel ? 'pit on' : 'pit'
      const l = document.createElement('span')
      l.textContent = it.label
      const h = document.createElement('small')
      h.textContent = it.hint
      b.append(l, h)
      b.onmouseenter = () => {
        sel = i
        list.querySelectorAll('.pit').forEach((x, j) => x.classList.toggle('on', j === i))
      }
      b.onclick = () => choose(i)
      list.append(b)
    })
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
  }

  const refresh = () => {
    items = getItems(input.value).slice(0, 9)
    sel = 0
    draw()
  }

  const choose = (i: number) => {
    const it = items[i]
    if (!it) return
    dlg.close()
    it.run()
  }

  input.oninput = refresh
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      sel = Math.min(items.length - 1, sel + 1)
      draw()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      sel = Math.max(0, sel - 1)
      draw()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(sel)
    }
  }
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close()
  })

  return () => {
    if (dlg.open) {
      dlg.close()
      return
    }
    input.value = ''
    refresh()
    dlg.showModal()
    input.focus()
  }
}
