/* Bump this version whenever the app shell changes. Updates activate only once
   the previous version's tabs close; a brewing timer is never reloaded. */
const CACHE_VERSION = "2026-09-26-iphone-v3";
const CACHE_PREFIX = `tea-timer:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./engine.mjs",
  "./manifest.webmanifest",
  "./assets/tea-still-life.webp",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png",
  "./assets/chime.wav",
  "./assets/tick.wav",
  "./assets/silence.wav",
].map((path) => new URL(path, self.registration.scope).href);
const SHELL_URLS = new Set(APP_SHELL);
const INDEX_URL = new URL("./index.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  // addAll is atomic and rejects non-successful responses. A missing deployment
  // asset leaves the previous worker active instead of installing a broken shell.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(
          APP_SHELL.map((url) => new Request(url, { cache: "reload" })),
        ),
      ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// Safari requests media in byte ranges. Serve those ranges from the complete
// cached WAV as well, so the completion chime still plays without a connection.
async function rangeResponse(response, range) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return response;

  const buffer = await response.arrayBuffer();
  const size = buffer.byteLength;
  let start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  let end = match[1] && match[2] ? Number(match[2]) : size - 1;
  end = Math.min(end, size - 1);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }
  const headers = new Headers(response.headers);
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  headers.set("Accept-Ranges", "bytes");
  headers.delete("Content-Encoding");
  return new Response(buffer.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (
    url.origin !== self.location.origin ||
    !url.href.startsWith(self.registration.scope)
  )
    return;

  // Keep HTML and its scripts/styles on one version. Queries in a bookmarked
  // start URL do not prevent opening the offline app.
  const cacheKey = request.mode === "navigate" ? INDEX_URL : request.url;
  if (!SHELL_URLS.has(cacheKey)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(cacheKey);
      if (!cached) return fetch(request);
      const range = request.headers.get("Range");
      return range && url.pathname.endsWith(".wav")
        ? rangeResponse(cached, range)
        : cached;
    })(),
  );
});
