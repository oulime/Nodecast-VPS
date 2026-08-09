(function () {
  "use strict";

  // Older compiled UI code uses this inert origin as a PostgREST-shaped API
  // marker. Every matching request is redirected to VPS SQLite below.
  const legacyDataOrigin = "https://vps-sqlite.invalid";
  const localRestBase = "/api/velora-db/rest/v1";
  const nativeFetch = window.fetch.bind(window);
  const responseCache = new Map();
  const inFlight = new Map();
  let cacheGeneration = 0;
  let bypassHttpCacheUntil = 0;

  function optimizedGetTtl(url) {
    const parsed = new URL(url, window.location.href);
    if (parsed.pathname === "/api/proxy/xtream/all/live_streams") return 5 * 60 * 1000;
    if (parsed.pathname === "/api/velora-db/rest/v1/admin_stream_curations") return 30 * 1000;
    if (parsed.pathname === "/api/velora-db/home-cache") return 5 * 60 * 1000;
    if (parsed.pathname.startsWith("/api/velora-db/rest/v1/admin_")) return 30 * 1000;
    return 0;
  }

  function cacheFriendlyInit(init) {
    const next = {
      ...(init || {}),
      cache: Date.now() < bypassHttpCacheUntil ? "reload" : "force-cache"
    };
    const headers = new Headers(next.headers || {});
    headers.delete("cache-control");
    headers.delete("pragma");
    next.headers = headers;
    return next;
  }

  async function optimizedGet(url, init, ttl) {
    const key = String(url);
    const generation = cacheGeneration;
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.response.clone();

    const pending = inFlight.get(key);
    if (pending) return (await pending).clone();

    const request = nativeFetch(url, cacheFriendlyInit(init)).then(response => {
      if (response.ok && generation === cacheGeneration) {
        responseCache.set(key, {
          expiresAt: Date.now() + ttl,
          response: response.clone()
        });
      }
      return response;
    }).finally(() => inFlight.delete(key));

    inFlight.set(key, request);
    return (await request).clone();
  }

  window.fetch = function veloraLocalDataFetch(input, init) {
    const rawUrl = typeof input === "string" || input instanceof URL
      ? String(input)
      : String(input && input.url || "");

    let target = input;
    if (rawUrl.startsWith(`${legacyDataOrigin}/rest/v1/`)) {
      const remote = new URL(rawUrl);
      const localUrl = `${localRestBase}${remote.pathname.slice("/rest/v1".length)}${remote.search}`;
      target = typeof input === "string" || input instanceof URL
        ? localUrl
        : new Request(localUrl, input);
    }

    const method = String((init && init.method) || (target && target.method) || "GET").toUpperCase();
    const targetUrl = typeof target === "string" || target instanceof URL
      ? String(target)
      : String(target && target.url || "");
    const ttl = method === "GET" ? optimizedGetTtl(targetUrl) : 0;
    if (ttl) return optimizedGet(targetUrl, init, ttl);
    return nativeFetch(target, init).then(response => {
      if (method !== "GET" && method !== "HEAD" && response.ok) {
        cacheGeneration += 1;
        // A successful write invalidates both our memory cache and the
        // browser HTTP cache. This keeps admin lists synchronized immediately.
        bypassHttpCacheUntil = Date.now() + 5000;
        responseCache.clear();
        inFlight.clear();
      }
      return response;
    });
  };

  window.__veloraDataBackend = "vps-sqlite";
})();
