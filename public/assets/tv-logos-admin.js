(() => {
  'use strict';

  const SURL = '/api/velora-db';
  const KEY = 'local-vps';
  let customLogosList = [];
  let isEditing = false;
  let editingOriginalName = '';

  const esc = function(v) {
    return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  const getEl = function(id) {
    return document.getElementById(id);
  };

  async function req(url, opt) {
    opt = opt || {};
    const t = localStorage.getItem('authToken');
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opt.headers || {});
    if (t) headers.Authorization = 'Bearer ' + t;
    headers.apikey = KEY;
    const r = await fetch(url, Object.assign({ credentials: 'same-origin' }, opt, { headers: headers }));
    const b = await r.json().catch(function() { return null; });
    if (!r.ok) throw new Error(b && (b.message || b.error) ? (b.message || b.error) : ('HTTP ' + r.status));
    return b;
  }

  function setStatus(msg, bad) {
    const el = getEl('logos-admin-status');
    if (el) {
      el.textContent = msg;
      el.classList.toggle('error', !!bad);
      el.classList.toggle('success', !bad && !!msg);
    }
  }

  function setProgressStatus(msg, bad) {
    const el = getEl('logos-sync-status');
    if (el) {
      el.textContent = msg;
      el.classList.toggle('error', !!bad);
    }
  }

  function showLogosTab() {
    document.querySelectorAll('#settings-tabs [role="tab"]').forEach(function(tab) {
      const active = tab.dataset.settingsTab === 'logos';
      tab.classList.toggle('settings-tabs__tab--active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('.settings-tab-panel').forEach(function(p) {
      const active = p.dataset.settingsTab === 'logos';
      p.classList.toggle('hidden', !active);
      p.hidden = !active;
    });
    loadLogoToggles();
    loadCustomLogos();
  }

  async function loadLogoToggles() {
    const chInput = getEl('logos-tab-channels-only');
    const pkgInput = getEl('logos-tab-packages-only');
    const cachedCh = localStorage.getItem('velora_official_channels_logos_only');
    const cachedPkg = localStorage.getItem('velora_official_packages_logos_only');
    if (cachedCh !== null && chInput) chInput.checked = cachedCh === '1';
    if (cachedPkg !== null && pkgInput) pkgInput.checked = cachedPkg === '1';

    try {
      const all = await req(SURL + '/rest/v1/admin_settings');
      if (Array.isArray(all)) {
        const ch = all.find(function(r) { return r.key === 'official_channels_logos_only' || r.id === 'official_channels_logos_only'; });
        if (ch && ch.value !== undefined) {
          const checked = ch.value === '1' || ch.value === 1 || ch.value === true || ch.value === 'true';
          if (chInput) chInput.checked = checked;
          localStorage.setItem('velora_official_channels_logos_only', checked ? '1' : '0');
        }
        const pkg = all.find(function(r) { return r.key === 'official_packages_logos_only' || r.id === 'official_packages_logos_only'; });
        if (pkg && pkg.value !== undefined) {
          const checked = pkg.value === '1' || pkg.value === 1 || pkg.value === true || pkg.value === 'true';
          if (pkgInput) pkgInput.checked = checked;
          localStorage.setItem('velora_official_packages_logos_only', checked ? '1' : '0');
        }
      }
    } catch (_) {}
  }

  async function toggleChannelsOnly(checked) {
    localStorage.setItem('velora_official_channels_logos_only', checked ? '1' : '0');
    localStorage.setItem('velora_official_logos_only', checked ? '1' : '0');
    const inp = getEl('logos-tab-channels-only');
    if (inp) inp.checked = checked;
    const mpInp = getEl('mp-iptv-channels-logos-only');
    if (mpInp) mpInp.checked = checked;

    try {
      setStatus(checked ? 'Chaînes : mode logos officiels activé...' : 'Chaînes : tous les logos activés...');
      await Promise.all([
        req(SURL + '/rest/v1/admin_settings?on_conflict=key', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ id: 'official_channels_logos_only', key: 'official_channels_logos_only', value: checked ? '1' : '0', updated_at: new Date().toISOString() })
        }),
        req(SURL + '/rest/v1/admin_settings?on_conflict=key', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ id: 'official_logos_only', key: 'official_logos_only', value: checked ? '1' : '0', updated_at: new Date().toISOString() })
        })
      ]);
      window.dispatchEvent(new CustomEvent('velora-official-logos-toggled', { detail: { officialOnly: checked, type: 'channels' } }));
      window.dispatchEvent(new CustomEvent('velora-admin-curation-changed'));
      window.dispatchEvent(new CustomEvent('velora-home-cache-invalidated'));
      setStatus(checked ? '✨ Chaînes : logos officiels activés (iptv-org + logos personnalisés).' : 'Chaînes : logos des fournisseurs réactivés.');
    } catch (e) {
      setStatus('Erreur : ' + e.message, true);
    }
  }

  async function togglePackagesOnly(checked) {
    localStorage.setItem('velora_official_packages_logos_only', checked ? '1' : '0');
    try { localStorage.removeItem('velora_package_covers'); } catch (_) {}
    const inp = getEl('logos-tab-packages-only');
    if (inp) inp.checked = checked;
    const mpInp = getEl('mp-iptv-packages-logos-only');
    if (mpInp) mpInp.checked = checked;

    try {
      setStatus(checked ? 'Packages : mode logos officiels activé...' : 'Packages : tous les logos activés...');
      await req(SURL + '/rest/v1/admin_settings?on_conflict=key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ id: 'official_packages_logos_only', key: 'official_packages_logos_only', value: checked ? '1' : '0', updated_at: new Date().toISOString() })
      });
      window.dispatchEvent(new CustomEvent('velora-official-logos-toggled', { detail: { officialOnly: checked, type: 'packages' } }));
      window.dispatchEvent(new CustomEvent('velora-admin-curation-changed'));
      window.dispatchEvent(new CustomEvent('velora-home-cache-invalidated'));
      window.dispatchEvent(new CustomEvent('velora-package-covers-updated'));
      if (typeof window.veloraReloadPackageCovers === 'function') window.veloraReloadPackageCovers(true);
      setStatus(checked ? '✨ Packages : logos officiels et drapeaux activés.' : 'Packages : covers des fournisseurs réactivées.');
    } catch (e) {
      setStatus('Erreur : ' + e.message, true);
    }
  }

  async function syncAllChannelLogos() {
    const button = getEl('logos-btn-auto-sync');
    if (button && button.disabled) return;
    if (!confirm('Voulez-vous synchroniser et mettre à jour automatiquement les logos de vos chaînes TV et packages en HD avec iptv-org et vos logos personnalisés ?')) return;

    if (button) button.disabled = true;
    setProgressStatus('Lancement de la synchronisation automatique des logos TV...');
    try {
      await req(SURL + '/admin/sync-channel-logos', { method: 'POST', body: '{}' });
      setProgressStatus('Synchronisation en cours en arrière-plan...');

      const pollTimer = setInterval(async function() {
        try {
          const pollRes = await req(SURL + '/admin/sync-channel-logos-status');
          const p = pollRes && pollRes.progress;
          if (p) {
            setProgressStatus('Logos TV : ' + (p.updated || 0) + ' chaînes et ' + (p.packagesUpdated || 0) + ' packages mis à jour (' + (p.processed || 0) + '/' + (p.total || 0) + ')...');
            if (!p.running) {
              clearInterval(pollTimer);
              if (button) button.disabled = false;
              try { localStorage.removeItem('velora_package_covers'); } catch (_) {}
              if (typeof window.veloraReloadPackageCovers === 'function') window.veloraReloadPackageCovers(true);
              setProgressStatus('✨ Synchronisation terminée avec succès ! ' + (p.updated || 0) + ' chaînes et ' + (p.packagesUpdated || 0) + ' packages mis à jour.');
              window.dispatchEvent(new CustomEvent('velora-admin-curation-changed'));
              window.dispatchEvent(new CustomEvent('velora-package-covers-updated'));
            }
          }
        } catch (_) {
          clearInterval(pollTimer);
          if (button) button.disabled = false;
        }
      }, 1500);
    } catch (e) {
      setProgressStatus('Erreur : ' + e.message, true);
      if (button) button.disabled = false;
    }
  }

  async function loadCustomLogos() {
    try {
      const res = await req(SURL + '/admin/custom-logos');
      customLogosList = Array.isArray(res && res.logos) ? res.logos : [];
      renderCustomLogosList();
      const countEl = getEl('logos-custom-count');
      if (countEl) countEl.textContent = '(' + customLogosList.length + ')';
    } catch (e) {
      setStatus('Impossible de charger les logos personnalisés : ' + e.message, true);
    }
  }

  function renderCustomLogosList() {
    const listEl = getEl('logos-custom-list');
    if (!listEl) return;
    const searchInput = getEl('logos-custom-search');
    const filter = (searchInput && searchInput.value ? searchInput.value : '').trim().toLowerCase();
    const filtered = customLogosList.filter(function(item) {
      if (!filter) return true;
      if (item.name && item.name.toLowerCase().includes(filter)) return true;
      if (item.country && item.country.toLowerCase().includes(filter)) return true;
      return (item.aliases || []).some(function(a) { return String(a).toLowerCase().includes(filter); });
    });

    if (!filtered.length) {
      listEl.innerHTML = '<div class="vel-logos-empty">' + (filter ? 'Aucun logo correspondant à la recherche.' : 'Aucun logo personnalisé pour le moment. Utilisez le formulaire ci-dessus pour en ajouter ou en importer.') + '</div>';
      return;
    }

    listEl.innerHTML = filtered.map(function(item) {
      const aliases = Array.isArray(item.aliases) ? item.aliases : [];
      const aliasBadges = aliases.map(function(a) { return '<span class="vel-logo-badge vel-logo-badge--alias">' + esc(a) + '</span>'; }).join('');
      const countryBadge = item.country ? '<span class="vel-logo-badge vel-logo-badge--country">' + esc(item.country) + '</span>' : '';

      return '<div class="vel-logo-card" data-logo-name="' + esc(item.name) + '">' +
        '<div class="vel-logo-card__thumb-wrap">' +
          '<img src="/proxy?target=' + encodeURIComponent(item.url) + '" alt="' + esc(item.name) + '" class="vel-logo-card__thumb" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';" />' +
          '<div class="vel-logo-card__thumb-fallback" style="display:none;">📺</div>' +
        '</div>' +
        '<div class="vel-logo-card__info">' +
          '<div class="vel-logo-card__title-row">' +
            '<strong class="vel-logo-card__name">' + esc(item.name) + '</strong>' +
            countryBadge +
          '</div>' +
          '<div class="vel-logo-card__url" title="' + esc(item.url) + '">' + esc(item.url) + '</div>' +
          (aliases.length ? '<div class="vel-logo-card__aliases">' + aliasBadges + '</div>' : '') +
        '</div>' +
        '<div class="vel-logo-card__actions">' +
          '<button type="button" class="vel-logo-btn vel-logo-btn--test" data-test-logo="' + esc(item.name) + '" title="Tester la détection">⚡ Tester</button>' +
          '<button type="button" class="vel-logo-btn vel-logo-btn--edit" data-edit-logo="' + esc(item.name) + '" title="Modifier ce logo">✏️ Modifier</button>' +
          '<button type="button" class="vel-logo-btn vel-logo-btn--delete" data-delete-logo="' + esc(item.name) + '" title="Supprimer ce logo">🗑️</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function resetForm() {
    isEditing = false;
    editingOriginalName = '';
    const form = getEl('logos-form');
    if (form) form.reset();
    const title = getEl('logos-form-title');
    if (title) title.textContent = 'Ajouter un logo personnalisé';
    const submitBtn = getEl('logos-form-submit');
    if (submitBtn) submitBtn.textContent = '➕ Enregistrer le logo';
    updatePreview('');
  }

  function updatePreview(url) {
    const img = getEl('logos-form-preview-img');
    const fallback = getEl('logos-form-preview-fallback');
    const trimmed = (url || '').trim();
    if (img && fallback) {
      if (trimmed) {
        img.src = '/proxy?target=' + encodeURIComponent(trimmed);
        img.style.display = 'block';
        img.onerror = function() { img.style.display = 'none'; fallback.style.display = 'flex'; };
        fallback.style.display = 'none';
      } else {
        img.src = '';
        img.style.display = 'none';
        fallback.style.display = 'flex';
      }
    }
  }

  async function uploadLogoFile(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setStatus('L’image est trop volumineuse (max 8 Mo).', true);
      return;
    }

    const uploadBtn = getEl('logos-btn-upload');
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = '⏳ Envoi...';
    }
    setStatus('Téléversement de l’image sur le VPS...');

    try {
      const dataBase64 = await new Promise(function(resolve, reject) {
        const reader = new FileReader();
        reader.onload = function() { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await req(SURL + '/admin/custom-logos/upload', {
        method: 'POST',
        body: JSON.stringify({ dataBase64: dataBase64, fileName: file.name })
      });

      if (res && res.url) {
        const urlInput = getEl('logos-input-url');
        if (urlInput) urlInput.value = res.url;
        updatePreview(res.url);

        const nameInput = getEl('logos-input-name');
        if (nameInput && !nameInput.value.trim()) {
          const autoName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().toUpperCase();
          nameInput.value = autoName;
        }

        setStatus('✨ Image importée avec succès sur le VPS ! Remplissez le nom et enregistrez.');
      } else {
        throw new Error('Échec téléversement image');
      }
    } catch (err) {
      setStatus('Erreur téléversement : ' + err.message, true);
    } finally {
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '📁 Importer';
      }
    }
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    const nameInput = getEl('logos-input-name');
    const urlInput = getEl('logos-input-url');
    const aliasesInput = getEl('logos-input-aliases');
    const countryInput = getEl('logos-input-country');

    const name = (nameInput ? nameInput.value : '').trim();
    const url = (urlInput ? urlInput.value : '').trim();
    const aliasesRaw = (aliasesInput ? aliasesInput.value : '').trim();
    const country = (countryInput ? countryInput.value : '').trim();

    if (!name || !url) {
      setStatus('Veuillez renseigner le nom et l’URL ou importer une image pour le logo.', true);
      return;
    }

    const aliases = aliasesRaw.split(/[,;\n]+/).map(function(a) { return a.trim(); }).filter(Boolean);
    const submitBtn = getEl('logos-form-submit');
    if (submitBtn) submitBtn.disabled = true;
    setStatus('Enregistrement du logo sur le VPS...');

    try {
      if (isEditing && editingOriginalName && editingOriginalName.toLowerCase() !== name.toLowerCase()) {
        await req(SURL + '/admin/custom-logos', { method: 'DELETE', body: JSON.stringify({ name: editingOriginalName }) });
      }

      const res = await req(SURL + '/admin/custom-logos', {
        method: 'POST',
        body: JSON.stringify({ name: name, url: url, aliases: aliases, country: country })
      });

      customLogosList = Array.isArray(res && res.logos) ? res.logos : [];
      renderCustomLogosList();
      const countEl = getEl('logos-custom-count');
      if (countEl) countEl.textContent = '(' + customLogosList.length + ')';

      setStatus('✨ Le logo « ' + name + ' » a été enregistré dans data/custom-logos.json et activé immédiatement !');
      resetForm();
      window.dispatchEvent(new CustomEvent('velora-admin-curation-changed'));
      window.dispatchEvent(new CustomEvent('velora-package-covers-updated'));
    } catch (err) {
      setStatus('Erreur : ' + err.message, true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function editLogo(name) {
    const item = customLogosList.find(function(l) { return l.name && l.name.toLowerCase() === name.toLowerCase(); });
    if (!item) return;

    isEditing = true;
    editingOriginalName = item.name;
    const nameInput = getEl('logos-input-name');
    const urlInput = getEl('logos-input-url');
    const aliasesInput = getEl('logos-input-aliases');
    const countryInput = getEl('logos-input-country');
    const title = getEl('logos-form-title');
    const submitBtn = getEl('logos-form-submit');

    if (nameInput) nameInput.value = item.name;
    if (urlInput) urlInput.value = item.url;
    if (aliasesInput) aliasesInput.value = (item.aliases || []).join(', ');
    if (countryInput) countryInput.value = item.country || '';
    if (title) title.textContent = 'Modifier le logo « ' + item.name + ' »';
    if (submitBtn) submitBtn.textContent = '💾 Mettre à jour';
    updatePreview(item.url);

    const formEl = getEl('logos-form');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (nameInput) nameInput.focus();
  }

  async function deleteLogo(name) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer le logo personnalisé « ' + name + ' » ?')) return;
    setStatus('Suppression de ' + name + '...');
    try {
      const res = await req(SURL + '/admin/custom-logos', {
        method: 'DELETE',
        body: JSON.stringify({ name: name })
      });
      customLogosList = Array.isArray(res && res.logos) ? res.logos : [];
      renderCustomLogosList();
      const countEl = getEl('logos-custom-count');
      if (countEl) countEl.textContent = '(' + customLogosList.length + ')';
      setStatus('Logo « ' + name + ' » supprimé.');
      window.dispatchEvent(new CustomEvent('velora-admin-curation-changed'));
    } catch (e) {
      setStatus('Erreur lors de la suppression : ' + e.message, true);
    }
  }

  async function testMatch(name) {
    const testInput = getEl('logos-test-input');
    if (testInput) testInput.value = name;
    await runTestMatch(name);
    const testCard = getEl('logos-test-card');
    if (testCard) testCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function runTestMatch(name) {
    const resultEl = getEl('logos-test-result');
    if (!resultEl) return;
    const term = (name || '').trim();
    if (!term) {
      resultEl.innerHTML = '<div class="vel-logos-test-hint">Saisissez un nom de chaîne (ex: <em>2M MAROC ◉</em>, <em>BEIN SPORTS 1 HD</em>) pour tester la détection en direct.</div>';
      return;
    }

    resultEl.innerHTML = '<div class="vel-logos-test-loading">Test de correspondance en cours...</div>';
    try {
      const res = await req(SURL + '/admin/custom-logos/test-match', {
        method: 'POST',
        body: JSON.stringify({ name: term })
      });

      if (res && res.matched && res.result && res.result.logo) {
        const r = res.result;
        resultEl.innerHTML = '<div class="vel-logos-test-matched">' +
          '<div class="vel-logos-test-badge-success">✅ CORRESPONDANCE TROUVÉE</div>' +
          '<div class="vel-logos-test-details">' +
            '<div class="vel-logos-test-thumb-wrap">' +
              '<img src="/proxy?target=' + encodeURIComponent(r.logo) + '" alt="" class="vel-logos-test-thumb" />' +
            '</div>' +
            '<div class="vel-logos-test-meta">' +
              '<div><strong>Nom nettoyé :</strong> <code>' + esc(res.cleaned || term) + '</code></div>' +
              '<div><strong>Chaîne identifiée :</strong> <code>' + esc(r.name || r.id) + '</code> (Pays: ' + esc(r.country || 'N/A') + ')</div>' +
              '<div><strong>Source :</strong> ' + (r.country === 'CUSTOM' ? '<span class="vel-logo-badge vel-logo-badge--custom">⭐ Vos logos personnalisés (custom-logos.json)</span>' : '<span class="vel-logo-badge vel-logo-badge--official">🌐 Dataset iptv-org</span>') + '</div>' +
              '<div class="vel-logos-test-url"><small>' + esc(r.logo) + '</small></div>' +
            '</div>' +
          '</div>' +
        '</div>';
      } else {
        resultEl.innerHTML = '<div class="vel-logos-test-nomatch">' +
          '<div class="vel-logos-test-badge-fail">⚠️ AUCUN LOGO AUTOMATIQUE TROUVÉ</div>' +
          '<p>Le moteur a nettoyé le nom en : <code>' + esc((res && res.cleaned) || term) + '</code> mais aucun logo n\'existe pour cette chaîne dans iptv-org.</p>' +
          '<button type="button" class="vel-logo-btn vel-logo-btn--add-from-test" id="logos-btn-add-from-test" data-name="' + esc((res && res.cleaned) || term) + '">➕ Créer le logo pour cette chaîne</button>' +
        '</div>';
      }
    } catch (e) {
      resultEl.innerHTML = '<div class="vel-logos-test-error">Erreur du test : ' + esc(e.message) + '</div>';
    }
  }

  async function openJsonEditor() {
    const dialog = getEl('logos-json-dialog');
    const textarea = getEl('logos-json-textarea');
    if (!dialog || !textarea) return;
    try {
      const res = await req(SURL + '/admin/custom-logos');
      textarea.value = JSON.stringify((res && res.raw) || {}, null, 2);
      dialog.showModal();
    } catch (e) {
      setStatus('Impossible de lire le JSON : ' + e.message, true);
    }
  }

  async function saveJsonEditor() {
    const textarea = getEl('logos-json-textarea');
    const dialog = getEl('logos-json-dialog');
    if (!textarea || !dialog) return;
    try {
      const text = textarea.value.trim();
      const parsed = JSON.parse(text);
      setStatus('Enregistrement du JSON en vrac...');
      const res = await req(SURL + '/admin/custom-logos/bulk', {
        method: 'POST',
        body: JSON.stringify({ data: parsed })
      });
      customLogosList = Array.isArray(res && res.logos) ? res.logos : [];
      renderCustomLogosList();
      const countEl = getEl('logos-custom-count');
      if (countEl) countEl.textContent = '(' + customLogosList.length + ')';
      dialog.close();
      setStatus('✨ Fichier custom-logos.json mis à jour avec succès sur le VPS.');
    } catch (e) {
      alert('Erreur de format JSON : ' + e.message);
    }
  }

  // Global listeners
  document.addEventListener('click', function(e) {
    if (e.target && e.target.closest('#settings-tab-btn-logos, [data-settings-tab="logos"]')) {
      showLogosTab();
      return;
    }
    if (e.target && e.target.closest('#logos-btn-auto-sync')) {
      syncAllChannelLogos();
      return;
    }
    if (e.target && e.target.closest('#logos-btn-upload')) {
      e.preventDefault();
      const fileInp = getEl('logos-input-file');
      if (fileInp) fileInp.click();
      return;
    }
    if (e.target && e.target.closest('#logos-btn-reset-form')) {
      resetForm();
      return;
    }
    if (e.target && e.target.closest('#logos-btn-open-json')) {
      openJsonEditor();
      return;
    }
    if (e.target && (e.target.closest('#logos-json-close') || e.target.closest('#logos-json-cancel'))) {
      const d = getEl('logos-json-dialog');
      if (d) d.close();
      return;
    }
    if (e.target && e.target.closest('#logos-json-save')) {
      saveJsonEditor();
      return;
    }
    const editBtn = e.target && e.target.closest('[data-edit-logo]');
    if (editBtn) {
      editLogo(editBtn.dataset.editLogo);
      return;
    }
    const delBtn = e.target && e.target.closest('[data-delete-logo]');
    if (delBtn) {
      deleteLogo(delBtn.dataset.deleteLogo);
      return;
    }
    const testBtn = e.target && e.target.closest('[data-test-logo]');
    if (testBtn) {
      testMatch(testBtn.dataset.testLogo);
      return;
    }
    const addFromTest = e.target && e.target.closest('#logos-btn-add-from-test');
    if (addFromTest) {
      const name = addFromTest.dataset.name;
      if (name) {
        resetForm();
        const inputName = getEl('logos-input-name');
        if (inputName) inputName.value = name;
        const formEl = getEl('logos-form');
        if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const inputUrl = getEl('logos-input-url');
        if (inputUrl) inputUrl.focus();
      }
      return;
    }
  });

  document.addEventListener('input', function(e) {
    if (e.target && e.target.id === 'logos-input-url') {
      updatePreview(e.target.value);
    }
    if (e.target && e.target.id === 'logos-custom-search') {
      renderCustomLogosList();
    }
    if (e.target && e.target.id === 'logos-test-input') {
      const val = e.target.value;
      clearTimeout(window.__veloraLogoTestTimer);
      window.__veloraLogoTestTimer = setTimeout(function() { runTestMatch(val); }, 350);
    }
  });

  document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'logos-input-file') {
      const file = e.target.files && e.target.files[0];
      if (file) {
        uploadLogoFile(file);
      }
      e.target.value = '';
      return;
    }
    if (e.target && e.target.id === 'logos-tab-channels-only') {
      toggleChannelsOnly(e.target.checked);
    }
    if (e.target && e.target.id === 'logos-tab-packages-only') {
      togglePackagesOnly(e.target.checked);
    }
  });

  document.addEventListener('submit', function(e) {
    if (e.target && e.target.id === 'logos-form') {
      handleFormSubmit(e);
    }
    if (e.target && e.target.id === 'logos-test-form') {
      e.preventDefault();
      const inp = getEl('logos-test-input');
      runTestMatch(inp ? inp.value : '');
    }
  });

  // Drag & drop onto preview zone
  document.addEventListener('dragover', function(e) {
    const dropZone = e.target && e.target.closest('.vel-logos-form-preview');
    if (dropZone) {
      e.preventDefault();
      dropZone.style.borderColor = '#8b5cf6';
    }
  });

  document.addEventListener('dragleave', function(e) {
    const dropZone = e.target && e.target.closest('.vel-logos-form-preview');
    if (dropZone) {
      dropZone.style.borderColor = '';
    }
  });

  document.addEventListener('drop', function(e) {
    const dropZone = e.target && e.target.closest('.vel-logos-form-preview');
    if (dropZone) {
      e.preventDefault();
      dropZone.style.borderColor = '';
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        uploadLogoFile(files[0]);
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      loadLogoToggles();
      loadCustomLogos();
    }, { once: true });
  } else {
    loadLogoToggles();
    loadCustomLogos();
  }
})();