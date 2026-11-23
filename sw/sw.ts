import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

interface Payload {
  title?: string
  body?: string
  tag?: string
  url?: string
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data: Payload = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = {}
  }
  const title = data.title ?? 'Recordatorio'
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (wins.some((w) => w.visibilityState === 'visible')) {
        for (const w of wins) w.postMessage({ type: 'reminder', title, body: data.body, tag: data.tag })
        return
      }
      await self.registration.showNotification(title, {
        body: data.body,
        tag: data.tag,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        data: { url: data.url ?? './' },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? './'
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (wins.length) {
        await wins[0].focus()
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
