(function () {
  "use strict";

  const supabaseOrigin = "https://vmobanxusorocltxygjo.supabase.co";
  const localRestBase = "/api/velora-db/rest/v1";
  const nativeFetch = window.fetch.bind(window);
  const responseCache = new Map();
  const inFlight = new Map();

  function optimizedGetTtl(url) {
    const parsed = new URL(url, window.location.href);
    if (parsed.pathname === "/api/proxy/xtream/all/live_streams") return 5 * 60 * 1000;
    if (parsed.pathname === "/api/velora-db/rest/v1/admin_stream_curations") return 30 * 1000;
    return 0;
  }

  function cacheFriendlyInit(init) {
    const next = { ...(init || {}), cache: "force-cache" };
    const headers = new Headers(next.headers || {});
    headers.delete("cache-control");
    headers.delete("pragma");
    next.headers = headers;
    return next;
  }

  async function optimizedGet(url, init, ttl) {
    const key = String(url);
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.response.clone();

    const pending = inFlight.get(key);
    if (pending) return (await pending).clone();

    const request = nativeFetch(url, cacheFriendlyInit(init)).then(response => {
      if (response.ok) {
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
    if (rawUrl.startsWith(`${supabaseOrigin}/rest/v1/`)) {
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
    return ttl ? optimizedGet(targetUrl, init, ttl) : nativeFetch(target, init);
  };

  window.__veloraDataBackend = "vps-sqlite";
})();
