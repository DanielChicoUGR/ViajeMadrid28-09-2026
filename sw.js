// sw.js - Service Worker Autónomo con Auto-descubrimiento y Runtime Cache
const CACHE_NAME = "universal-trip-explorer-v3";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./trip_schema.json",
  "https://cdn.tailwindcss.com",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css",
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap",
];

// 1. INSTALACIÓN: Pre-cachea el Core y auto-descubre todos los viajes de trips.json
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Guardar shell básica
      await cache.addAll(CORE_ASSETS);

      // Descubrir y cachear automáticamente todo lo que haya en trips.json
      try {
        const res = await fetch("./trips/trips.json");
        if (res.ok) {
          await cache.put("./trips/trips.json", res.clone());
          const trips = await res.json();
          const tripFiles = trips.map((t) => t.file).filter(Boolean);

          await Promise.allSettled(
            tripFiles.map(async (file) => {
              const fileRes = await fetch(file);
              if (fileRes.ok) await cache.put(file, fileRes);
            }),
          );
        }
      } catch (e) {
        // Modo offline durante la instalación
      }
    })().then(() => self.skipWaiting()),
  );
});

// 2. ACTIVACIÓN: Limpia cachés obsoletas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// 3. INTERCEPTOR FETCH: Network-First con Fallback a Caché y Auto-guardado
self.addEventListener("fetch", (event) => {
  // Solo interceptar peticiones GET http/https
  if (event.request.method !== "GET") return;

  event.respondWith(
    (async () => {
      try {
        // Intentar red primero para tener siempre la última versión si hay internet
        const networkResponse = await fetch(event.request);

        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          // Auto-cachea cualquier archivo que la app pida (incluyendo nuevos json en trips/)
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        // Si no hay red (modo avión/offline), responder desde la caché
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // Si pide una página HTML y no está en caché, servir index.html
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
        throw err;
      }
    })(),
  );
});
