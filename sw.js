// App-shell cache so the PWA also restarts offline (Firestore only caches data).
// App files: network first, so an online start always gets the latest deploy;
// the cache is just the offline fallback (one entry per file, query string
// stripped, so old ?v= versions never pile up). Firebase SDK and Google Fonts
// URLs are versioned: cache first. Everything else (Firestore, Auth) passes through.
// ponytail: no precache — offline restarts work from the second online launch
// after this worker was installed; add an install-time precache if that's too late.
const CACHE = 'fitness-shell';
const SHELL = ['', 'index.html', 'app.js', 'styles.css', 'manifest.json', 'hero.jpg', 'icon.png'];
const CDN = ['https://www.gstatic.com/firebasejs/', 'https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const put = (key, res) => { if (res.ok || res.type === 'opaque') caches.open(CACHE).then(c => c.put(key, res)); };

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const scope = self.registration.scope;
  const url = new URL(req.url);
  url.search = '';
  if (url.href.startsWith(scope) && SHELL.includes(url.href.slice(scope.length))) {
    e.respondWith(fetch(req).then(res => { put(url.href, res.clone()); return res; })
      .catch(() => caches.match(url.href)));
  } else if (CDN.some(p => req.url.startsWith(p))) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { put(req, res.clone()); return res; })));
  }
});
