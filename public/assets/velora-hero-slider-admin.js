(function() {
  "use strict";

  var state = {
    items: [],
    countries: [],
    editingItemId: null,
    editingCountryId: "all",
    scanResult: null
  };

  var adminBase = "/api/velora-db";

  async function apiReq(path, options) {
    var r = await fetch(adminBase + path, Object.assign({
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      }
    }, options || {}));
    if (!r.ok) {
      var err = await r.text();
      try { err = JSON.parse(err).error || err; } catch(_) {}
      throw new Error(err || ("HTTP " + r.status));
    }
    if (r.status === 204) return null;
    var t = await r.text();
    return t ? JSON.parse(t) : null;
  }

  function setStatus(msg, isError) {
    var el = document.getElementById("slider-admin-status");
    if (el) {
      el.textContent = msg;
      el.style.color = isError ? "#fca5a5" : "#86efac";
    }
  }

  async function loadCountries() {
    try {
      var rows = await apiReq("/rest/v1/admin_countries?select=id,name&order=name.asc");
      state.countries = Array.isArray(rows) ? rows : [];
      populateCountryDropdowns();
    } catch(e) {
      console.warn("Could not load countries:", e);
    }
  }

  function populateCountryDropdowns() {
    var formCountry = document.getElementById("slider-form-country");
    var scanCountry = document.getElementById("slider-scan-target-country");

    if (formCountry) {
      var curVal = formCountry.value || "all";
      formCountry.innerHTML = '<option value="all">🌍 Tous les pays (Global)</option>';
      state.countries.forEach(function(c) {
        var opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.name;
        formCountry.appendChild(opt);
      });
      if (curVal) formCountry.value = curVal;
    }

    if (scanCountry) {
      var curScanVal = scanCountry.value || "all";
      scanCountry.innerHTML = '<option value="all">🌍 Tous les pays (avec fallback USA)</option>';
      state.countries.forEach(function(c) {
        var opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.name;
        scanCountry.appendChild(opt);
      });
      if (curScanVal) scanCountry.value = curScanVal;
    }
  }

  async function loadSliderItems() {
    try {
      var rows = await apiReq("/rest/v1/admin_hero_slider?select=*&order=sort_order.asc");
      state.items = Array.isArray(rows) ? rows : [];
      renderSliderItems();
      setStatus(state.items.length + " élément(s) dans le slider.");
    } catch (e) {
      setStatus("Erreur de chargement: " + e.message, true);
    }
  }

  function renderSliderItems() {
    var list = document.getElementById("slider-admin-items-list");
    if (!list) return;
    list.innerHTML = "";

    if (!state.items.length) {
      list.innerHTML = '<div class="vel-home-sections-admin-empty">Aucun élément dans le Hero Slider. Ajoutez-en un ci-dessus ou via le scanner.</div>';
      return;
    }

    state.items.forEach(function(item, index) {
      var row = document.createElement("div");
      row.className = "vel-slider-admin-row" + (item.published === false ? " is-unpublished" : "") + (state.editingItemId === item.id ? " is-editing" : "");

      var thumb = document.createElement("img");
      thumb.className = "vel-slider-row-thumb";
      thumb.src = item.backdrop || item.image || "";
      thumb.alt = item.title;

      var meta = document.createElement("div");
      meta.className = "vel-slider-row-meta";

      var title = document.createElement("div");
      title.className = "vel-slider-row-title";
      title.textContent = (index + 1) + ". " + item.title;

      var sub = document.createElement("div");
      sub.className = "vel-slider-row-sub";

      var badgeSpan = document.createElement("span");
      badgeSpan.className = "vel-slider-tag vel-slider-tag--found";
      badgeSpan.textContent = item.badge || item.category || "Trending";

      var typeSpan = document.createElement("span");
      typeSpan.textContent = "Type: " + (item.category || "movie");

      var mappingCount = item.country_mappings ? Object.keys(item.country_mappings).length : 0;
      var countSpan = document.createElement("span");
      countSpan.textContent = mappingCount ? (mappingCount + " pays configurés") : "Global";

      sub.appendChild(badgeSpan);
      sub.appendChild(typeSpan);
      sub.appendChild(countSpan);

      meta.appendChild(title);
      meta.appendChild(sub);

      var actions = document.createElement("div");
      actions.className = "vel-slider-row-actions";

      // Edit Button
      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "countries-admin-cancel";
      editBtn.textContent = "Modifier / Pays";
      editBtn.addEventListener("click", function() {
        startEditItem(item);
      });

      // Move Up
      var upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "countries-admin-cancel";
      upBtn.textContent = "↑";
      upBtn.title = "Monter";
      upBtn.disabled = index === 0;
      upBtn.addEventListener("click", function() {
        moveItem(index, -1);
      });

      // Move Down
      var downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "countries-admin-cancel";
      downBtn.textContent = "↓";
      downBtn.title = "Descendre";
      downBtn.disabled = index === state.items.length - 1;
      downBtn.addEventListener("click", function() {
        moveItem(index, 1);
      });

      // Toggle Publish
      var pubBtn = document.createElement("button");
      pubBtn.type = "button";
      pubBtn.className = "countries-admin-cancel";
      pubBtn.textContent = item.published !== false ? "Masquer" : "Publier";
      pubBtn.addEventListener("click", async function() {
        try {
          await apiReq("/rest/v1/admin_hero_slider?id=eq." + encodeURIComponent(item.id), {
            method: "PATCH",
            body: JSON.stringify({ published: item.published === false })
          });
          await loadSliderItems();
          notifySliderUpdate();
        } catch(e) {
          setStatus("Erreur: " + e.message, true);
        }
      });

      // Delete Button
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "countries-admin-cancel";
      delBtn.style.color = "#fca5a5";
      delBtn.textContent = "Supprimer";
      delBtn.addEventListener("click", async function() {
        if (!confirm("Supprimer '" + item.title + "' du slider ?")) return;
        try {
          await apiReq("/rest/v1/admin_hero_slider?id=eq." + encodeURIComponent(item.id), {
            method: "DELETE"
          });
          if (state.editingItemId === item.id) resetForm();
          await loadSliderItems();
          notifySliderUpdate();
          setStatus("Élément supprimé.");
        } catch (e) {
          setStatus("Erreur suppression: " + e.message, true);
        }
      });

      actions.appendChild(editBtn);
      actions.appendChild(upBtn);
      actions.appendChild(downBtn);
      actions.appendChild(pubBtn);
      actions.appendChild(delBtn);

      row.appendChild(thumb);
      row.appendChild(meta);
      row.appendChild(actions);

      list.appendChild(row);
    });
  }

  async function moveItem(index, dir) {
    var targetIndex = index + dir;
    if (targetIndex < 0 || targetIndex >= state.items.length) return;

    var current = state.items[index];
    var target = state.items[targetIndex];

    var currentOrder = target.sort_order || targetIndex + 1;
    var targetOrder = current.sort_order || index + 1;

    try {
      await Promise.all([
        apiReq("/rest/v1/admin_hero_slider?id=eq." + encodeURIComponent(current.id), {
          method: "PATCH",
          body: JSON.stringify({ sort_order: currentOrder })
        }),
        apiReq("/rest/v1/admin_hero_slider?id=eq." + encodeURIComponent(target.id), {
          method: "PATCH",
          body: JSON.stringify({ sort_order: targetOrder })
        })
      ]);
      await loadSliderItems();
      notifySliderUpdate();
    } catch(e) {
      setStatus("Erreur réorganisation: " + e.message, true);
    }
  }

  function startEditItem(item) {
    state.editingItemId = item.id;
    var formCountry = document.getElementById("slider-form-country");
    var titleInp = document.getElementById("slider-form-title");
    var catInp = document.getElementById("slider-form-category");
    var badgeInp = document.getElementById("slider-form-badge");
    var imgInp = document.getElementById("slider-form-image");
    var descInp = document.getElementById("slider-form-desc");
    var saveBtn = document.getElementById("slider-form-submit");
    var cancelBtn = document.getElementById("slider-form-cancel");

    if (formCountry) formCountry.value = "all";
    state.editingCountryId = "all";

    if (titleInp) titleInp.value = item.title || "";
    if (catInp) catInp.value = item.category || "movie";
    if (badgeInp) badgeInp.value = item.badge || "Top Trending";
    if (imgInp) imgInp.value = item.backdrop || item.image || "";
    if (descInp) descInp.value = item.overview || "";
    if (saveBtn) saveBtn.textContent = "Enregistrer pour Tous les pays (Global)";
    if (cancelBtn) cancelBtn.hidden = false;

    renderSliderItems();
    titleInp?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function handleCountryDropdownChange() {
    var formCountry = document.getElementById("slider-form-country");
    if (!formCountry) return;
    var selectedCountry = formCountry.value || "all";
    state.editingCountryId = selectedCountry;

    var saveBtn = document.getElementById("slider-form-submit");
    var titleInp = document.getElementById("slider-form-title");
    var imgInp = document.getElementById("slider-form-image");

    if (selectedCountry === "all") {
      if (saveBtn) saveBtn.textContent = state.editingItemId ? "Enregistrer pour Tous les pays (Global)" : "Ajouter manuellement au slider";
      if (state.editingItemId) {
        var itm = state.items.find(function(i) { return i.id === state.editingItemId; });
        if (itm) {
          if (titleInp) titleInp.value = itm.title || "";
          if (imgInp) imgInp.value = itm.backdrop || itm.image || "";
        }
      }
    } else {
      var cObj = state.countries.find(function(c) { return c.id === selectedCountry; });
      var cName = cObj ? cObj.name : selectedCountry;
      if (saveBtn) saveBtn.textContent = "Enregistrer uniquement pour " + cName;

      if (state.editingItemId) {
        var itm = state.items.find(function(i) { return i.id === state.editingItemId; });
        if (itm && itm.country_mappings && itm.country_mappings[selectedCountry]) {
          var mapped = itm.country_mappings[selectedCountry];
          if (titleInp) titleInp.value = mapped.name || itm.title || "";
          if (imgInp) imgInp.value = mapped.thumbUrl || itm.image || "";
          setStatus("Configuration spécifique chargée pour : " + cName);
        } else {
          setStatus("Aucune configuration spécifique pour " + cName + " (utilise actuellement le fallback).");
        }
      }
    }
  }

  function resetForm() {
    state.editingItemId = null;
    state.editingCountryId = "all";
    var formCountry = document.getElementById("slider-form-country");
    var titleInp = document.getElementById("slider-form-title");
    var imgInp = document.getElementById("slider-form-image");
    var descInp = document.getElementById("slider-form-desc");
    var saveBtn = document.getElementById("slider-form-submit");
    var cancelBtn = document.getElementById("slider-form-cancel");

    if (formCountry) formCountry.value = "all";
    if (titleInp) titleInp.value = "";
    if (imgInp) imgInp.value = "";
    if (descInp) descInp.value = "";
    if (saveBtn) saveBtn.textContent = "Ajouter manuellement au slider";
    if (cancelBtn) cancelBtn.hidden = true;

    renderSliderItems();
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    var formCountry = document.getElementById("slider-form-country");
    var titleInp = document.getElementById("slider-form-title");
    var catInp = document.getElementById("slider-form-category");
    var badgeInp = document.getElementById("slider-form-badge");
    var imgInp = document.getElementById("slider-form-image");
    var descInp = document.getElementById("slider-form-desc");

    var targetCountry = formCountry ? formCountry.value : "all";
    var title = titleInp ? titleInp.value.trim() : "";
    if (!title) {
      setStatus("Veuillez saisir un titre.", true);
      return;
    }

    try {
      if (state.editingItemId) {
        var currentItem = state.items.find(function(i) { return i.id === state.editingItemId; });
        if (!currentItem) throw new Error("Élément introuvable");

        var mappings = Object.assign({}, currentItem.country_mappings || {});

        if (targetCountry !== "all") {
          // Specific country override
          var existingMapping = mappings[targetCountry] || {};
          mappings[targetCountry] = Object.assign({}, existingMapping, {
            name: title,
            thumbUrl: imgInp ? imgInp.value.trim() : (existingMapping.thumbUrl || currentItem.image),
            contentType: catInp ? catInp.value : (existingMapping.contentType || currentItem.category || "movie"),
            isFallback: false
          });

          await apiReq("/rest/v1/admin_hero_slider?id=eq." + encodeURIComponent(state.editingItemId), {
            method: "PATCH",
            body: JSON.stringify({ country_mappings: mappings })
          });

          var cObj = state.countries.find(function(c) { return c.id === targetCountry; });
          setStatus("Modifications enregistrées avec succès pour " + (cObj ? cObj.name : targetCountry) + " !");
        } else {
          // Global update
          var payload = {
            title: title,
            category: catInp ? catInp.value : "movie",
            badge: badgeInp ? badgeInp.value : "Top Trending",
            image: imgInp ? imgInp.value.trim() : "",
            backdrop: imgInp ? imgInp.value.trim() : "",
            overview: descInp ? descInp.value.trim() : ""
          };

          await apiReq("/rest/v1/admin_hero_slider?id=eq." + encodeURIComponent(state.editingItemId), {
            method: "PATCH",
            body: JSON.stringify(payload)
          });
          setStatus("Élément global modifié avec succès.");
        }
      } else {
        // Add new
        var newPayload = {
          id: "hero_slider_" + Date.now(),
          title: title,
          category: catInp ? catInp.value : "movie",
          badge: badgeInp ? badgeInp.value : "Top Trending",
          image: imgInp ? imgInp.value.trim() : "",
          backdrop: imgInp ? imgInp.value.trim() : "",
          overview: descInp ? descInp.value.trim() : "",
          sort_order: state.items.length + 1,
          published: true,
          country_mappings: {}
        };

        if (targetCountry !== "all") {
          newPayload.country_mappings[targetCountry] = {
            name: title,
            thumbUrl: imgInp ? imgInp.value.trim() : "",
            contentType: catInp ? catInp.value : "movie",
            isFallback: false
          };
        }

        await apiReq("/rest/v1/admin_hero_slider", {
          method: "POST",
          body: JSON.stringify(newPayload)
        });
        setStatus("Nouvel élément ajouté avec succès.");
      }

      resetForm();
      await loadSliderItems();
      notifySliderUpdate();
    } catch(err) {
      setStatus("Erreur: " + err.message, true);
    }
  }

  // Multi-country scanner
  async function runCountryScan() {
    var searchInp = document.getElementById("slider-scan-query");
    var typeSel = document.getElementById("slider-scan-type");
    var resultsBox = document.getElementById("slider-scan-results");
    var query = searchInp ? searchInp.value.trim() : "";

    if (!query) {
      setStatus("Saisissez un titre à scanner.", true);
      return;
    }

    setStatus("Scan de la disponibilité multi-pays en cours...");
    if (resultsBox) {
      resultsBox.innerHTML = '<div style="padding:1rem;color:#bfb3db;">Recherche dans les catalogues de tous les pays...</div>';
      resultsBox.hidden = false;
    }

    try {
      var type = typeSel ? typeSel.value : "";
      var data = await apiReq("/hero-slider/scan-availability?q=" + encodeURIComponent(query) + "&type=" + encodeURIComponent(type));
      state.scanResult = data;
      renderScanResults(data);
      setStatus("Scan terminé : " + data.totalMatchesFound + " résultat(s) trouvés.");
    } catch(err) {
      setStatus("Erreur scan: " + err.message, true);
      if (resultsBox) resultsBox.innerHTML = '<div style="color:#fca5a5;padding:1rem;">Erreur : ' + err.message + '</div>';
    }
  }

  function renderScanResults(data) {
    var resultsBox = document.getElementById("slider-scan-results");
    if (!resultsBox) return;
    resultsBox.hidden = false;
    resultsBox.innerHTML = "";

    var card = document.createElement("div");
    card.className = "vel-slider-scan-result";

    var header = document.createElement("div");
    header.className = "vel-slider-scan-header";

    var title = document.createElement("div");
    title.className = "vel-slider-scan-title";
    var foundCount = (data.countries || []).filter(function(c) { return c.found; }).length;
    title.innerHTML = 'Disponibilité pour "<strong>' + data.query + '</strong>" : <span style="color:#86efac">' + foundCount + ' pays avec version locale</span> / ' + (data.countries || []).length + ' pays au total';

    var targetSel = document.getElementById("slider-scan-target-country");
    var targetCountry = targetSel ? targetSel.value : "all";

    var bulkBtn = document.createElement("button");
    bulkBtn.type = "button";
    bulkBtn.className = "vel-slider-btn-bulk";

    if (targetCountry === "all") {
      bulkBtn.innerHTML = '🚀 Ajouter à TOUS les pays (avec fallback USA)';
    } else {
      var cObj = state.countries.find(function(c) { return c.id === targetCountry; });
      bulkBtn.innerHTML = '🎯 Affecter UNIQUEMENT à ' + (cObj ? cObj.name : targetCountry);
    }

    bulkBtn.addEventListener("click", async function() {
      await executeBulkAssign(data);
    });

    header.appendChild(title);
    header.appendChild(bulkBtn);
    card.appendChild(header);

    // USA Fallback Info
    if (data.usaFallback) {
      var fallbackInfo = document.createElement("div");
      fallbackInfo.style.cssText = "margin-bottom:0.75rem;font-size:0.82rem;color:#bfb3db;display:flex;align-items:center;gap:0.5rem;";
      fallbackInfo.innerHTML = '<strong>Version Fallback US :</strong> ' + (data.usaFallback.name || "Disponible") + ' (' + (data.usaFallback.contentType || "VOD") + ')';
      card.appendChild(fallbackInfo);
    }

    // Country Grid
    var grid = document.createElement("div");
    grid.className = "vel-slider-country-matrix";

    (data.countries || []).forEach(function(c) {
      var item = document.createElement("div");
      item.className = "vel-slider-country-item " + (c.found ? "vel-slider-country-item--found" : "vel-slider-country-item--fallback");

      var name = document.createElement("span");
      name.textContent = c.countryName;

      var tag = document.createElement("span");
      tag.className = "vel-slider-tag " + (c.found ? "vel-slider-tag--found" : "vel-slider-tag--fallback");
      tag.textContent = c.found ? "Local" : "Fallback US";

      // Small button to assign specifically for this country
      var quickBtn = document.createElement("button");
      quickBtn.type = "button";
      quickBtn.className = "countries-admin-cancel";
      quickBtn.style.cssText = "padding:0.2rem 0.45rem;font-size:0.68rem;margin-left:0.4rem;";
      quickBtn.textContent = "Choisir ce pays";
      quickBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        if (targetSel) {
          targetSel.value = c.countryId;
          targetSel.dispatchEvent(new Event("change"));
        }
        renderScanResults(data);
        setStatus("Pays cible défini sur : " + c.countryName);
      });

      var rightWrap = document.createElement("div");
      rightWrap.style.cssText = "display:flex;align-items:center;gap:0.3rem;";
      rightWrap.appendChild(tag);
      rightWrap.appendChild(quickBtn);

      item.appendChild(name);
      item.appendChild(rightWrap);
      grid.appendChild(item);
    });

    card.appendChild(grid);
    resultsBox.appendChild(card);
  }

  async function executeBulkAssign(scanData) {
    if (!scanData || !scanData.query) return;

    var targetSel = document.getElementById("slider-scan-target-country");
    var targetCountry = targetSel ? targetSel.value : "all";

    var typeSel = document.getElementById("slider-scan-type");
    var category = (typeSel && typeSel.value) ? typeSel.value : (scanData.usaFallback?.contentType === "series" ? "series" : "movie");

    if (targetCountry === "all") {
      setStatus("Ajout de '" + scanData.query + "' à tous les pays...");
      var payload = {
        title: scanData.query,
        category: category,
        badge: category === "series" ? "Série" : "Top Trending",
        image: scanData.usaFallback?.thumbUrl || "",
        backdrop: scanData.usaFallback?.thumbUrl || "",
        query: scanData.query
      };

      try {
        await apiReq("/hero-slider/bulk-assign", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setStatus("'" + scanData.query + "' a été ajouté avec succès à tous les pays !", false);
        await loadSliderItems();
        notifySliderUpdate();
      } catch(e) {
        setStatus("Erreur lors de l'ajout global: " + e.message, true);
      }
    } else {
      var cObj = state.countries.find(function(c) { return c.id === targetCountry; });
      var cName = cObj ? cObj.name : targetCountry;
      setStatus("Affectation de '" + scanData.query + "' uniquement pour " + cName + "...");

      var countryMatch = (scanData.countries || []).find(function(c) { return c.countryId === targetCountry; });
      var streamToAssign = (countryMatch && countryMatch.match) ? countryMatch.match : scanData.usaFallback;

      var manualMappings = {};
      if (streamToAssign) {
        manualMappings[targetCountry] = {
          streamId: streamToAssign.streamId,
          sourceId: streamToAssign.sourceId,
          globalStreamId: streamToAssign.globalStreamId || streamToAssign.streamId,
          name: streamToAssign.name || scanData.query,
          thumbUrl: streamToAssign.thumbUrl || scanData.usaFallback?.thumbUrl || "",
          containerExtension: streamToAssign.containerExtension || "",
          contentType: streamToAssign.contentType || category,
          isFallback: !countryMatch?.found
        };
      }

      var payload = {
        title: scanData.query,
        category: category,
        badge: category === "series" ? "Série" : "Top Trending",
        image: streamToAssign?.thumbUrl || scanData.usaFallback?.thumbUrl || "",
        backdrop: streamToAssign?.thumbUrl || scanData.usaFallback?.thumbUrl || "",
        query: scanData.query,
        manualMappings: manualMappings
      };

      try {
        await apiReq("/hero-slider/bulk-assign", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setStatus("'" + scanData.query + "' a été affecté avec succès à " + cName + " !", false);
        await loadSliderItems();
        notifySliderUpdate();
      } catch(e) {
        setStatus("Erreur lors de l'affectation à " + cName + ": " + e.message, true);
      }
    }
  }

  function notifySliderUpdate() {
    if (typeof window.veloraReloadHeroSlider === "function") {
      window.veloraReloadHeroSlider();
    }
    document.dispatchEvent(new CustomEvent("velora-hero-slider-updated"));
  }

  function initAdmin() {
    var form = document.getElementById("slider-admin-form");
    if (form) form.addEventListener("submit", handleFormSubmit);

    var cancelBtn = document.getElementById("slider-form-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", resetForm);

    var formCountry = document.getElementById("slider-form-country");
    if (formCountry) formCountry.addEventListener("change", handleCountryDropdownChange);

    var scanTargetCountry = document.getElementById("slider-scan-target-country");
    if (scanTargetCountry) {
      scanTargetCountry.addEventListener("change", function() {
        if (state.scanResult) renderScanResults(state.scanResult);
      });
    }

    var scanBtn = document.getElementById("slider-scan-btn");
    if (scanBtn) scanBtn.addEventListener("click", runCountryScan);

    var scanInp = document.getElementById("slider-scan-query");
    if (scanInp) {
      scanInp.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          e.preventDefault();
          runCountryScan();
        }
      });
    }

    // Listen to Settings tab click
    document.addEventListener("click", function(e) {
      var tabBtn = e.target.closest("[data-settings-tab='slider']");
      if (!tabBtn) return;
      document.querySelectorAll(".settings-tabs [role='tab']").forEach(function(b) {
        var isCurrent = b.dataset.settingsTab === "slider";
        b.setAttribute("aria-selected", isCurrent ? "true" : "false");
        b.tabIndex = isCurrent ? 0 : -1;
        b.classList.toggle("settings-tabs__tab--active", isCurrent);
      });
      document.querySelectorAll(".settings-tab-panel").forEach(function(p) {
        var isCurrent = p.dataset.settingsTab === "slider";
        p.classList.toggle("hidden", !isCurrent);
        p.hidden = !isCurrent;
      });
      loadSliderItems();
      loadCountries();
    });

    loadCountries();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdmin, { once: true });
  } else {
    initAdmin();
  }
})();
