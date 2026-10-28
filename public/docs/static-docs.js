(() => {
  'use strict';

  const search = document.querySelector('#search');
  const status = document.querySelector('#search-status');
  const endpoints = [...document.querySelectorAll('.endpoint')];
  const groups = [...document.querySelectorAll('.endpoint-group')];
  const guides = [...document.querySelectorAll('.guide, #overview, .intro-grid, #download-connector')];
  const menu = document.querySelector('.menu-toggle');
  const sidebar = document.querySelector('#sidebar');
  const toast = document.querySelector('#toast');
  let toastTimer;
  let beforeSearch;
  const mobileViewport = matchMedia('(max-width: 800px)');

  function updateNavAccessibility() {
    const hidden = mobileViewport.matches && !document.body.classList.contains('nav-open');
    sidebar.inert = hidden;
    sidebar.setAttribute('aria-hidden', String(hidden));
  }
  updateNavAccessibility();

  function announce(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2400);
  }

  function closeMenu(restoreFocus = false) {
    document.body.classList.remove('nav-open');
    menu.setAttribute('aria-expanded', 'false');
    updateNavAccessibility();
    if (restoreFocus) menu.focus();
  }

  menu.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    menu.setAttribute('aria-expanded', String(open));
    updateNavAccessibility();
    if (open) sidebar.querySelector('a').focus();
  });
  document.querySelector('.nav-backdrop').addEventListener('click', () => closeMenu(true));
  mobileViewport.addEventListener('change', (event) => {
    if (!event.matches) closeMenu();
    updateNavAccessibility();
  });

  function filterEndpoints() {
    const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtering = words.length > 0;
    if (filtering && !beforeSearch) beforeSearch = new Set(endpoints.filter((entry) => entry.open));
    document.body.classList.toggle('searching', filtering);
    guides.forEach((guide) => { guide.hidden = filtering; });
    let count = 0;
    endpoints.forEach((endpoint) => {
      const matches = words.every((word) => endpoint.dataset.search.includes(word));
      endpoint.hidden = filtering && !matches;
      if (filtering) endpoint.open = matches;
      else if (beforeSearch) endpoint.open = beforeSearch.has(endpoint);
      if (matches) count++;
      const link = document.querySelector(`[data-endpoint-link="${endpoint.id}"]`);
      if (link) link.hidden = filtering && !matches;
    });
    groups.forEach((group) => {
      group.hidden = filtering && ![...group.querySelectorAll('.endpoint')].some((entry) => !entry.hidden);
      const nav = document.querySelector(`[data-group-link="${group.id}"]`);
      if (nav) {
        nav.hidden = group.hidden;
        if (filtering) nav.open = !group.hidden;
      }
    });
    status.hidden = !filtering;
    status.textContent = filtering ? `${count} endpoint${count === 1 ? '' : 's'} found for “${search.value.trim()}”` : '';
    document.querySelector('#no-results').hidden = !filtering || count !== 0;
    if (!filtering) beforeSearch = undefined;
  }
  search.addEventListener('input', filterEndpoints);

  function connectorApiBase(card) {
    const configured = new URL(card.dataset.apiBase);
    if (!['http:', 'https:'].includes(configured.protocol) || configured.username || configured.password) throw new Error('Invalid Connector download server.');
    const servedByApi = /^\/docs\/?$/.test(location.pathname) || location.origin === configured.origin;
    return location.protocol !== 'file:' && servedByApi ? location.origin : configured.href.replace(/\/+$/, '');
  }

  function normalizeConnectorRelease(input, architecture, apiBase) {
    if (!input || !/^\d+\.\d+\.\d+$/.test(input.version) || input.version.length > 64 || input.architecture !== architecture) throw new Error('Invalid installer details.');
    if (typeof input.filename !== 'string' || !input.filename || !Number.isSafeInteger(input.size_bytes) || input.size_bytes <= 0 || !/^[a-f0-9]{64}$/i.test(input.sha256)) throw new Error('Invalid installer details.');
    const published = new Date(input.published_at);
    if (!Number.isFinite(published.getTime()) || typeof input.download_url !== 'string') throw new Error('Invalid installer details.');
    const base = new URL(apiBase);
    const download = new URL(input.download_url, `${apiBase}/`);
    const expectedPath = `/api/v1/connector-releases/${input.version}/${architecture}/download`;
    if (!['https:', 'http:'].includes(download.protocol) || download.origin !== base.origin || download.pathname !== expectedPath || download.search || download.hash || download.username || download.password) throw new Error('Invalid installer download link.');
    return { ...input, downloadUrl: download.href, published };
  }

  async function requestConnectorRelease(apiBase, architecture, signal) {
    const url = new URL(`${apiBase}/api/v1/connector-releases/latest`);
    url.searchParams.set('arch', architecture);
    const response = await fetch(url, { credentials: 'omit', cache: 'no-store', signal, headers: { Accept: 'application/json' } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('The download server is temporarily unavailable.');
    const result = await response.json();
    if (result.success !== true) throw new Error('The download server could not find installer details.');
    return normalizeConnectorRelease(result.release, architecture, apiBase);
  }

  function renderConnectorDownload(elements, state) {
    const ready = state.status === 'ready';
    elements.card.setAttribute('aria-busy', String(state.status === 'loading'));
    elements.status.dataset.state = state.status;
    elements.status.textContent = state.message;
    elements.refresh.disabled = state.status === 'loading';
    elements.refresh.textContent = state.status === 'error' ? 'Try again' : 'Check again';
    elements.details.hidden = !ready;
    elements.download.hidden = !ready;
    elements.download.removeAttribute('href');
    if (!ready) return;
    const release = state.release;
    elements.version.textContent = `v${release.version} · ${release.architecture === 'x64' ? '64-bit' : '32-bit'}`;
    elements.size.textContent = `${(release.size_bytes / (1024 * 1024)).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
    elements.published.textContent = release.published.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    elements.filename.textContent = release.filename;
    elements.sha256.textContent = release.sha256.toLowerCase();
    elements.download.href = release.downloadUrl;
    elements.download.setAttribute('download', release.filename);
  }

  function initializeConnectorDownload() {
    const card = document.querySelector('#download-connector');
    if (!card) return;
    const elements = {
      card, architecture: card.querySelector('#connector-architecture'), refresh: card.querySelector('#connector-release-refresh'),
      status: card.querySelector('#connector-release-status'), details: card.querySelector('#connector-release-details'),
      download: card.querySelector('#connector-installer-download'), version: card.querySelector('#connector-release-version'),
      size: card.querySelector('#connector-release-size'), published: card.querySelector('#connector-release-published'),
      filename: card.querySelector('#connector-release-filename'), sha256: card.querySelector('#connector-release-sha256'),
    };
    let activeRequest;
    let requestNumber = 0;
    async function refresh() {
      activeRequest?.abort();
      activeRequest = new AbortController();
      const controller = activeRequest;
      const current = ++requestNumber;
      const architecture = elements.architecture.value;
      const label = architecture === 'x64' ? '64-bit Windows' : '32-bit Windows';
      renderConnectorDownload(elements, { status: 'loading', message: `Checking the latest ${label} installer…` });
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const release = await requestConnectorRelease(connectorApiBase(card), architecture, controller.signal);
        if (current !== requestNumber) return;
        renderConnectorDownload(elements, release ? { status: 'ready', release, message: 'The latest installer is ready to download.' } : { status: 'empty', message: `No ${label} installer has been published yet. Check again after the next release.` });
      } catch (error) {
        if (current !== requestNumber) return;
        renderConnectorDownload(elements, { status: 'error', message: error.name === 'AbortError' ? 'The download server took too long to respond. Try again.' : 'Installer details could not be loaded. Check your connection and try again.' });
      } finally {
        clearTimeout(timeout);
      }
    }
    elements.architecture.addEventListener('change', refresh);
    elements.refresh.addEventListener('click', refresh);
    refresh();
  }
  initializeConnectorDownload();

  function openHash() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    if (search.value) {
      search.value = '';
      filterEndpoints();
    }
    if (target.matches('.endpoint')) {
      target.open = true;
      const nav = document.querySelector(`[data-endpoint-link="${target.id}"]`);
      if (nav) nav.closest('details').open = true;
    }
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
    document.querySelectorAll('.sidebar a').forEach((link) => {
      const active = link.hash === location.hash;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  window.addEventListener('hashchange', openHash);
  sidebar.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      closeMenu();
      if (event.target.closest('a').hash === location.hash) openHash();
    }
  });
  if (location.hash) openHash();

  document.addEventListener('keydown', (event) => {
    const editing = event.target.matches('input, textarea, select, [contenteditable="true"]');
    if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      search.focus();
    }
    if (event.key === 'Escape') {
      if (document.body.classList.contains('nav-open')) closeMenu(true);
      else if (search.value) { search.value = ''; filterEndpoints(); search.focus(); }
      else search.blur();
    }
    if (event.key === 'Tab' && document.body.classList.contains('nav-open')) {
      const targets = [menu, ...sidebar.querySelectorAll('a:not([hidden]), summary')].filter((entry) => entry.getClientRects().length);
      const index = targets.indexOf(document.activeElement);
      const next = (index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length;
      event.preventDefault();
      targets[next].focus();
    }
  });

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(value); return; } catch { /* Use selection fallback for local files. */ }
    }
    const field = document.createElement('textarea');
    field.value = value;
    field.style.cssText = 'position:fixed;inset:0;opacity:0;pointer-events:none';
    document.body.append(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    if (!copied) throw new Error('Clipboard unavailable');
  }

  document.addEventListener('click', async (event) => {
    const tab = event.target.closest('.code-tab');
    if (tab) {
      const panel = tab.closest('.code-panel');
      panel.querySelectorAll('.code-tab').forEach((button) => {
        const selected = button === tab;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
      panel.querySelectorAll('[role="tabpanel"]').forEach((content) => {
        content.hidden = content.id !== tab.getAttribute('aria-controls');
      });
    }
    const copy = event.target.closest('.copy-button');
    if (copy) {
      const panel = copy.closest('.code-panel');
      const code = panel.querySelector('[role="tabpanel"]:not([hidden]) code, pre:not([hidden]) > code');
      try {
        await copyText(code.textContent);
        announce('Copied to clipboard');
      } catch { announce('Select the code and copy it manually.'); }
    }
    if (event.target.closest('[data-download-spec]')) {
      const data = document.querySelector('#openapi-spec').textContent;
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'flowups-tally-sync.openapi.json';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      announce('OpenAPI specification downloaded');
    }
  });

  document.addEventListener('keydown', (event) => {
    const tab = event.target.closest('.code-tab');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...tab.closest('[role="tablist"]').querySelectorAll('.code-tab')];
    let index = tabs.indexOf(tab);
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = tabs.length - 1;
    else index = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[index].click();
    tabs[index].focus();
  });

  let printState;
  window.addEventListener('beforeprint', () => {
    printState = endpoints.map((entry) => ({ entry, open: entry.open, hidden: entry.hidden }));
    endpoints.forEach((entry) => { entry.open = true; entry.hidden = false; });
    groups.forEach((entry) => { entry.hidden = false; });
    guides.forEach((entry) => { entry.hidden = false; });
  });
  window.addEventListener('afterprint', () => {
    if (!printState) return;
    printState.forEach(({ entry, open, hidden }) => { entry.open = open; entry.hidden = hidden; });
    printState = undefined;
    if (search.value) filterEndpoints();
  });
})();
