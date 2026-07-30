(function () {
  "use strict";

  const supabaseOrigin = "https://vmobanxusorocltxygjo.supabase.co";
  const localRestBase = "/api/velora-db/rest/v1";
  const nativeFetch = window.fetch.bind(window);

  window.fetch = function veloraLocalDataFetch(input, init) {
    const rawUrl = typeof input === "string" || input instanceof URL
      ? String(input)
      : String(input && input.url || "");

    if (!rawUrl.startsWith(`${supabaseOrigin}/rest/v1/`)) {
      return nativeFetch(input, init);
    }

    const remote = new URL(rawUrl);
    const localUrl = `${localRestBase}${remote.pathname.slice("/rest/v1".length)}${remote.search}`;

    if (typeof input === "string" || input instanceof URL) {
      return nativeFetch(localUrl, init);
    }

    const request = new Request(localUrl, input);
    return nativeFetch(request, init);
  };

  window.__veloraDataBackend = "vps-sqlite";
})();
