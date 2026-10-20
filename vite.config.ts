import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'aviles-offline-shell',
      enforce: 'post',
      generateBundle(_options, bundle) {
        const assets = [...new Set(['index.html', 'aviles.svg', ...Object.keys(bundle)])];
        const version = createHash('sha256')
          .update('offline-v2')
          .update(JSON.stringify(assets))
          .digest('hex')
          .slice(0, 16);
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: `
const CACHE = 'aviles-shell-${version}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(path => new URL(path, self.registration.scope).href)))));
self.addEventListener('activate', event => event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('aviles-shell-') && key !== CACHE).map(key => caches.delete(key)))), self.clients.claim()])));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request, { ignoreVary: true })) || (event.request.mode === 'navigate' ? await cache.match(new URL('index.html', self.registration.scope).href, { ignoreVary: true }) : null) || fetch(event.request)));
});
`,
        });
      },
    },
  ],
  base: './',
  server: { port: 5173, strictPort: true },
});
