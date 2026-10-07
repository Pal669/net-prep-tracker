// Shell files are cached for offline use; data is network-first so new numbers show as soon as they are pushed.
const VERSION = "v1";
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "icons/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const isData = req.url.includes("/data/");
  e.respondWith(isData
    ? fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(req.url.split("?")[0], c)); return r; }).catch(() => caches.match(req.url.split("?")[0]))
    : fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); return r; }).catch(() => caches.match(req, { ignoreSearch: true })));
});
