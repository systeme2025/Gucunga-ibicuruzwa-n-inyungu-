/* ============================================================
   MAYE SHOP INTERVIEW & ANALYSIS PLATFORM (MAYE-SIAP v1.0.0)
   Powered by MAYE SYSTEM
   ============================================================
   FILE 3 of 3: sw.js (Service Worker)

   RESPONSIBILITY:
   - Cache index.html and logo for offline use
   - Provide offline fallback
   - Manage cache versions
   - NEVER cache Firebase responses, auth tokens, or user data

   STRATEGY:
   - index.html          → network-first, fallback to cache
   - Logo (imagekit)     → cache-first
   - Firebase RTDB/Auth  → bypass (network only)
   - Tailwind CDN        → cache-first
   - Other               → network-first

   UPDATE:
   - Bump CACHE_NAME version when index.html changes
   - Old caches are deleted automatically on activate
   ============================================================ */

const CACHE_NAME = "maye-siap-v1.0.0";
const RUNTIME_CACHE = "maye-siap-runtime-v1.0.0";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "https://ik.imagekit.io/73qho7kh9/file_000000003e9471f88734aae4d52e7513%20(1).png",
  "https://cdn.tailwindcss.com"
];

/* Domains we NEVER cache (Firebase + auth) */
const BYPASS_HOSTS = [
  "firebaseio.com",
  "firebaseapp.com",
  "googleapis.com",
  "gstatic.com/firebasejs",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com"
];

/* Domains we cache-first (static assets) */
const CACHE_FIRST_HOSTS = [
  "ik.imagekit.io",
  "cdn.tailwindcss.com"
];

/* ============================================================
   INSTALL — precache shell
   ============================================================ */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("[SW] Precache failed for:", url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ============================================================
   ACTIVATE — clean old caches
   ============================================================ */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
        .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

/* ============================================================
   FETCH — routing
   ============================================================ */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  
  // Only GET requests
  if (req.method !== "GET") return;
  
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  
  // Skip chrome-extension, moz-extension, etc.
  if (!url.protocol.startsWith("http")) return;
  
  // 1. BYPASS: Firebase, auth, tokens — always network, never cache
  if (BYPASS_HOSTS.some((h) => url.hostname.includes(h.split("/")[0]) || url.href.includes(h))) {
    return; // let browser handle it normally
  }
  
  // 2. CACHE-FIRST: static assets (logo, tailwind)
  if (CACHE_FIRST_HOSTS.some((h) => url.hostname === h || url.href.includes(h))) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, clone));
          }
          return res;
        }).catch(() => caches.match(req));
      })
    );
    return;
  }
  
  // 3. NAVIGATION: index.html — network-first with cache fallback
  if (req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html")) {
    event.respondWith(
      fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }
  
  // 4. DEFAULT: network-first, cache on success
  event.respondWith(
    fetch(req)
    .then((res) => {
      if (res && res.status === 200 && res.type === "basic") {
        const clone = res.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, clone));
      }
      return res;
    })
    .catch(() => caches.match(req))
  );
});

/* ============================================================
   MESSAGE — allow page to trigger skipWaiting
   ============================================================ */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});