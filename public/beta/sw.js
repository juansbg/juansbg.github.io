// The beta's service worker, replaced by this one so it can retire itself:
// a phone that installed Omertà from /beta/ has a worker at this scope that
// would otherwise keep serving the old app from its cache for good. This one
// installs over it, throws the caches away, unregisters, and sends every open
// window to the root, where the real worker takes over.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key)
      await self.registration.unregister()
      for (const client of await self.clients.matchAll({ type: 'window' })) {
        client.navigate('/')
      }
    })(),
  )
})
