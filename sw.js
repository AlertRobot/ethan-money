// Offline support for Ethan's Money. Bump VERSION whenever any file changes.
const VERSION = "1.7.2";
const CACHE = "ethan-money-" + VERSION;
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, {cache: "reload"})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("ethan-money-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // the Google Sheet link always goes to the network
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = req.mode === "navigate" ? (await cache.match("./index.html")) || (await cache.match("./")) : await cache.match(req, {ignoreSearch: true});
    if (hit) return hit;
    try { return await fetch(req); } catch (err) { return (await cache.match("./index.html")) || Response.error(); }
  })());
});
