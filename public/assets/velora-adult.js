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
          if (location.protocol === "https:" && directUrl.startsWith("http://")) {
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
    return liveChannelImageObserver;
  }

  function renderAdultLiveChannelsListView(channels) {
    const contentView = document.getElementById("content-view");
    const dynamicList = document.getElementById("dynamic-list");
    const adultView = document.getElementById("adult-view");
    const packagesView = document.getElementById("packages-view");

    if (adultView) adultView.classList.add("hidden");
    if (packagesView) packagesView.classList.add("hidden");

    if (!contentView || !dynamicList) return;

    contentView.classList.remove("hidden");
    contentView.removeAttribute("aria-hidden");
    dynamicList.replaceChildren();

    const wrap = document.createElement("div");
    wrap.className = "vel-adult-channel-list-wrap";

    const itemsContainer = document.createElement("div");
    itemsContainer.className = "vel-adult-channel-list-items";

    const BATCH_SIZE = 30;
    let currentRenderedCount = 0;
    let currentFiltered = [];

    function appendNextChannelChunk() {
      const nextChunk = currentFiltered.slice(currentRenderedCount, currentRenderedCount + BATCH_SIZE);
      if (!nextChunk.length) return;

      nextChunk.forEach((channel) => {
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

        const heartBtn = typeof window.veloraCreateFavoriteHeart === "function"
          ? window.veloraCreateFavoriteHeart({
              sourceId: String(channel.source_id),
              itemId: String(channel.stream_id),
              itemType: "channel",
              name: String(channel.name),
              thumbUrl: String(channel.thumb_url || channel.stream_icon || ""),
              packageId: String(channel.package_id || "")
            })
          : null;

        if (heartBtn) {
          row.appendChild(heartBtn);
        }

        row.onclick = (e) => {
          if (e.target.closest(".vel-favorite-heart, .vel-favorite-detail-button")) return;
          playAdultChannelByIndex(originalIdx);
        };

        itemsContainer.appendChild(row);
      });

      currentRenderedCount += nextChunk.length;
    }

    function renderChannels(filterQuery = "") {
      itemsContainer.replaceChildren();
      currentRenderedCount = 0;
      const q = filterQuery.trim().toLowerCase();
      currentFiltered = q
        ? channels.map((ch, originalIdx) => ({ ...ch, originalIdx })).filter(ch => String(ch.name || "").toLowerCase().includes(q))
        : channels.map((ch, originalIdx) => ({ ...ch, originalIdx }));

      if (!currentFiltered.length) {
        const empty = document.createElement("div");
        empty.className = "vel-adult-empty";
        empty.style.padding = "30px 16px";
        empty.textContent = "Aucune chaîne ne correspond à votre recherche.";
        itemsContainer.appendChild(empty);
        return;
      }

      appendNextChannelChunk();
    }

    const liveSearchInput = document.getElementById("vel-live-channel-search-input");
    if (liveSearchInput) {
      liveSearchInput.oninput = (e) => {
        renderChannels(e.target.value);
      };
      const clearBtn = document.getElementById("vel-live-channel-search-clear");
      if (clearBtn) {
        clearBtn.onclick = () => {
          liveSearchInput.value = "";
          renderChannels("");
          clearBtn.classList.add("hidden");
          liveSearchInput.focus();
        };
      }
    }

    const handleScroll = () => {
      if (dynamicList.scrollTop + dynamicList.clientHeight >= dynamicList.scrollHeight - 350) {
        if (currentRenderedCount < currentFiltered.length) {
          appendNextChannelChunk();
        }
      }
    };
    dynamicList.onscroll = handleScroll;

    renderChannels(liveSearchInput ? liveSearchInput.value : "");
    wrap.appendChild(itemsContainer);
    dynamicList.appendChild(wrap);
  }

  async function playAdultChannelByIndex(index) {
    const list = window._veloraAdultLiveChannels;
    if (!list || index < 0 || index >= list.length) return;

    window._veloraAdultLiveCurrentIndex = index;
    const channel = list[index];

    delete document.body.dataset.veloraReturnHome;
    delete document.body.dataset.veloraReturnFavorites;
    document.body.dataset.veloraReturnAdult = "true";

    const adultView = document.getElementById("adult-view");
    if (adultView) adultView.classList.add("hidden");

    if (typeof window.veloraOpenFavoriteItem === "function") {
      const item = {
        source_id: String(channel.source_id),
        item_id: String(channel.stream_id || channel.item_id),
        item_type: "channel",
        name: channel.name,
        thumb_url: channel.thumb_url || channel.stream_icon || "",
        package_id: String(channel.package_id || "")
      };
      await window.veloraOpenFavoriteItem(item, list);
      const contextTitle = document.getElementById("vel-header-context-title-text");
      if (contextTitle) contextTitle.textContent = "ADULTE +18";
      return;
    }
  }

  window.veloraPlayAdultChannelByIndex = playAdultChannelByIndex;

  async function openAdultLivePlayerDirectly() {
    await fetchAssignedAdultPackages();
    const livePackages = Array.from(assignedAdultPackages.values()).filter(p => p.kind === "live");
    if (!livePackages.length) {
      alert("Aucun bouquet TV adulte n'a été configuré par l'administrateur.");
      return;
    }

    const channelGroups = await Promise.all(livePackages.map(p => fetchLiveChannelsForPackage(p)));
    const allChannels = channelGroups.flat();

    if (!allChannels.length) {
      alert("Aucune chaîne TV trouvée dans les bouquets adultes sélectionnés.");
      return;
    }

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

    window._veloraAdultLiveChannels = uniqueChannels;
    window._veloraAdultLiveCurrentIndex = 0;

    await playAdultChannelByIndex(0);
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

  function renderAdultMoviesListView(movies) {
    const contentView = document.getElementById("content-view");
    const dynamicList = document.getElementById("dynamic-list");
    const adultView = document.getElementById("adult-view");
    const packagesView = document.getElementById("packages-view");

    if (adultView) adultView.classList.add("hidden");
    if (packagesView) packagesView.classList.add("hidden");

    if (!contentView || !dynamicList) return;

    contentView.classList.remove("hidden");
    contentView.removeAttribute("aria-hidden");
    contentView.classList.remove("content-view--vod-film-detail");
    dynamicList.replaceChildren();

    const wrap = document.createElement("div");
    wrap.className = "vel-adult-movie-list-wrap";

    const header = document.createElement("div");
    header.className = "vel-adult-movie-list-header";

    const headerLeft = document.createElement("div");
    headerLeft.className = "vel-adult-movie-list-header__left";

    const title = document.createElement("div");
    title.className = "vel-adult-movie-list-title";
    title.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      <span>Films Adultes</span>
    `;

    const count = document.createElement("span");
    count.className = "vel-adult-movie-list-count";
    count.textContent = `${movies.length} film${movies.length > 1 ? "s" : ""}`;

    headerLeft.append(title, count);

    const searchWrap = document.createElement("div");
    searchWrap.className = "vel-adult-movie-search-wrap";
    searchWrap.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <input type="text" class="vel-adult-movie-search-input" placeholder="Filtrer les films..." autocomplete="off" />
    `;

    header.append(headerLeft, searchWrap);
    wrap.appendChild(header);

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
        }, { rootMargin: "250px 0px" });
      }
      return movieImageObserver;
    }

    const BATCH_SIZE = 30;
    let currentRenderedCount = 0;
    let currentFiltered = [];

    function appendNextChunk() {
      const nextChunk = currentFiltered.slice(currentRenderedCount, currentRenderedCount + BATCH_SIZE);
      if (!nextChunk.length) return;

      const observer = getImageObserver();

      nextChunk.forEach((movie, chunkIdx) => {
        const originalIdx = movie.originalIdx;
        const globalIdx = currentRenderedCount + chunkIdx;

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

          if (globalIdx < 8) {
            // Load the first 8 visible posters immediately
            img.src = movie.stream_icon;
          } else {
            // Lazy load remaining posters as they scroll into view
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

        const heartBtn = typeof window.veloraCreateFavoriteHeart === "function"
          ? window.veloraCreateFavoriteHeart({
              sourceId: String(movie.source_id),
              itemId: String(movie.stream_id),
              itemType: "movie",
              name: String(movie.name),
              thumbUrl: String(movie.stream_icon || ""),
              packageId: String(movie.package_id || ""),
              containerExtension: String(movie.container_extension || "mp4")
            })
          : null;

        if (heartBtn) {
          row.appendChild(heartBtn);
        }

        row.onclick = (e) => {
          if (e.target.closest(".vel-favorite-heart, .vel-favorite-detail-button")) return;
          playAdultMovieByIndex(originalIdx);
        };

        itemsContainer.appendChild(row);
      });

      currentRenderedCount += nextChunk.length;
    }

    function renderItems(filterQuery = "") {
      itemsContainer.replaceChildren();
      currentRenderedCount = 0;
      const q = filterQuery.trim().toLowerCase();
      currentFiltered = q
        ? movies.map((m, originalIdx) => ({ ...m, originalIdx })).filter(m => String(m.name || "").toLowerCase().includes(q))
        : movies.map((m, originalIdx) => ({ ...m, originalIdx }));

      if (q) {
        count.textContent = `${currentFiltered.length} / ${movies.length} film${movies.length > 1 ? "s" : ""}`;
      } else {
        count.textContent = `${movies.length} film${movies.length > 1 ? "s" : ""}`;
      }

      if (!currentFiltered.length) {
        const empty = document.createElement("div");
        empty.className = "vel-adult-empty";
        empty.style.padding = "30px 16px";
        empty.textContent = "Aucun film ne correspond à votre recherche.";
        itemsContainer.appendChild(empty);
        return;
      }

      appendNextChunk();
    }

    const searchInput = searchWrap.querySelector(".vel-adult-movie-search-input");
    if (searchInput) {
      searchInput.oninput = (e) => {
        renderItems(e.target.value);
      };
    }

    const handleScroll = () => {
      if (dynamicList.scrollTop + dynamicList.clientHeight >= dynamicList.scrollHeight - 350) {
        if (currentRenderedCount < currentFiltered.length) {
          appendNextChunk();
        }
      }
    };
    dynamicList.onscroll = handleScroll;

    renderItems("");
    wrap.appendChild(itemsContainer);
    dynamicList.appendChild(wrap);
  }

  async function playAdultMovieByIndex(index) {
    const list = window._veloraAdultVodMovies;
    if (!list || index < 0 || index >= list.length) return;

    window._veloraAdultVodCurrentIndex = index;
    const movie = list[index];

    delete document.body.dataset.veloraReturnHome;
    delete document.body.dataset.veloraReturnFavorites;
    document.body.dataset.veloraReturnAdult = "true";

    const adultView = document.getElementById("adult-view");
    if (adultView) adultView.classList.add("hidden");

    const pkgId = String(movie.package_id || movie.category_id || "adult-movies");
    if (typeof window.veloraOpenCachedHomeItem === "function") {
      window.veloraOpenCachedHomeItem({
        id: "adult-movies",
        content_type: "movies",
        package_id: pkgId
      }, {
        id: `adult:${movie.source_id}:${movie.stream_id}`,
        name: movie.name,
        thumbUrl: movie.stream_icon || movie.thumb_url || "",
        streamId: movie.stream_id,
        sourceId: movie.source_id,
        containerExtension: movie.container_extension || "mp4",
        packageId: pkgId
      });
      const contextTitle = document.getElementById("vel-header-context-title-text");
      if (contextTitle) contextTitle.textContent = "ADULTE +18";
      return;
    }
  }

  window.veloraPlayAdultMovieByIndex = playAdultMovieByIndex;

  async function openAdultMoviesPlayerDirectly() {
    await fetchAssignedAdultPackages();
    const vodPackages = Array.from(assignedAdultPackages.values()).filter(p => p.kind === "movies" || p.kind === "vod");
    if (!vodPackages.length) {
      alert("Aucun bouquet de films adultes n'a été configuré par l'administrateur.");
      return;
    }

    const movieGroups = await Promise.all(vodPackages.map(p => fetchVodMoviesForPackage(p)));
    const allMovies = movieGroups.flat();

    if (!allMovies.length) {
      alert("Aucun film trouvé dans les bouquets adultes sélectionnés.");
      return;
    }

    const seen = new Set();
    const uniqueMovies = [];
    allMovies.forEach(m => {
      const key = `${m.source_id}:${m.stream_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueMovies.push(m);
      }
    });

    window._veloraAdultVodMovies = uniqueMovies;
    window._veloraAdultVodCurrentIndex = 0;

    delete document.body.dataset.veloraReturnFavorites;
    delete window._veloraFavoriteReturnTab;
    delete document.body.dataset.veloraReturnHome;
    document.body.dataset.veloraReturnAdult = "true";
    document.body.classList.remove("vel-adult-active");

    const adultView = document.getElementById("adult-view");
    if (adultView) adultView.classList.add("hidden");

    renderAdultMoviesListView(uniqueMovies);
  }

  async function renderAdultPortal() {
    const portal = document.getElementById("adult-view");
    const container = document.getElementById("vel-adult-packages-container");
    const searchWrap = document.getElementById("vel-adult-search-wrap");
    const searchInput = document.getElementById("vel-adult-search-input");
    if (!portal || !container) return;

    await fetchAssignedAdultPackages();

    const packages = Array.from(assignedAdultPackages.values());
    const uniquePackages = [];
    const seen = new Set();
    packages.forEach(p => {
      const key = `${p.kind}:${p.source_id}:${p.category_id || p.package_id || p.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePackages.push(p);
      }
    });

    function updateView() {
      container.replaceChildren();

      // Default state when opening portal: Neither is active, prompt to choose
      if (searchWrap) searchWrap.style.display = "none";
      container.innerHTML = `
        <div style="text-align:center;padding:50px 20px;color:#94a3b8;">
          <div style="font-size:1.15rem;font-weight:700;color:#f1f5f9;margin-bottom:8px;">Bienvenue dans votre Espace Adulte +18</div>
          <div>Sélectionnez <strong>TV en Direct</strong> pour lancer le lecteur TV ou <strong>Films</strong> pour lancer le lecteur de films.</div>
        </div>
      `;
    }

    if (searchInput) {
      searchInput.oninput = updateView;
    }

    const liveBtn = document.getElementById("vel-adult-btn-live");
    const vodBtn = document.getElementById("vel-adult-btn-vod");
    if (liveBtn) {
      liveBtn.onclick = () => {
        openAdultLivePlayerDirectly();
      };
    }
    if (vodBtn) {
      vodBtn.onclick = () => {
        openAdultMoviesPlayerDirectly();
      };
    }

    updateView();
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

  // Open the Adult Portal page
  async function openAdultPortal() {
    const isConfirmed = sessionStorage.getItem(ADULT_CONFIRMED_KEY) === "1";
    const dialog = document.getElementById("vel-adult-confirm-dialog");
    const yesBtn = document.getElementById("vel-adult-confirm-yes");
    const noBtn = document.getElementById("vel-adult-confirm-no");

    if (!isConfirmed && dialog) {
      dialog.showModal();

      const handleConfirm = () => {
        sessionStorage.setItem(ADULT_CONFIRMED_KEY, "1");
        dialog.close();
        showAdultView();
      };
      const handleCancel = () => {
        dialog.close();
      };

      if (yesBtn) yesBtn.onclick = handleConfirm;
      if (noBtn) noBtn.onclick = handleCancel;
      return;
    }

    showAdultView();
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
    document.body.classList.remove("vel-home-empty-active");

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
    document.body.classList.remove("vel-adult-active");
    delete document.body.dataset.veloraReturnAdult;
    const adultView = document.getElementById("adult-view");
    if (adultView) {
      adultView.classList.add("hidden");
      adultView.setAttribute("aria-hidden", "true");
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

    document.dispatchEvent(new CustomEvent("velora-return-home"));
  }

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

  window.veloraOpenAdultPortal = openAdultPortal;
  window.veloraCloseAdultPortal = closeAdultView;
})();
