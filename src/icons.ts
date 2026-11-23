const svg = (body: string, size = 20): string =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const icons = {
  notes: svg('<path d="M5 4.5h14M5 9.5h14M5 14.5h9M5 19.5h6"/>'),
  map: svg(
    '<circle cx="6" cy="17" r="2"/><circle cx="12" cy="6.5" r="2"/><circle cx="18.5" cy="14" r="2"/><path d="M7.2 15.2 10.8 8.3M13.7 7.9l3.6 4.4M8 17.2l8.5-2.5"/>',
  ),
  calendar: svg(
    '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3.5v3M16 3.5v3"/>',
  ),
  user: svg('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  back: svg('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
  prev: svg('<path d="M14.5 5.5 8 12l6.5 6.5"/>', 18),
  next: svg('<path d="M9.5 5.5 16 12l-6.5 6.5"/>', 18),
  trash: svg(
    '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/>',
    18,
  ),
  eye: svg('<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/>', 18),
  pencil: svg('<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19 4 20ZM14.5 6.5l3 3"/>', 18),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>', 18),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 18),
  undo: svg('<path d="M9 6 4.5 10.5 9 15M5 10.5h9a5 5 0 0 1 0 10h-3"/>', 18),
  bell: svg('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2ZM10 20.5a2.2 2.2 0 0 0 4 0"/>', 18),
  close: svg('<path d="m6 6 12 12M18 6 6 18"/>', 16),
  tag: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21"/>', 18),
  mark: svg(
    '<circle cx="6" cy="16.5" r="2.2" fill="currentColor"/><circle cx="12.5" cy="6.5" r="2.2" fill="currentColor"/><circle cx="19" cy="14.5" r="2.2" fill="currentColor"/><path d="m7.2 14.6 4.1-6.2M14.2 8l3.7 4.8M8.2 16.4l8.7-1.5"/>',
    26,
  ),
  constellation:
    '<svg class="ic" width="112" height="88" viewBox="0 0 88 70" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><path d="m15.6 35.4 17-19.4M36.4 15.6l14 12.6M54.6 29l19.4-15.8M53.6 32.6 66 49.2M52 31.5 38 56.4M15.4 41l19 15.6" opacity=".55"/><circle cx="14" cy="38" r="3" fill="currentColor" stroke="none"/><circle cx="34" cy="14" r="3" fill="currentColor" stroke="none"/><circle cx="52" cy="30" r="3.4" fill="var(--oro)" stroke="none"/><circle cx="76" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="68" cy="52" r="3" fill="currentColor" stroke="none"/><circle cx="36" cy="58" r="2" fill="currentColor" stroke="none"/></svg>',
}
