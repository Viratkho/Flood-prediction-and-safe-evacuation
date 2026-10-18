const CACHE_NAME = 'floodguard-osm-tiles-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept OpenStreetMap tile requests
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => {
            // Offline fallback: try cache
            return cache.match(event.request).then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // Return a dark tactical fallback tile SVG
              const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
                <rect width="256" height="256" fill="#0b1120" stroke="#1e293b" stroke-width="1"/>
                <text x="128" y="128" font-family="monospace" font-size="11" fill="#475569" text-anchor="middle">OFFLINE BASIN</text>
              </svg>`;
              return new Response(svg, {
                headers: { 'Content-Type': 'image/svg+xml' },
              });
            });
          });
      })
    );
  }
});
