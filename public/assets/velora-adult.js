/**
 * Velora VIP — Dedicated Adult +18 Portal & Multi-Provider Admin Controller
 */
(() => {
  "use strict";

  const REST_BASE = "/api/velora-db/rest/v1";
  const ADULT_CONFIRMED_KEY = "velora_adult_confirmed_v1";
  const LOCAL_STORAGE_ADULT_KEY = "velora_admin_adult_packages";
  const ADULT_KEYWORDS = /(^|\s|[-_\[(])(xxx|xx|adult|adults|adulte|adultes|adulti|erotic|erotique|erotik|porn|porno|sexy|sex|hot|playboy|hustler|dorcel|forno|penthouse|brazzers|redlight|vivid|evilangel|mfc|chaturbate|x-rated|x\s*rated|18\+|18\s*plus|\+18)($|\s|[-_\])])/i;

  let assignedAdultPackages = new Map(); // key: package_id -> row
  let allCatalogPackages = [];
  let allSources = [];
  let currentAdultView = null; // null | "vod"
  let adultLiveChannelCache = new Map(); // key -> Array of channels
  let adminSearchQuery = "";
  let adminKindFilter = "all";
  let adminSourceFilter = "all";
  let adminSelectedOnly = false;
  let isAdultOpen = false;

  function makePackageKey(kind, sourceId, categoryId) {
    return `${kind}:${sourceId}:${categoryId}`;
  }

  function cleanChannelTitle(name) {
    let clean = String(name || "").trim();
    for (let pass = 0; pass < 4; pass++) {
      const next = clean
        .replace(/^[\[\(][A-Z0-9\+\-\s]{1,12}[\]\)]\s*[-:|•]?\s*/i, "")
        .replace(/^([0-9]+K|[0-9]+D|HD|FHD|UHD|4K|VF|VOSTFR|VO|FR|AR|EN|UK|US|ES|DE|IT|PT|TR|NL|RU|PL|RO|MULTI|TRUEFRENCH|FRENCH|ARABIC)(\s*[-:|•]\s*|\s+)/i, "")
        .replace(/^[A-Z0-9]{1,6}-[A-Z0-9]{1,6}\s*[-:|•]\s*/i, "")
        .replace(/\s*([\[\(][A-Z0-9\+\-\s]{1,12}[\]\)]|\b(HD|FHD|UHD|4K|VF|VOSTFR|VO|FR|AR|EN|UK|US|ES|DE|IT|PT|TR|NL|RU|PL|RO|MULTI|TRUEFRENCH|FRENCH|ARABIC)\b)$/i, "")
        .replace(/\s*[-:|•]\s*$/g, "")
        .trim();
      if (next === clean) break;
      clean = next;
    }
    return clean || name || "";
  }

  // ---------------------------------------------------------------------------
  // Data Fetching & Sync Across All Providers
  // ---------------------------------------------------------------------------
  let fetchAssignedPromise = null;

  async function fetchAssignedAdultPackages(forceRefresh = false) {
    // 1. Instant return if already loaded in memory
    if (!forceRefresh && assignedAdultPackages.size > 0) {
      return assignedAdultPackages;
    }

    // 2. Reuse in-flight promise if a request is already running
    if (fetchAssignedPromise) {
      return fetchAssignedPromise;
    }

    // 3. Immediately hydrate from localStorage for 0ms initial render
    const cached = localStorage.getItem(LOCAL_STORAGE_ADULT_KEY);
    if (cached && assignedAdultPackages.size === 0) {
      try {
        const list = JSON.parse(cached);
        if (Array.isArray(list)) {
          assignedAdultPackages.clear();
          list.forEach(r => {
            const pkgId = String(r.package_id || r.id);
            if (pkgId) assignedAdultPackages.set(pkgId, r);
            if (r.kind && r.source_id && r.category_id) {
              assignedAdultPackages.set(makePackageKey(r.kind, r.source_id, r.category_id), r);
            }
          });
        }
      } catch (_) {}
    }

    fetchAssignedPromise = (async () => {
      try {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 2500) : null;

        const res = await fetch(`${REST_BASE}/admin_settings?key=eq.adult_packages`, {
          signal: controller ? controller.signal : undefined,
          headers: { "Content-Type": "application/json" }
        });
        if (timeoutId) clearTimeout(timeoutId);

        if (res.ok) {
          const rows = await res.json();
          if (Array.isArray(rows) && rows[0] && rows[0].value) {
            try {
              const list = JSON.parse(rows[0].value);
              if (Array.isArray(list)) {
                assignedAdultPackages.clear();
                list.forEach(r => {
                  const pkgId = String(r.package_id || r.id);
                  if (pkgId) assignedAdultPackages.set(pkgId, r);
                  if (r.kind && r.source_id && r.category_id) {
                    assignedAdultPackages.set(makePackageKey(r.kind, r.source_id, r.category_id), r);
                  }
                });
                localStorage.setItem(LOCAL_STORAGE_ADULT_KEY, JSON.stringify(list));
              }
            } catch (_) {}
          }
        }
      } catch (err) {
        console.warn("[Velora Adult] Network notice for adult_packages (using cached state):", err.message);
      } finally {
        fetchAssignedPromise = null;
      }
      return assignedAdultPackages;
    })();

    return fetchAssignedPromise;
  }

  async function persistAssignedAdultPackages() {
    const uniqueMap = new Map();
    assignedAdultPackages.forEach(pkg => {
      const key = `${pkg.kind}:${pkg.source_id}:${pkg.category_id || pkg.package_id || pkg.id}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          package_id: String(pkg.package_id || pkg.id),
          name: pkg.name || "",
          kind: pkg.kind || "live",
          source_id: String(pkg.source_id || ""),
          source_name: String(pkg.source_name || ""),
          category_id: String(pkg.category_id || "")
        });
      }
    });

    const list = Array.from(uniqueMap.values());
    localStorage.setItem(LOCAL_STORAGE_ADULT_KEY, JSON.stringify(list));

    try {
      await fetch(`${REST_BASE}/admin_settings?key=eq.adult_packages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify({
          key: "adult_packages",
          value: JSON.stringify(list)
        })
      });
    } catch (e) {
      console.warn("[Velora Adult] Error saving adult packages to admin_settings:", e.message);
    }

    window.dispatchEvent(new CustomEvent("velora-adult-packages-changed"));
  }

  async function fetchAllCatalogPackages() {
    try {
      const pkgMap = new Map();
      const token = localStorage.getItem("authToken");
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      let sources = [];
      try {
        const sRes = await fetch("/api/sources/catalog", { cache: "no-store", headers });
        if (sRes.ok) {
          const sJson = await sRes.json();
          if (Array.isArray(sJson)) {
            sources = sJson.filter(s => s && s.enabled !== 0 && s.type === "xtream");
          }
        }
      } catch (e) {
        console.warn("[Velora Adult] Failed to fetch /sources/catalog:", e.message);
      }

      allSources = sources;

      const sourceJobs = sources.map(async (source) => {
        const sourceId = String(source.id);
        const sourceName = source.name || `Stream ${sourceId}`;

        const [liveCats, vodCats, seriesCats] = await Promise.all([
          fetch(`/api/proxy/xtream/${encodeURIComponent(sourceId)}/live_categories?includeHidden=true`, { cache: "no-store", headers })
            .then(r => r.ok ? r.json() : []).catch(() => []),
          fetch(`/api/proxy/xtream/${encodeURIComponent(sourceId)}/vod_categories?includeHidden=true`, { cache: "no-store", headers })
            .then(r => r.ok ? r.json() : []).catch(() => []),
          fetch(`/api/proxy/xtream/${encodeURIComponent(sourceId)}/series_categories?includeHidden=true`, { cache: "no-store", headers })
            .then(r => r.ok ? r.json() : []).catch(() => [])
        ]);

        (Array.isArray(liveCats) ? liveCats : []).forEach(cat => {
          const catId = String(cat.category_id ?? cat.id ?? "");
          if (catId) {
            const key = makePackageKey("live", sourceId, catId);
            pkgMap.set(key, {
              id: key,
              package_id: key,
              name: String(cat.category_name ?? cat.name ?? `Package ${catId}`),
              kind: "live",
              source_id: sourceId,
              source_name: sourceName,
              category_id: catId
            });
          }
        });

        (Array.isArray(vodCats) ? vodCats : []).forEach(cat => {
          const catId = String(cat.category_id ?? cat.id ?? "");
          if (catId) {
            const key = makePackageKey("movies", sourceId, catId);
            pkgMap.set(key, {
              id: key,
              package_id: key,
              name: String(cat.category_name ?? cat.name ?? `Package ${catId}`),
              kind: "movies",
              source_id: sourceId,
              source_name: sourceName,
              category_id: catId
            });
          }
        });

        (Array.isArray(seriesCats) ? seriesCats : []).forEach(cat => {
          const catId = String(cat.category_id ?? cat.id ?? "");
          if (catId) {
            const key = makePackageKey("series", sourceId, catId);
            pkgMap.set(key, {
              id: key,
              package_id: key,
              name: String(cat.category_name ?? cat.name ?? `Package ${catId}`),
              kind: "series",
              source_id: sourceId,
              source_name: sourceName,
              category_id: catId
            });
          }
        });
      });

      await Promise.all(sourceJobs);

      try {
        const res = await fetch(`${REST_BASE}/admin_packages?select=id,name,kind,source_id,category_id,country_id,cover_url&order=name.asc`, {
          cache: "no-store",
          headers: { "Content-Type": "application/json" }
        });
        if (res.ok) {
          const dbPkgs = await res.json();
          (Array.isArray(dbPkgs) ? dbPkgs : []).forEach(p => {
            const strId = String(p.id);
            if (p && strId && !pkgMap.has(strId)) {
              pkgMap.set(strId, {
                id: strId,
                package_id: strId,
                name: p.name || `Package ${strId}`,
                kind: p.kind === "vod" ? "movies" : (p.kind || "live"),
                source_id: p.source_id || "",
                source_name: "Personnalisé",
                category_id: p.category_id || ""
              });
            }
          });
        }
      } catch (_) {}

      allCatalogPackages = Array.from(pkgMap.values()).sort((a, b) => 
        String(a.name || "").localeCompare(String(b.name || ""), "fr")
      );
    } catch (err) {
      console.warn("[Velora Adult] Error loading catalog packages:", err.message);
    }
  }

  async function autoDiscoverAndAssignAdultPackages() {
    if (assignedAdultPackages.size > 0) return assignedAdultPackages;
    if (allCatalogPackages.length === 0) {
      await fetchAllCatalogPackages();
    }
    const matched = allCatalogPackages.filter(pkg => {
      const name = String(pkg.name || "");
      return ADULT_KEYWORDS.test(name);
    });

    if (matched.length > 0) {
      matched.forEach(pkg => {
        const id = String(pkg.package_id || pkg.id);
        if (id) assignedAdultPackages.set(id, pkg);
        if (pkg.kind && pkg.source_id && pkg.category_id) {
          assignedAdultPackages.set(makePackageKey(pkg.kind, pkg.source_id, pkg.category_id), pkg);
        }
      });
      await persistAssignedAdultPackages();
    }
    return assignedAdultPackages;
  }

  function isPackageSelected(pkg) {
    if (!pkg) return false;
    const id = String(pkg.id || pkg.package_id);
    if (assignedAdultPackages.has(id)) return true;
    if (pkg.kind && pkg.source_id && pkg.category_id) {
      const key = makePackageKey(pkg.kind, pkg.source_id, pkg.category_id);
      if (assignedAdultPackages.has(key)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Admin Panel Tab Controller
  // ---------------------------------------------------------------------------
  async function initAdminAdultPanel() {
    const grid = document.getElementById("vel-admin-adult-grid");
    const status = document.getElementById("vel-admin-adult-status");
    const badge = document.getElementById("vel-admin-adult-count-badge");
    const searchInput = document.getElementById("vel-admin-adult-search");
    const sourceSelect = document.getElementById("vel-admin-adult-source-select");
    if (!grid) return;

    function setStatus(msg, isError = false) {
      if (status) {
        status.textContent = msg;
        status.classList.toggle("error", isError);
      }
    }

    setStatus("Chargement des streams et catalogues de tous les fournisseurs...");
    await Promise.all([fetchAssignedAdultPackages(), fetchAllCatalogPackages()]);
    setStatus("");

    if (sourceSelect) {
      sourceSelect.replaceChildren();
      const allOpt = document.createElement("option");
      allOpt.value = "all";
      allOpt.textContent = `Tous les streams (${allCatalogPackages.length} packages au total)`;
      sourceSelect.appendChild(allOpt);

      allSources.forEach(s => {
        const sId = String(s.id);
        const count = allCatalogPackages.filter(p => String(p.source_id) === sId).length;
        const opt = document.createElement("option");
        opt.value = sId;
        opt.textContent = `Stream : ${s.name || sId} (${count} packages)`;
        sourceSelect.appendChild(opt);
      });

      sourceSelect.value = adminSourceFilter;
      sourceSelect.onchange = (e) => {
        adminSourceFilter = e.target.value;
        renderAdminGrid();
      };
    }

    function renderAdminGrid() {
      const activeCount = allCatalogPackages.filter(isPackageSelected).length;
      if (badge) {
        badge.textContent = `${activeCount} bouquet(s) activé(s)`;
      }

      grid.replaceChildren();

      const q = adminSearchQuery.trim().toLowerCase();
      const filtered = allCatalogPackages.filter(pkg => {
        const name = String(pkg.name || "").toLowerCase();
        const kind = String(pkg.kind || "live").toLowerCase();
        const srcId = String(pkg.source_id || "");
        const srcName = String(pkg.source_name || "").toLowerCase();
        const id = String(pkg.id);
        const isSelected = isPackageSelected(pkg);

        if (adminSelectedOnly && !isSelected) return false;
        if (adminSourceFilter !== "all" && srcId !== adminSourceFilter) return false;

        if (adminKindFilter !== "all") {
          if (adminKindFilter === "movies" && kind !== "movies" && kind !== "vod") return false;
          if (adminKindFilter === "series" && kind !== "series") return false;
          if (adminKindFilter === "live" && kind !== "live") return false;
        }

        if (q && !name.includes(q) && !id.includes(q) && !srcName.includes(q)) return false;

        return true;
      });

      if (!filtered.length) {
        grid.innerHTML = '<div class="vel-adult-empty">Aucun bouquet correspondant trouvé.</div>';
        return;
      }

      filtered.forEach(pkg => {
        const pkgId = String(pkg.package_id || pkg.id);
        const isSelected = isPackageSelected(pkg);

        const itemEl = document.createElement("div");
        itemEl.className = `vel-admin-adult-item ${isSelected ? "is-selected" : ""}`;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = isSelected;

        const info = document.createElement("div");
        info.className = "vel-admin-adult-item__info";

        const nameEl = document.createElement("div");
        nameEl.className = "vel-admin-adult-item__name";
        nameEl.textContent = pkg.name || pkgId;

        const meta = document.createElement("div");
        meta.className = "vel-admin-adult-item__meta";

        if (pkg.source_name) {
          const srcBadge = document.createElement("span");
          srcBadge.className = "vel-admin-adult-item__source";
          srcBadge.textContent = pkg.source_name;
          meta.appendChild(srcBadge);
        }

        const kindBadge = document.createElement("span");
        kindBadge.className = "vel-admin-adult-item__kind";
        const kindLabel = pkg.kind === "movies" || pkg.kind === "vod" ? "🎬 FILMS" : (pkg.kind === "series" ? "🍿 SÉRIES" : "📺 DIRECT");
        kindBadge.textContent = kindLabel;
        meta.appendChild(kindBadge);

        info.append(nameEl, meta);
        itemEl.append(checkbox, info);

        const toggle = async (e) => {
          e.stopPropagation();
          const targetState = !isPackageSelected(pkg);
          checkbox.checked = targetState;
          itemEl.classList.toggle("is-selected", targetState);

          if (targetState) {
            assignedAdultPackages.set(pkgId, pkg);
            if (pkg.kind && pkg.source_id && pkg.category_id) {
              assignedAdultPackages.set(makePackageKey(pkg.kind, pkg.source_id, pkg.category_id), pkg);
            }
          } else {
            assignedAdultPackages.delete(pkgId);
            if (pkg.kind && pkg.source_id && pkg.category_id) {
              assignedAdultPackages.delete(makePackageKey(pkg.kind, pkg.source_id, pkg.category_id));
            }
          }

          const activeNow = allCatalogPackages.filter(isPackageSelected).length;
          if (badge) badge.textContent = `${activeNow} bouquet(s) activé(s)`;

          setStatus("Enregistrement...");
          await persistAssignedAdultPackages();
          setStatus("✅ Modifications enregistrées avec succès !");
          setTimeout(() => setStatus(""), 2000);
        };

        itemEl.addEventListener("click", toggle);
        grid.appendChild(itemEl);
      });
    }

    if (searchInput) {
      searchInput.oninput = (e) => {
        adminSearchQuery = e.target.value;
        renderAdminGrid();
      };
    }

    document.querySelectorAll(".vel-admin-filter-pill").forEach(pill => {
      pill.onclick = () => {
        document.querySelectorAll(".vel-admin-filter-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        if (pill.dataset.filterSelected) {
          adminSelectedOnly = true;
          adminKindFilter = "all";
        } else {
          adminSelectedOnly = false;
          adminKindFilter = pill.dataset.filterKind || "all";
        }
        renderAdminGrid();
      };
    });

    const autoSuggestBtn = document.getElementById("vel-admin-adult-auto-suggest");
    if (autoSuggestBtn) {
      autoSuggestBtn.onclick = async () => {
        const detected = allCatalogPackages.filter(p => ADULT_KEYWORDS.test(p.name || ""));
        if (!detected.length) {
          setStatus("Aucun bouquet supplémentaire contenant un mot-clé +18 n'a été détecté parmi tous les fournisseurs.");
          return;
        }
        setStatus(`Ajout de ${detected.length} bouquet(s) +18 détectés parmi tous les fournisseurs...`);
        for (const pkg of detected) {
          const pkgId = String(pkg.package_id || pkg.id);
          assignedAdultPackages.set(pkgId, pkg);
          if (pkg.kind && pkg.source_id && pkg.category_id) {
            assignedAdultPackages.set(makePackageKey(pkg.kind, pkg.source_id, pkg.category_id), pkg);
          }
        }
        await persistAssignedAdultPackages();
        setStatus(`✅ ${detected.length} bouquets +18 de tous vos fournisseurs ont été enregistrés !`);
        renderAdminGrid();
      };
    }

    const selectAllBtn = document.getElementById("vel-admin-adult-select-all");
    if (selectAllBtn) {
      selectAllBtn.onclick = async () => {
        setStatus("Attribution en cours...");
        for (const pkg of allCatalogPackages) {
          const pkgId = String(pkg.package_id || pkg.id);
          assignedAdultPackages.set(pkgId, pkg);
          if (pkg.kind && pkg.source_id && pkg.category_id) {
            assignedAdultPackages.set(makePackageKey(pkg.kind, pkg.source_id, pkg.category_id), pkg);
          }
        }
        await persistAssignedAdultPackages();
        setStatus("Tous les bouquets ont été cochés et enregistrés.");
        renderAdminGrid();
      };
    }

    const deselectAllBtn = document.getElementById("vel-admin-adult-deselect-all");
    if (deselectAllBtn) {
      deselectAllBtn.onclick = async () => {
        if (!confirm("Voulez-vous vraiment retirer tous les bouquets de la section adulte ?")) return;
        setStatus("Suppression...");
        assignedAdultPackages.clear();
        await persistAssignedAdultPackages();
        setStatus("Tous les bouquets adultes ont été retirés et enregistrés.");
        renderAdminGrid();
      };
    }

    renderAdminGrid();
  }

  // ---------------------------------------------------------------------------
  // Dedicated Adult Portal View Controller (#adult-view)
  // ---------------------------------------------------------------------------
  async function resolveStreamMediaUrl(endpoint) {
    try {
      const token = localStorage.getItem("authToken");
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(endpoint, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json && json.url) {
          let directUrl = String(json.url).trim();
          if (/^https?:\/\//i.test(directUrl)) {
            return `/api/proxy/stream?url=${encodeURIComponent(directUrl)}`;
          }
          return directUrl;
        }
      }
    } catch (e) {
      console.warn("[Velora Adult] Failed to resolve stream URL from endpoint:", endpoint, e.message);
    }
    return null;
  }

  async function fetchLiveChannelsForPackage(pkg) {
    const key = `${pkg.source_id}:${pkg.category_id}`;
    if (adultLiveChannelCache.has(key)) return adultLiveChannelCache.get(key);

    const sessionKey = `velora_adult_live_${key}`;
    try {
      const stored = sessionStorage.getItem(sessionKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          adultLiveChannelCache.set(key, parsed);
          return parsed;
        }
      }
    } catch (_) {}

    const token = localStorage.getItem("authToken");
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch(`/api/proxy/xtream/${encodeURIComponent(pkg.source_id)}/live_streams?category_id=${encodeURIComponent(pkg.category_id)}`, {
        headers
      });
      if (res.ok) {
        const rows = await res.json();
        const list = Array.isArray(rows) ? rows.map(ch => ({
          ...ch,
          source_id: String(pkg.source_id),
          source_name: pkg.source_name || "",
          package_name: pkg.name || "",
          stream_id: String(ch.stream_id || ch.id || "")
        })) : [];
        adultLiveChannelCache.set(key, list);
        try { sessionStorage.setItem(sessionKey, JSON.stringify(list)); } catch (_) {}
        return list;
      }
    } catch (e) {
      console.warn("[Velora Adult] Failed to fetch channels for package", pkg.name, e.message);
    }
    return [];
  }

  let liveChannelImageObserver = null;
  function getLiveChannelImageObserver() {
    if (liveChannelImageObserver) return liveChannelImageObserver;
    if ("IntersectionObserver" in window) {
      liveChannelImageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.dataset.src;
            if (src) {
              img.src = src;
              img.removeAttribute("data-src");
            }
            observer.unobserve(img);
          }
        });
      }, { rootMargin: "250px 0px" });
    }
    return movieImageObserver;
  }

  function formatAdultPlayerClock(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
    const total = Math.max(0, Math.floor(seconds));
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
    }
    return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }

  function createAdultPlayerWidget(isLive = false) {
    const container = document.createElement("div");
    container.id = "vel-adult-player-container";
    container.className = "vel-adult-player-container";

    container.innerHTML = `
      <div class="vel-adult-video-wrapper">
        <video id="vel-adult-video" playsinline webkit-playsinline preload="auto"></video>
        <div id="vel-adult-player-buffering" class="vel-adult-buffering hidden">
          <div class="vel-adult-spinner"></div>
        </div>
        ${!isLive ? `
        <div id="vel-adult-center-controls" class="vel-adult-center-controls">
          <button id="vel-adult-btn-back-10" class="vel-adult-center-btn" title="−10s" aria-label="−10 secondes">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/><text x="12" y="15" font-size="7" font-weight="bold" fill="currentColor" text-anchor="middle" stroke="none">10</text></svg>
          </button>
          <button id="vel-adult-btn-center-play" class="vel-adult-center-btn vel-adult-play-btn" title="Lecture / Pause" aria-label="Lecture">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </button>
          <button id="vel-adult-btn-fwd-10" class="vel-adult-center-btn" title="+10s" aria-label="+10 secondes">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/><text x="12" y="15" font-size="7" font-weight="bold" fill="currentColor" text-anchor="middle" stroke="none">10</text></svg>
          </button>
        </div>
        ` : `
        <div id="vel-adult-center-controls" class="vel-adult-center-controls">
          <button id="vel-adult-btn-center-play" class="vel-adult-center-btn vel-adult-play-btn" title="Lecture / Pause" aria-label="Lecture">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </button>
        </div>
        `}
        <div id="vel-adult-toolbar" class="vel-adult-toolbar">
          <div class="vel-adult-toolbar-row">
            ${!isLive ? `
            <button id="vel-adult-prev" class="vel-adult-tool-btn" title="Film précédent" aria-label="Film précédent">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            ` : ''}
            <button id="vel-adult-play-bar" class="vel-adult-tool-btn" title="Lecture / Pause" aria-label="Lecture">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            </button>
            ${!isLive ? `
            <button id="vel-adult-next" class="vel-adult-tool-btn" title="Film suivant" aria-label="Film suivant">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
            <span id="vel-adult-current-time" class="vel-adult-time">00:00</span>
            <div id="vel-adult-seek-track" class="vel-adult-seek-track">
              <div id="vel-adult-seek-fill" class="vel-adult-seek-fill"></div>
              <div id="vel-adult-seek-handle" class="vel-adult-seek-handle"></div>
            </div>
            <span id="vel-adult-duration" class="vel-adult-time">00:00</span>
            ` : `
            <span class="vel-adult-live-badge" style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:6px;background:rgba(239,68,68,0.25);color:#ef4444;font-size:0.75rem;font-weight:800;letter-spacing:0.04em;">
              <span style="width:7px;height:7px;border-radius:50%;background:#ef4444;display:inline-block;"></span>
              DIRECT
            </span>
            <div style="flex:1;"></div>
            `}
            <button id="vel-adult-fullscreen" class="vel-adult-tool-btn" title="Plein écran" aria-label="Plein écran">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div id="vel-adult-now-playing-title" class="vel-adult-now-playing-title">Chargement du contenu...</div>
    `;

    const video = container.querySelector("#vel-adult-video");
    const centerControls = container.querySelector("#vel-adult-center-controls");
    const toolbar = container.querySelector("#vel-adult-toolbar");
    const centerPlay = container.querySelector("#vel-adult-btn-center-play");
    const barPlay = container.querySelector("#vel-adult-play-bar");
    const back10 = container.querySelector("#vel-adult-btn-back-10");
    const fwd10 = container.querySelector("#vel-adult-btn-fwd-10");
    const prevBtn = container.querySelector("#vel-adult-prev");
    const nextBtn = container.querySelector("#vel-adult-next");
    const curTime = container.querySelector("#vel-adult-current-time");
    const durTime = container.querySelector("#vel-adult-duration");
    const seekTrack = container.querySelector("#vel-adult-seek-track");
    const seekFill = container.querySelector("#vel-adult-seek-fill");
    const seekHandle = container.querySelector("#vel-adult-seek-handle");
    const fullscreenBtn = container.querySelector("#vel-adult-fullscreen");
    const buffering = container.querySelector("#vel-adult-player-buffering");

    let idleTimer = null;
    function showControls() {
      if (idleTimer) clearTimeout(idleTimer);
      if (centerControls) centerControls.classList.remove("idle");
      if (toolbar) toolbar.classList.remove("idle");
      if (!video.paused) {
        idleTimer = setTimeout(() => {
          if (centerControls) centerControls.classList.add("idle");
          if (toolbar) toolbar.classList.add("idle");
        }, 3000);
      }
    }

    container.querySelector(".vel-adult-video-wrapper").onmousemove = showControls;
    container.querySelector(".vel-adult-video-wrapper").ontouchstart = showControls;

    function togglePlay() {
      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
      showControls();
    }

    if (centerPlay) centerPlay.onclick = (e) => { e.stopPropagation(); togglePlay(); };
    if (barPlay) barPlay.onclick = (e) => { e.stopPropagation(); togglePlay(); };

    if (back10) {
      back10.onclick = (e) => {
        e.stopPropagation();
        video.currentTime = Math.max(0, video.currentTime - 10);
        showControls();
      };
    }

    if (fwd10) {
      fwd10.onclick = (e) => {
        e.stopPropagation();
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
        showControls();
      };
    }

    if (prevBtn) {
      prevBtn.onclick = (e) => {
        e.stopPropagation();
        if (window._veloraAdultVodMovies && window._veloraAdultVodCurrentIndex > 0) {
          playAdultMovieByIndex(window._veloraAdultVodCurrentIndex - 1);
        }
      };
    }

    if (nextBtn) {
      nextBtn.onclick = (e) => {
        e.stopPropagation();
        if (window._veloraAdultVodMovies && window._veloraAdultVodCurrentIndex < window._veloraAdultVodMovies.length - 1) {
          playAdultMovieByIndex(window._veloraAdultVodCurrentIndex + 1);
        }
      };
    }

    if (fullscreenBtn) {
      fullscreenBtn.onclick = (e) => {
        e.stopPropagation();
        const wrapper = container.querySelector(".vel-adult-video-wrapper");
        if (!document.fullscreenElement) {
          wrapper.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      };
    }

    if (seekTrack) {
      seekTrack.onclick = (e) => {
        e.stopPropagation();
        if (!Number.isFinite(video.duration) || video.duration <= 0) return;
        const rect = seekTrack.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        video.currentTime = pos * video.duration;
        showControls();
      };
    }

    video.onplay = () => {
      const pauseSvg = '<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      const barPauseSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      if (centerPlay) centerPlay.innerHTML = pauseSvg;
      if (barPlay) barPlay.innerHTML = barPauseSvg;
      buffering.classList.add("hidden");
      showControls();
    };

    video.onpause = () => {
      const playSvg = '<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
      const barPlaySvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
      if (centerPlay) centerPlay.innerHTML = playSvg;
      if (barPlay) barPlay.innerHTML = barPlaySvg;
      if (centerControls) centerControls.classList.remove("idle");
      if (toolbar) toolbar.classList.remove("idle");
    };

    video.onwaiting = () => {
      buffering.classList.remove("hidden");
    };

    video.onplaying = () => {
      buffering.classList.add("hidden");
    };

    if (!isLive) {
      video.ontimeupdate = () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
          if (curTime) curTime.textContent = formatAdultPlayerClock(video.currentTime);
          return;
        }
        if (curTime) curTime.textContent = formatAdultPlayerClock(video.currentTime);
        if (durTime) durTime.textContent = formatAdultPlayerClock(video.duration);
        const pct = (video.currentTime / video.duration) * 100;
        if (seekFill) seekFill.style.width = `${pct}%`;
        if (seekHandle) seekHandle.style.left = `${pct}%`;

        if (prevBtn) prevBtn.disabled = !window._veloraAdultVodMovies || window._veloraAdultVodCurrentIndex <= 0;
        if (nextBtn) nextBtn.disabled = !window._veloraAdultVodMovies || window._veloraAdultVodCurrentIndex >= window._veloraAdultVodMovies.length - 1;
      };

      video.onended = () => {
        if (window._veloraAdultVodMovies && window._veloraAdultVodCurrentIndex < window._veloraAdultVodMovies.length - 1) {
          playAdultMovieByIndex(window._veloraAdultVodCurrentIndex + 1);
        }
      };
    }

    return container;
  }

  async function playAdultLiveChannelByIndex(index) {
    const list = window._veloraAdultLiveChannels;
    if (!list || index < 0 || index >= list.length) return;

    window._veloraAdultLiveCurrentIndex = index;
    const channel = list[index];

    const rows = document.querySelectorAll(".vel-adult-channel-row");
    rows.forEach((row, idx) => {
      const isCurrent = idx === index;
      row.classList.toggle("vel-adult-channel-row--active", isCurrent);
      row.classList.toggle("selected", isCurrent);
      if (isCurrent && index > 0) {
        row.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });

    const titleEl = document.getElementById("vel-adult-now-playing-title");
    if (titleEl) titleEl.textContent = `📺 ${channel.name}`;

    const video = document.getElementById("vel-adult-video");
    if (!video) return;

    const apiUrl = `/api/proxy/xtream/${encodeURIComponent(channel.source_id)}/stream/${encodeURIComponent(channel.stream_id)}/live?container=m3u8`;
    const resolvedUrl = await resolveStreamMediaUrl(apiUrl);
    const finalUrl = resolvedUrl || apiUrl;

    if (video.hls && typeof video.hls.destroy === "function") {
      try { video.hls.destroy(); } catch (_) {}
      video.hls = null;
    }

    const isHls = finalUrl.includes(".m3u8") || finalUrl.includes("m3u8");
    if (isHls && window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls();
      hls.loadSource(finalUrl);
      hls.attachMedia(video);
      video.hls = hls;
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.warn("[Adult Live] Play error:", e));
      });
    } else {
      video.src = finalUrl;
      video.load();
      video.play().catch(e => console.warn("[Adult Live] Play error:", e));
    }
  }

  window.veloraPlayAdultChannelByIndex = playAdultLiveChannelByIndex;

  function setAdultPlayerHeaderVisible(visible) {
    const mainHeader = document.querySelector(".vel-adult-header");
    if (mainHeader) {
      if (visible) {
        mainHeader.classList.remove("hidden");
        mainHeader.style.removeProperty("display");
      } else {
        mainHeader.classList.add("hidden");
        mainHeader.style.setProperty("display", "none", "important");
      }
    }
    if (visible) {
      document.body.classList.remove("vel-adult-player-active");
    } else {
      document.body.classList.add("vel-adult-player-active");
    }
  }

  function renderAdultChannelsListView(channels, targetContainer) {
    const container = targetContainer || document.getElementById("vel-adult-packages-container");
    if (!container) return;

    // Immediately hide main adult header when entering player view
    setAdultPlayerHeaderVisible(false);

    container.replaceChildren();

    const subHeader = document.createElement("div");
    subHeader.className = "vel-adult-sub-header";
    subHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 auto 14px;width:100%;max-width:960px;box-sizing:border-box;";
    subHeader.innerHTML = `
      <button type="button" id="btn-adult-back-to-hub-live" class="vel-adult-back-btn" title="Retour aux choix">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        <span>← Retour</span>
      </button>
      <div class="vel-adult-movie-search-wrap" style="flex:1;max-width:480px;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" class="vel-adult-channel-search-input" placeholder="Rechercher une chaîne..." autocomplete="off" />
      </div>
    `;

    const backBtn = subHeader.querySelector("#btn-adult-back-to-hub-live");
    if (backBtn) {
      backBtn.onclick = () => {
        const adultVideo = document.getElementById("vel-adult-video");
        if (adultVideo) {
          try {
            adultVideo.pause();
            if (adultVideo.hls && typeof adultVideo.hls.destroy === "function") {
              adultVideo.hls.destroy();
              adultVideo.hls = null;
            }
          } catch (_) {}
        }
        renderAdultPortal();
      };
    }

    const stickyTop = document.createElement("div");
    stickyTop.className = "vel-adult-sticky-top";
    stickyTop.appendChild(subHeader);
    stickyTop.appendChild(createAdultPlayerWidget(true));
    container.appendChild(stickyTop);

    const itemsContainer = document.createElement("div");
    itemsContainer.className = "vel-adult-channel-list-items";

    function renderChannels(filterQuery = "") {
      itemsContainer.replaceChildren();
      const q = filterQuery.trim().toLowerCase();
      const filtered = q
        ? channels.map((ch, originalIdx) => ({ ...ch, originalIdx })).filter(ch => String(ch.name || "").toLowerCase().includes(q))
        : channels.map((ch, originalIdx) => ({ ...ch, originalIdx }));

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "vel-adult-empty";
        empty.style.padding = "30px 16px";
        empty.textContent = "Aucune chaîne ne correspond à votre recherche.";
        itemsContainer.appendChild(empty);
        return;
      }

      filtered.forEach((channel) => {
        const originalIdx = channel.originalIdx;

        const row = document.createElement("div");
        row.className = `vel-adult-channel-row ${originalIdx === (window._veloraAdultLiveCurrentIndex || 0) ? "vel-adult-channel-row--active" : ""}`;
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.dataset.streamId = String(channel.stream_id);
        row.dataset.index = String(originalIdx);

        const channelTitle = document.createElement("div");
        channelTitle.className = "vel-adult-channel-row__title";
        channelTitle.textContent = channel.name;

        row.appendChild(channelTitle);

        row.onclick = () => {
          playAdultLiveChannelByIndex(originalIdx);
        };

        itemsContainer.appendChild(row);
      });
    }

    const searchInput = subHeader.querySelector(".vel-adult-channel-search-input");
    if (searchInput) {
      searchInput.oninput = (e) => {
        renderChannels(e.target.value);
      };
    }

    renderChannels("");
    container.appendChild(itemsContainer);
  }

  async function openAdultLivePlayerDirectly() {
    setAdultPlayerHeaderVisible(false);
    const portal = document.getElementById("adult-view");
    const container = document.getElementById("vel-adult-packages-container");
    if (!portal || !container) return false;

    container.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:#94a3b8;">
        <div class="vel-adult-spinner" style="margin:0 auto 16px;"></div>
        <div style="font-size:0.95rem;font-weight:600;color:#f1f5f9;">Chargement des chaînes TV adultes...</div>
      </div>
    `;

    await fetchAssignedAdultPackages();
    if (assignedAdultPackages.size === 0) {
      await autoDiscoverAndAssignAdultPackages();
    }
    const livePackages = Array.from(assignedAdultPackages.values()).filter(p => p.kind === "live");
    if (!livePackages.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:#94a3b8;">
          <div style="font-size:1.1rem;font-weight:700;color:#f43f5e;margin-bottom:8px;">Aucune chaîne TV adulte trouvée</div>
          <button type="button" id="vel-adult-back-hub-empty" class="vel-adult-back-btn" style="margin-top:16px;">← Retour aux choix</button>
        </div>
      `;
      const btn = document.getElementById("vel-adult-back-hub-empty");
      if (btn) btn.onclick = () => renderAdultPortal();
      return false;
    }

    const channelGroups = await Promise.all(livePackages.map(p => fetchLiveChannelsForPackage(p)));
    const allChannels = channelGroups.flat();

    const seen = new Set();
    const uniqueChannels = [];
    allChannels.forEach(ch => {
      const sid = String(ch.stream_id || ch.id || "");
      const key = `${ch.source_id}:${sid}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueChannels.push({
          source_id: String(ch.source_id || ch.sourceId || ""),
          stream_id: sid,
          item_id: sid,
          item_type: "channel",
          name: cleanChannelTitle(ch.name),
          thumb_url: ch.stream_icon || "",
          package_name: ch.package_name || ""
        });
      }
    });

    if (!uniqueChannels.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:#94a3b8;">
          <div style="font-size:1.1rem;font-weight:700;color:#f43f5e;margin-bottom:8px;">Aucune chaîne TV adulte disponible</div>
          <button type="button" id="vel-adult-back-hub-empty" class="vel-adult-back-btn" style="margin-top:16px;">← Retour aux choix</button>
        </div>
      `;
      const btn = document.getElementById("vel-adult-back-hub-empty");
      if (btn) btn.onclick = () => renderAdultPortal();
      return false;
    }

    window._veloraAdultLiveChannels = uniqueChannels;
    window._veloraAdultLiveCurrentIndex = 0;

    renderAdultChannelsListView(uniqueChannels, container);
    await playAdultLiveChannelByIndex(0);
    window.scrollTo(0, 0);
    return true;
  }

  const adultVodMovieCache = new Map();

  async function fetchVodMoviesForPackage(pkg) {
    const catId = pkg.category_id || pkg.package_id || pkg.id;
    const key = `${pkg.source_id}:${catId}`;
    if (adultVodMovieCache.has(key)) return adultVodMovieCache.get(key);

    const sessionKey = `velora_adult_vod_${key}`;
    try {
      const stored = sessionStorage.getItem(sessionKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          adultVodMovieCache.set(key, parsed);
          return parsed;
        }
      }
    } catch (_) {}

    const token = localStorage.getItem("authToken");
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch(`/api/proxy/xtream/${encodeURIComponent(pkg.source_id)}/vod_streams?category_id=${encodeURIComponent(catId)}`, {
        headers
      });
      if (res.ok) {
        const rows = await res.json();
        const list = Array.isArray(rows) ? rows.map(m => ({
          ...m,
          source_id: String(pkg.source_id),
          source_name: pkg.source_name || "",
          package_name: pkg.name || "",
          stream_id: String(m.stream_id || m.id || ""),
          name: cleanChannelTitle(m.name || m.title || "Film Adulte"),
          stream_icon: m.stream_icon || m.cover || "",
          container_extension: m.container_extension || "mp4",
          rating: m.rating || m.rating_5based || "",
          duration: m.duration || m.duration_secs || ""
        })) : [];
        adultVodMovieCache.set(key, list);
        try { sessionStorage.setItem(sessionKey, JSON.stringify(list)); } catch (_) {}
        return list;
      }
    } catch (e) {
      console.warn("[Velora Adult] Failed to fetch movies for package", pkg.name, e.message);
    }
    return [];
  }

  async function playAdultMovieByIndex(index) {
    const list = window._veloraAdultVodMovies;
    if (!list || index < 0 || index >= list.length) return;

    window._veloraAdultVodCurrentIndex = index;
    const movie = list[index];

    const rows = document.querySelectorAll(".vel-adult-movie-row");
    rows.forEach((row, idx) => {
      const isCurrent = idx === index;
      row.classList.toggle("vel-adult-movie-row--active", isCurrent);
      row.classList.toggle("selected", isCurrent);
      const badge = row.querySelector(".vel-adult-movie-row__playing-badge");
      if (badge) badge.style.display = isCurrent ? "inline-flex" : "none";
      if (isCurrent && index > 0) {
        row.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });

    const titleEl = document.getElementById("vel-adult-now-playing-title");
    if (titleEl) titleEl.textContent = `🎬 ${movie.name}`;

    const video = document.getElementById("vel-adult-video");
    if (!video) return;

    const ext = movie.container_extension || "mp4";
    const apiUrl = `/api/proxy/xtream/${encodeURIComponent(movie.source_id)}/stream/${encodeURIComponent(movie.stream_id)}/movie?container=${encodeURIComponent(ext)}`;
    const resolvedUrl = await resolveStreamMediaUrl(apiUrl);
    const finalUrl = resolvedUrl || apiUrl;

    if (video.hls && typeof video.hls.destroy === "function") {
      try { video.hls.destroy(); } catch (_) {}
      video.hls = null;
    }

    const isHls = finalUrl.includes(".m3u8") || finalUrl.includes("m3u8");
    if (isHls && window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls();
      hls.loadSource(finalUrl);
      hls.attachMedia(video);
      video.hls = hls;
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.warn("[Adult VOD] Autoplay prevented:", e));
      });
    } else {
      video.src = finalUrl;
      video.load();
      video.play().catch(e => console.warn("[Adult VOD] Play notice:", e));
    }
  }

  window.veloraPlayAdultMovieByIndex = playAdultMovieByIndex;

  function renderAdultMoviesListView(movies, targetContainer) {
    const container = targetContainer || document.getElementById("vel-adult-packages-container");
    if (!container) return;

    // Hide main adult header to keep only back button & search bar at the top
    const mainHeader = document.querySelector(".vel-adult-header");
    if (mainHeader) mainHeader.classList.add("hidden");

    container.replaceChildren();

    const subHeader = document.createElement("div");
    subHeader.className = "vel-adult-sub-header";
    subHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 auto 14px;width:100%;max-width:960px;box-sizing:border-box;";
    subHeader.innerHTML = `
      <button type="button" id="btn-adult-back-to-hub" class="vel-adult-back-btn" title="Retour aux choix">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        <span>← Retour</span>
      </button>
      <div class="vel-adult-movie-search-wrap" style="flex:1;max-width:480px;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" class="vel-adult-movie-search-input" placeholder="Rechercher un film..." autocomplete="off" />
      </div>
    `;

    const backBtn = subHeader.querySelector("#btn-adult-back-to-hub");
    if (backBtn) {
      backBtn.onclick = () => {
        const adultVideo = document.getElementById("vel-adult-video");
        if (adultVideo) {
          try {
            adultVideo.pause();
            if (adultVideo.hls && typeof adultVideo.hls.destroy === "function") {
              adultVideo.hls.destroy();
              adultVideo.hls = null;
            }
          } catch (_) {}
        }
        renderAdultPortal();
      };
    }

    const stickyTop = document.createElement("div");
    stickyTop.className = "vel-adult-sticky-top";
    stickyTop.appendChild(subHeader);
    stickyTop.appendChild(createAdultPlayerWidget(false));
    container.appendChild(stickyTop);

    const itemsContainer = document.createElement("div");
    itemsContainer.className = "vel-adult-movie-list-items";

    let movieImageObserver = null;
    function getImageObserver() {
      if (movieImageObserver) return movieImageObserver;
      if ("IntersectionObserver" in window) {
        movieImageObserver = new IntersectionObserver((entries, observer) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const img = entry.target;
              const src = img.dataset.src;
              if (src) {
                img.src = src;
                img.removeAttribute("data-src");
              }
              observer.unobserve(img);
            }
          });
        }, { rootMargin: "300px 0px" });
      }
      return movieImageObserver;
    }

    function renderItems(filterQuery = "") {
      itemsContainer.replaceChildren();
      const q = filterQuery.trim().toLowerCase();
      const filtered = q
        ? movies.map((m, originalIdx) => ({ ...m, originalIdx })).filter(m => String(m.name || "").toLowerCase().includes(q))
        : movies.map((m, originalIdx) => ({ ...m, originalIdx }));

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "vel-adult-empty";
        empty.style.padding = "30px 16px";
        empty.textContent = "Aucun film ne correspond à votre recherche.";
        itemsContainer.appendChild(empty);
        return;
      }

      const observer = getImageObserver();

      filtered.forEach((movie, globalIdx) => {
        const originalIdx = movie.originalIdx;

        const row = document.createElement("div");
        row.className = `vel-adult-movie-row ${originalIdx === (window._veloraAdultVodCurrentIndex || 0) ? "vel-adult-movie-row--active" : ""}`;
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.dataset.streamId = String(movie.stream_id);
        row.dataset.index = String(originalIdx);

        const indexEl = document.createElement("span");
        indexEl.className = "vel-adult-movie-row__index";
        indexEl.textContent = String(originalIdx + 1);

        const poster = document.createElement("div");
        poster.className = "vel-adult-movie-row__poster";
        if (movie.stream_icon) {
          const img = document.createElement("img");
          img.alt = movie.name;
          img.className = "vel-lazy-poster";
          img.onerror = () => {
            poster.innerHTML = '<span class="vel-adult-movie-row__poster--fallback">🔞</span>';
          };

          if (globalIdx < 16) {
            img.src = movie.stream_icon;
          } else {
            img.dataset.src = movie.stream_icon;
            if (observer) {
              observer.observe(img);
            } else {
              img.src = movie.stream_icon;
            }
          }
          poster.appendChild(img);
        } else {
          poster.innerHTML = '<span class="vel-adult-movie-row__poster--fallback">🔞</span>';
        }

        const info = document.createElement("div");
        info.className = "vel-adult-movie-row__info";

        const movieTitle = document.createElement("div");
        movieTitle.className = "vel-adult-movie-row__title";
        movieTitle.textContent = movie.name;

        const meta = document.createElement("div");
        meta.className = "vel-adult-movie-row__meta";
        
        const badge = document.createElement("span");
        badge.className = "vel-adult-movie-row__playing-badge";
        badge.innerHTML = `
          <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          <span>Lecture</span>
        `;
        badge.style.display = originalIdx === (window._veloraAdultVodCurrentIndex || 0) ? "inline-flex" : "none";

        const sourceInfo = document.createElement("span");
        sourceInfo.textContent = movie.package_name ? `${movie.package_name}` : "🔞 Film Adulte";

        meta.append(badge, sourceInfo);
        info.append(movieTitle, meta);

        row.append(indexEl, poster, info);

        row.onclick = () => {
          playAdultMovieByIndex(originalIdx);
        };

        itemsContainer.appendChild(row);
      });
    }

    const searchInput = subHeader.querySelector(".vel-adult-movie-search-input");
    if (searchInput) {
      searchInput.oninput = (e) => {
        renderItems(e.target.value);
      };
    }

    renderItems("");
    container.appendChild(itemsContainer);
  }

  async function openAdultMoviesPlayerDirectly() {
    setAdultPlayerHeaderVisible(false);
    const portal = document.getElementById("adult-view");
    const container = document.getElementById("vel-adult-packages-container");
    if (!portal || !container) return false;

    container.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:#94a3b8;">
        <div class="vel-adult-spinner" style="margin:0 auto 16px;"></div>
        <div style="font-size:0.95rem;font-weight:600;color:#f1f5f9;">Chargement des films adultes...</div>
      </div>
    `;

    await fetchAssignedAdultPackages();
    if (assignedAdultPackages.size === 0) {
      await autoDiscoverAndAssignAdultPackages();
    }
    const vodPackages = Array.from(assignedAdultPackages.values()).filter(p => p.kind === "movies" || p.kind === "vod");
    if (!vodPackages.length) {
      const livePackages = Array.from(assignedAdultPackages.values()).filter(p => p.kind === "live");
      if (livePackages.length > 0) {
        return await openAdultLivePlayerDirectly();
      }
      container.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:#94a3b8;">
          <div style="font-size:1.1rem;font-weight:700;color:#f43f5e;margin-bottom:8px;">Aucun film adulte trouvé</div>
          <button type="button" id="vel-adult-back-hub-empty" class="vel-adult-back-btn" style="margin-top:16px;">← Retour aux choix</button>
        </div>
      `;
      const btn = document.getElementById("vel-adult-back-hub-empty");
      if (btn) btn.onclick = () => renderAdultPortal();
      return false;
    }

    const movieGroups = await Promise.all(vodPackages.map(p => fetchVodMoviesForPackage(p)));
    const allMovies = movieGroups.flat();

    const seen = new Set();
    const uniqueMovies = [];
    allMovies.forEach(m => {
      const key = `${m.source_id}:${m.stream_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueMovies.push(m);
      }
    });

    if (!uniqueMovies.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:#94a3b8;">
          <div style="font-size:1.1rem;font-weight:700;color:#f43f5e;margin-bottom:8px;">Aucun film adulte disponible</div>
          <button type="button" id="vel-adult-back-hub-empty" class="vel-adult-back-btn" style="margin-top:16px;">← Retour aux choix</button>
        </div>
      `;
      const btn = document.getElementById("vel-adult-back-hub-empty");
      if (btn) btn.onclick = () => renderAdultPortal();
      return false;
    }

    window._veloraAdultVodMovies = uniqueMovies;
    window._veloraAdultVodCurrentIndex = 0;

    renderAdultMoviesListView(uniqueMovies, container);
    await playAdultMovieByIndex(0);
    window.scrollTo(0, 0);
    return true;
  }

  async function renderAdultPortal() {
    setAdultPlayerHeaderVisible(true);

    const portal = document.getElementById("adult-view");
    const container = document.getElementById("vel-adult-packages-container");
    if (!portal || !container) return;

    portal.classList.remove("hidden");
    portal.setAttribute("aria-hidden", "false");
    portal.style.removeProperty("display");

    container.replaceChildren();
    container.innerHTML = `
      <div class="vel-adult-portal-hub" style="display:flex;flex-wrap:wrap;gap:24px;justify-content:center;align-items:center;padding:40px 20px;max-width:860px;margin:0 auto;">
        
        <div id="vel-adult-hub-live" class="vel-adult-hub-card" style="flex:1 1 320px;max-width:380px;background:linear-gradient(145deg,rgba(16,185,129,0.12),rgba(15,23,42,0.6));border:1px solid rgba(16,185,129,0.3);border-radius:20px;padding:32px 24px;text-align:center;cursor:pointer;transition:all 0.25s cubic-bezier(0.16,1,0.3,1);box-shadow:0 12px 36px rgba(0,0,0,0.4);">
          <div style="width:72px;height:72px;border-radius:20px;background:rgba(16,185,129,0.2);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;border:1px solid rgba(16,185,129,0.4);color:#10b981;">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>
          </div>
          <h2 style="font-size:1.35rem;font-weight:800;color:#fff;margin:0 0 8px;">TV en Direct</h2>
          <p style="font-size:0.9rem;color:#94a3b8;margin:0 0 24px;line-height:1.5;">Accéder aux chaînes de télévision adultes en direct.</p>
          <button type="button" style="width:100%;padding:14px 20px;border-radius:12px;border:none;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:800;font-size:0.95rem;cursor:pointer;">
            ▶ Lancer la TV en Direct
          </button>
        </div>

        <div id="vel-adult-hub-vod" class="vel-adult-hub-card" style="flex:1 1 320px;max-width:380px;background:linear-gradient(145deg,rgba(225,29,72,0.14),rgba(15,23,42,0.6));border:1px solid rgba(225,29,72,0.35);border-radius:20px;padding:32px 24px;text-align:center;cursor:pointer;transition:all 0.25s cubic-bezier(0.16,1,0.3,1);box-shadow:0 12px 36px rgba(0,0,0,0.4);">
          <div style="width:72px;height:72px;border-radius:20px;background:rgba(225,29,72,0.2);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;border:1px solid rgba(244,63,94,0.4);color:#f43f5e;">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </div>
          <h2 style="font-size:1.35rem;font-weight:800;color:#fff;margin:0 0 8px;">Films & VOD</h2>
          <p style="font-size:0.9rem;color:#94a3b8;margin:0 0 24px;line-height:1.5;">Accéder au lecteur et au catalogue des films adultes.</p>
          <button type="button" style="width:100%;padding:14px 20px;border-radius:12px;border:none;background:linear-gradient(135deg,#e11d48,#be123c);color:#fff;font-weight:800;font-size:0.95rem;cursor:pointer;">
            ▶ Lancer les Films (VOD)
          </button>
        </div>

      </div>
    `;

    const liveCard = document.getElementById("vel-adult-hub-live");
    if (liveCard) {
      liveCard.onmouseenter = () => { liveCard.style.transform = "translateY(-4px)"; liveCard.style.borderColor = "#10b981"; };
      liveCard.onmouseleave = () => { liveCard.style.transform = "none"; liveCard.style.borderColor = "rgba(16,185,129,0.3)"; };
      liveCard.onclick = () => openAdultLivePlayerDirectly();
    }

    const vodCard = document.getElementById("vel-adult-hub-vod");
    if (vodCard) {
      vodCard.onmouseenter = () => { vodCard.style.transform = "translateY(-4px)"; vodCard.style.borderColor = "#f43f5e"; };
      vodCard.onmouseleave = () => { vodCard.style.transform = "none"; vodCard.style.borderColor = "rgba(225,29,72,0.35)"; };
      vodCard.onclick = () => openAdultMoviesPlayerDirectly();
    }
  }

  // Open an adult VOD package
  function openAdultPackage(pkg) {
    if (typeof window.veloraOpenSearchResult === "function") {
      const kind = pkg.kind === "series" ? "series-package" : "movies-package";
      window.veloraOpenSearchResult(`adult:${kind}:${pkg.package_id || pkg.id}`);
      return;
    }
    const packagesView = document.getElementById("packages-view");
    if (packagesView) {
      const card = packagesView.querySelector(`[data-package-id="${pkg.package_id || pkg.id}"]`);
      if (card) {
        card.click();
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Per-User High-Security 4-Digit Parental PIN Gate (Stored on VPS)
  // ---------------------------------------------------------------------------
  const ADULT_SESSION_KEY = "velora_adult_session_unlocked_v1";

  function getVeloraUserId() {
    try {
      const token = localStorage.getItem("authToken");
      if (token) {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
          if (payload && (payload.id || payload.username)) {
            return `user_${payload.id || payload.username}`;
          }
        }
      }
    } catch (_) {}

    try {
      const u = localStorage.getItem("velora_username") || localStorage.getItem("currentUser");
      if (u) {
        return `user_${String(u).trim().toLowerCase()}`;
      }
    } catch (_) {}

    let deviceId = localStorage.getItem("velora_user_client_id");
    if (!deviceId) {
      deviceId = "client_" + (window.crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15) + Date.now().toString(36));
      try {
        localStorage.setItem("velora_user_client_id", deviceId);
      } catch (_) {}
    }
    return deviceId;
  }

  function getUserPinStorageKey() {
    const uid = getVeloraUserId();
    return `velora_adult_pin_record_${uid}`;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  }

  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  async function hashPin(pin, saltHex) {
    const enc = new TextEncoder();
    const salt = saltHex ? hexToBytes(saltHex) : (window.crypto ? crypto.getRandomValues(new Uint8Array(16)) : new Uint8Array(16));
    const pinBytes = enc.encode(String(pin));
    const combined = new Uint8Array(salt.length + pinBytes.length);
    combined.set(salt, 0);
    combined.set(pinBytes, salt.length);
    if (window.crypto && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest("SHA-256", combined);
      return {
        salt: bytesToHex(salt),
        hash: bytesToHex(new Uint8Array(hashBuffer))
      };
    }
    let simpleHash = 0;
    for (let i = 0; i < combined.length; i++) {
      simpleHash = ((simpleHash << 5) - simpleHash) + combined[i];
      simpleHash |= 0;
    }
    return {
      salt: bytesToHex(salt),
      hash: "s_" + Math.abs(simpleHash).toString(16)
    };
  }

  let cachedPinRecord = null;

  async function fetchServerPinRecord() {
    const userId = getVeloraUserId();
    const localKey = getUserPinStorageKey();
    try {
      const res = await fetch(`${REST_BASE}/admin_settings?key=eq.adult_pin_${encodeURIComponent(userId)}`, {
        headers: { "Content-Type": "application/json" }
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows[0] && rows[0].value) {
          const parsed = JSON.parse(rows[0].value);
          if (parsed && (parsed.hash || parsed.disabled)) {
            cachedPinRecord = parsed;
            try { localStorage.setItem(localKey, JSON.stringify(parsed)); } catch (_) {}
            return parsed;
          }
        }
      }
    } catch (_) {}
    return null;
  }

  function getStoredPinRecord() {
    if (cachedPinRecord) return cachedPinRecord;
    const localKey = getUserPinStorageKey();
    try {
      const data = localStorage.getItem(localKey);
      if (!data) return null;
      const parsed = JSON.parse(data);
      if (parsed && (parsed.hash || parsed.disabled)) {
        cachedPinRecord = parsed;
        return parsed;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  async function savePinRecord(record) {
    cachedPinRecord = record;
    const userId = getVeloraUserId();
    const localKey = getUserPinStorageKey();
    try {
      localStorage.setItem(localKey, JSON.stringify(record));
    } catch (_) {}

    try {
      await fetch(`${REST_BASE}/admin_settings?key=eq.adult_pin_${encodeURIComponent(userId)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify({
          key: `adult_pin_${userId}`,
          value: JSON.stringify({
            ...record,
            user_id: userId,
            updated_at: new Date().toISOString()
          })
        })
      });
    } catch (e) {
      console.warn("[Velora Adult] Error persisting user adult PIN to VPS:", e.message);
    }
  }

  function isAdultSessionUnlocked() {
    try {
      return sessionStorage.getItem(ADULT_SESSION_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function setAdultSessionUnlocked(unlocked) {
    try {
      if (unlocked) {
        sessionStorage.setItem(ADULT_SESSION_KEY, "1");
      } else {
        sessionStorage.removeItem(ADULT_SESSION_KEY);
      }
    } catch (_) {}
  }

  let pinModalEl = null;
  let pinKeydownHandler = null;
  let failedAttempts = 0;
  let lockoutUntil = 0;

  function ensurePinModal() {
    if (pinModalEl && document.body.contains(pinModalEl)) return pinModalEl;
    pinModalEl = document.createElement("div");
    pinModalEl.id = "vel-adult-pin-modal";
    pinModalEl.className = "vel-adult-pin-modal";
    pinModalEl.setAttribute("aria-modal", "true");
    pinModalEl.setAttribute("role", "dialog");

    pinModalEl.innerHTML = `
      <div class="vel-adult-pin-card" id="vel-adult-pin-card">
        <button type="button" class="vel-adult-pin-close-btn" id="vel-adult-pin-close" aria-label="Fermer" title="Fermer">✕</button>
        <div class="vel-adult-pin-icon-wrap" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 2C9.24 2 7 4.24 7 7v3H6c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2h-1V7c0-2.76-2.24-5-5-5Zm0 2c1.66 0 3 1.34 3 3v3H9V7c0-1.66 1.34-3 3-3Zm0 10c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2Z"/></svg>
        </div>
        <h2 class="vel-adult-pin-title" id="vel-adult-pin-title">Zone Restreinte (+18)</h2>
        <p class="vel-adult-pin-subtitle" id="vel-adult-pin-subtitle">Définissez un code PIN à 4 chiffres pour restreindre l'accès aux enfants.</p>
        
        <div class="vel-adult-pin-dots" id="vel-adult-pin-dots" aria-hidden="true">
          <div class="vel-adult-pin-dot"></div>
          <div class="vel-adult-pin-dot"></div>
          <div class="vel-adult-pin-dot"></div>
          <div class="vel-adult-pin-dot"></div>
        </div>

        <div class="vel-adult-pin-error" id="vel-adult-pin-error" role="alert"></div>

        <div class="vel-adult-pin-keypad" id="vel-adult-pin-keypad">
          <button type="button" class="vel-adult-pin-key" data-digit="1">1</button>
          <button type="button" class="vel-adult-pin-key" data-digit="2">2</button>
          <button type="button" class="vel-adult-pin-key" data-digit="3">3</button>
          <button type="button" class="vel-adult-pin-key" data-digit="4">4</button>
          <button type="button" class="vel-adult-pin-key" data-digit="5">5</button>
          <button type="button" class="vel-adult-pin-key" data-digit="6">6</button>
          <button type="button" class="vel-adult-pin-key" data-digit="7">7</button>
          <button type="button" class="vel-adult-pin-key" data-digit="8">8</button>
          <button type="button" class="vel-adult-pin-key" data-digit="9">9</button>
          <button type="button" class="vel-adult-pin-key vel-adult-pin-key--action" id="vel-adult-pin-cancel">Annuler</button>
          <button type="button" class="vel-adult-pin-key" data-digit="0">0</button>
          <button type="button" class="vel-adult-pin-key vel-adult-pin-key--action" id="vel-adult-pin-backspace" aria-label="Effacer">
            <svg viewBox="0 0 24 24"><path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/></svg>
          </button>
        </div>

        <button type="button" id="vel-adult-pin-skip-btn" class="vel-adult-pin-skip-btn" style="display: none;">
          🔓 Accéder sans code de sécurité
        </button>
      </div>
    `;

    document.body.appendChild(pinModalEl);
    return pinModalEl;
  }

  function promptAdultPinGate(onSuccess, options = {}) {
    const storedRecord = getStoredPinRecord();

    // If user previously chose to leave adult section without a security code
    if (storedRecord && storedRecord.disabled === true && !options.forceSetup) {
      if (typeof onSuccess === "function") onSuccess();
      return;
    }

    const modal = ensurePinModal();
    const card = document.getElementById("vel-adult-pin-card");
    const titleEl = document.getElementById("vel-adult-pin-title");
    const subtitleEl = document.getElementById("vel-adult-pin-subtitle");
    const dotsWrap = document.getElementById("vel-adult-pin-dots");
    const errorEl = document.getElementById("vel-adult-pin-error");
    const skipBtn = document.getElementById("vel-adult-pin-skip-btn");
    const dots = dotsWrap ? dotsWrap.querySelectorAll(".vel-adult-pin-dot") : [];

    let currentPin = "";
    let firstPin = ""; // For setup step 1
    let mode = (storedRecord && storedRecord.hash && !options.forceSetup) ? "UNLOCK" : "CREATE_1";

    function updateView() {
      if (mode === "CREATE_1") {
        titleEl.textContent = "🔐 Code Parental (+18)";
        subtitleEl.textContent = "Définissez un code PIN à 4 chiffres pour restreindre l'accès aux enfants, ou accédez sans code.";
        if (skipBtn) {
          skipBtn.textContent = "🔓 Accéder sans code de sécurité";
          skipBtn.style.display = "inline-flex";
        }
      } else if (mode === "CREATE_2") {
        titleEl.textContent = "🔐 Confirmez le code PIN";
        subtitleEl.textContent = "Ressaisissez votre code PIN à 4 chiffres pour confirmer.";
        if (skipBtn) skipBtn.style.display = "none";
      } else {
        titleEl.textContent = "🔒 Confirmation de Sécurité";
        subtitleEl.textContent = "Entrez votre code PIN à 4 chiffres pour confirmer votre identité.";
        if (skipBtn) {
          skipBtn.style.display = "none";
        }
      }

      dots.forEach((dot, index) => {
        dot.classList.toggle("is-filled", index < currentPin.length);
      });
    }

    function showError(msg) {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.classList.add("is-visible");
      if (card) {
        card.classList.remove("is-shaking");
        void card.offsetWidth;
        card.classList.add("is-shaking");
        setTimeout(() => card.classList.remove("is-shaking"), 450);
      }
    }

    function clearError() {
      if (!errorEl) return;
      errorEl.textContent = "";
      errorEl.classList.remove("is-visible");
    }

    function closeModal(isCancel = false) {
      modal.classList.remove("is-open");
      currentPin = "";
      firstPin = "";
      if (pinKeydownHandler) {
        document.removeEventListener("keydown", pinKeydownHandler, true);
        pinKeydownHandler = null;
      }
      if (isCancel && typeof options.onCancel === "function") {
        options.onCancel();
      }
    }

    async function handlePinComplete() {
      if (currentPin.length !== 4) return;

      if (Date.now() < lockoutUntil) {
        showError("⚠️ Veuillez patienter avant de réessayer.");
        currentPin = "";
        updateView();
        return;
      }

      if (mode === "CREATE_1") {
        firstPin = currentPin;
        currentPin = "";
        mode = "CREATE_2";
        clearError();
        updateView();
        return;
      }

      if (mode === "CREATE_2") {
        if (currentPin === firstPin) {
          const newRecord = await hashPin(currentPin);
          newRecord.disabled = false;
          newRecord.createdAt = new Date().toISOString();
          await savePinRecord(newRecord);
          setAdultSessionUnlocked(true);
          failedAttempts = 0;
          clearError();
          if (titleEl) titleEl.textContent = "✓ Code PIN enregistré !";
          if (subtitleEl) subtitleEl.textContent = "Votre code à 4 chiffres est sauvegardé.";
          setTimeout(() => {
            closeModal(false);
            if (typeof onSuccess === "function") onSuccess();
          }, 350);
        } else {
          showError("❌ Les codes PIN ne correspondent pas. Recommencez.");
          firstPin = "";
          currentPin = "";
          mode = "CREATE_1";
          setTimeout(updateView, 400);
        }
        return;
      }

      if (mode === "UNLOCK") {
        const isValid = await (async () => {
          if (!storedRecord || !storedRecord.hash) return true;
          const computed = await hashPin(currentPin, storedRecord.salt);
          return computed.hash === storedRecord.hash;
        })();

        if (isValid) {
          setAdultSessionUnlocked(true);
          failedAttempts = 0;
          clearError();
          if (titleEl) titleEl.textContent = "✓ Accès Confirmé";
          setTimeout(() => {
            closeModal(false);
            if (typeof onSuccess === "function") onSuccess();
          }, 250);
        } else {
          failedAttempts++;
          currentPin = "";
          updateView();
          if (failedAttempts >= 5) {
            lockoutUntil = Date.now() + 30000;
            showError("❌ Trop d'essais erronés. Verrouillé 30 secondes.");
          } else {
            showError(`❌ Code incorrect (${5 - failedAttempts} essai(s) restant(s))`);
          }
        }
      }
    }

    function addDigit(digit) {
      if (Date.now() < lockoutUntil) {
        showError("⚠️ Trop de tentatives. Veuillez patienter.");
        return;
      }
      if (currentPin.length >= 4) return;
      clearError();
      currentPin += String(digit);
      updateView();
      if (currentPin.length === 4) {
        setTimeout(handlePinComplete, 60);
      }
    }

    function removeDigit() {
      if (currentPin.length > 0) {
        currentPin = currentPin.slice(0, -1);
        clearError();
        updateView();
      }
    }

    modal.onclick = async (e) => {
      if (e.target === modal || e.target.closest("#vel-adult-pin-close") || e.target.closest("#vel-adult-pin-cancel")) {
        closeModal(true);
        return;
      }
      if (e.target.closest("#vel-adult-pin-skip-btn")) {
        await savePinRecord({ disabled: true, createdAt: new Date().toISOString() });
        setAdultSessionUnlocked(true);
        closeModal(false);
        if (typeof onSuccess === "function") onSuccess();
        return;
      }
      const keyBtn = e.target.closest(".vel-adult-pin-key");
      if (!keyBtn) return;
      const digit = keyBtn.dataset.digit;
      if (digit != null) {
        addDigit(digit);
      } else if (keyBtn.id === "vel-adult-pin-backspace" || keyBtn.closest("#vel-adult-pin-backspace")) {
        removeDigit();
      }
    };

    if (pinKeydownHandler) {
      document.removeEventListener("keydown", pinKeydownHandler, true);
    }
    pinKeydownHandler = (e) => {
      if (!modal.classList.contains("is-open")) return;
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        e.stopPropagation();
        addDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        removeDigit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeModal(true);
      }
    };
    document.addEventListener("keydown", pinKeydownHandler, true);

    clearError();
    currentPin = "";
    firstPin = "";
    updateView();
    modal.classList.add("is-open");
  }

  // Open the Adult Portal page with High Security PIN Gate
  async function openAdultPortal() {
    const wasHome = document.body.classList.contains("vel-home-empty-active") || document.body.dataset.velActiveTab === "home";
    promptAdultPinGate(
      () => {
        showAdultView();
      },
      {
        onCancel: () => {
          if (wasHome) {
            const homePage = document.getElementById("vel-home-empty-page");
            if (homePage) {
              homePage.classList.remove("hidden");
              homePage.setAttribute("aria-hidden", "false");
            }
            document.body.classList.add("vel-home-empty-active");
            if (typeof window.veloraSetBottomNavActive === "function") {
              window.veloraSetBottomNavActive("home");
            }
          }
        }
      }
    );
  }

  function closeActivePlayers() {
    if (typeof window.veloraStopAllPlayback === "function") {
      try { window.veloraStopAllPlayback(); } catch (_) {}
    }

    document.querySelectorAll("video, audio").forEach(function (v) {
      try {
        v.pause();
        v.muted = true;
        v.currentTime = 0;
        if (v.hls && typeof v.hls.destroy === "function") {
          try { v.hls.destroy(); } catch (_) {}
          v.hls = null;
        }
        v.removeAttribute("src");
        v.load();
      } catch (_) {}
    });

    if (window.hls && typeof window.hls.destroy === "function") {
      try { window.hls.destroy(); } catch (_) {}
      window.hls = null;
    }

    try {
      if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
        document.exitFullscreen().catch(function () {});
      }
    } catch (_) {}

    [
      "player-container",
      "vod-player-container",
      "now-playing",
      "now-playing-vod",
      "content-view",
      "packages-view"
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.classList.add("hidden");
        el.setAttribute("aria-hidden", "true");
      }
    });
  }

  function showAdultView() {
    window._veloraNavLock = true;
    setTimeout(function () { window._veloraNavLock = false; }, 600);

    closeActivePlayers();

    isAdultOpen = true;
    currentAdultView = null; // Unselected by default
    document.body.classList.add("vel-adult-active");
    document.body.dataset.velActiveTab = "adult";
    document.body.dataset.velTopLevel = "adult";
    document.body.classList.remove("vel-home-empty-active", "vel-home-choice-picked");

    // Clear active highlight from Accueil and other bottom tabs
    if (typeof window.veloraSetBottomNavActive === "function") {
      window.veloraSetBottomNavActive("adult");
    }

    const homePage = document.getElementById("vel-home-empty-page");
    const primeContainer = document.getElementById("vel-prime-carousels-container");
    const stickyTop = document.querySelector(".vel-sticky-top");

    if (homePage) homePage.classList.add("hidden");
    if (primeContainer) primeContainer.style.setProperty("display", "none", "important");

    const adultView = document.getElementById("adult-view");
    if (adultView) {
      adultView.classList.remove("hidden");
      adultView.setAttribute("aria-hidden", "false");
      adultView.style.removeProperty("display");
    }

    window.scrollTo(0, 0);
    renderAdultPortal();
  }

  function closeAdultView() {
    isAdultOpen = false;
    currentAdultView = null;
    if (window._veloraAdultVodScrollHandler) {
      window.removeEventListener("scroll", window._veloraAdultVodScrollHandler);
    }
    if (window._veloraAdultLiveScrollHandler) {
      window.removeEventListener("scroll", window._veloraAdultLiveScrollHandler);
    }
    const adultVideo = document.getElementById("vel-adult-video");
    if (adultVideo) {
      try {
        adultVideo.pause();
        if (adultVideo.hls && typeof adultVideo.hls.destroy === "function") {
          adultVideo.hls.destroy();
          adultVideo.hls = null;
        }
        adultVideo.removeAttribute("src");
        adultVideo.load();
      } catch (_) {}
    }
    setAdultPlayerHeaderVisible(true);
    document.body.classList.remove("vel-adult-active", "vel-adult-player-active");
    delete document.body.dataset.veloraReturnAdult;

    const adultView = document.getElementById("adult-view");
    if (adultView) {
      adultView.classList.add("hidden");
      adultView.setAttribute("aria-hidden", "true");
    }

    const primeContainer = document.getElementById("vel-prime-carousels-container");
    if (primeContainer) {
      primeContainer.style.removeProperty("display");
    }

    [
      "player-container",
      "vod-player-container",
      "now-playing",
      "now-playing-vod",
      "content-view",
      "packages-view"
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.removeProperty("display");
    });
    const stickyTop = document.querySelector(".vel-sticky-top");
    if (stickyTop) stickyTop.style.removeProperty("display");
    const header = document.querySelector(".vel-header");
    if (header) header.style.removeProperty("display");

    document.dispatchEvent(new CustomEvent("velora-show-home"));
  }

  window.veloraCloseAdultView = closeAdultView;

  // ---------------------------------------------------------------------------
  // Global Lifecycle & Triggers
  // ---------------------------------------------------------------------------
  document.addEventListener("click", (e) => {
    // Back button in adult portal
    if (e.target && e.target.closest("#btn-adult-back-home")) {
      e.preventDefault();
      closeAdultView();
      return;
    }

    if (e.target && e.target.closest("#vel-adult-btn-live")) {
      e.preventDefault();
      openAdultLivePlayerDirectly();
      return;
    }

    if (e.target && e.target.closest("#vel-adult-btn-vod")) {
      e.preventDefault();
      openAdultMoviesPlayerDirectly();
      return;
    }

    if (e.target && e.target.closest("#vel-adult-pin-settings-btn")) {
      e.preventDefault();
      promptAdultPinGate(() => {
        showAdultView();
      }, { forceSetup: true });
      return;
    }

    // Returning to adult portal when closing player if opened from adult
    if (e.target && e.target.closest("#btn-close-player, #btn-close-vod-player")) {
      if (document.body.dataset.veloraReturnAdult === "true") {
        setTimeout(() => {
          showAdultView();
        }, 80);
      }
    }

    // Adult portal buttons (from Home or Profile menu)
    if (e.target && e.target.closest("#btn-adult-portal, #home-adult-btn")) {
      e.preventDefault();
      e.stopPropagation();
      openAdultPortal();
      return;
    }

    // Admin Adult Tab button
    if (e.target && e.target.closest("#settings-tab-btn-adult, [data-settings-tab='adult']")) {
      const tabBtn = e.target.closest("#settings-tab-btn-adult, [data-settings-tab='adult']");
      document.querySelectorAll(".settings-tabs__tab").forEach(b => {
        b.classList.remove("settings-tabs__tab--active");
        b.setAttribute("aria-selected", "false");
      });
      tabBtn.classList.add("settings-tabs__tab--active");
      tabBtn.setAttribute("aria-selected", "true");

      document.querySelectorAll(".settings-tab-panel").forEach(p => {
        p.classList.add("hidden");
        p.hidden = true;
      });

      const panel = document.getElementById("settings-tab-adult");
      if (panel) {
        panel.classList.remove("hidden");
        panel.hidden = false;
        initAdminAdultPanel();
      }
    }
  });

  document.addEventListener("velora-adult-packages-changed", () => {
    adultLiveChannelCache.clear();
    if (isAdultOpen) {
      renderAdultPortal();
    }
  });

  fetchAssignedAdultPackages();
  fetchServerPinRecord();

  document.addEventListener("velora-show-home", () => {
    isAdultOpen = false;
    currentAdultView = null;
    delete document.body.dataset.veloraReturnAdult;
  });

  document.addEventListener("velora-tab-changed", (e) => {
    if (e.detail?.tab !== "adult") {
      isAdultOpen = false;
      currentAdultView = null;
      delete document.body.dataset.veloraReturnAdult;
    }
  });

  document.addEventListener("velora-return-favorites", () => {
    isAdultOpen = false;
    currentAdultView = null;
    delete document.body.dataset.veloraReturnAdult;
  });

  window.veloraOpenAdultPortal = openAdultPortal;
  window.veloraCloseAdultPortal = closeAdultView;
})();
