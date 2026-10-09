// Groups list: same sheet as the map. Search, sort, and links to each spot.
// No styling here: everything visual is a class styled in groups.css.
(function () {
  const { loadGroups, CATEGORIES } = window.NoKingsData;
  const REFRESH_MS = 2 * 60 * 1000;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const q = document.getElementById('q');
  const list = document.getElementById('list');
  const status = document.getElementById('status');
  const count = document.getElementById('count');
  const sortButtons = [...document.querySelectorAll('[data-sort]')];

  let groups = [];
  let sort = 'table';
  let lastData = '';
  let lastLoad = 0;
  let openedHash = false;

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  }

  function tableNum(t) {
    const n = Number(t);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  }

  function byName(a, b) {
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  }

  function matches(g, query) {
    if (!query) return true;
    const cat = CATEGORIES[g.category] ? CATEGORIES[g.category].label : '';
    const tokens = [g.name, g.description, g.table, cat, g.website].join(' ').toLowerCase().split(/[^a-z0-9]+/);
    return query.split(/\s+/).every(word => tokens.some(token => token.startsWith(word)));
  }

  function entryId(table, used) {
    const safe = String(table).replace(/[^A-Za-z0-9_-]/g, '') || 'x';
    const base = 'table-' + safe;
    used[base] = (used[base] || 0) + 1;
    return used[base] === 1 ? base : base + '-' + used[base];
  }

  function entryHtml(g, id) {
    const cat = CATEGORIES[g.category] || CATEGORIES.org;
    const host = hostOf(g.website);
    const mapHref = '../map/#table-' + encodeURIComponent(g.table);
    return `<li class="group" id="${esc(id)}">`
      + `<h2>${esc(g.name)}</h2>`
      + `<p class="meta"><span class="chip cat-${esc(g.category)}"></span>Table ${esc(g.table)} &middot; ${esc(cat.label)}</p>`
      + (g.description ? `<p class="description">${esc(g.description)}</p>` : '')
      + `<p class="actions">`
      + (host ? `<a href="${esc(g.website)}" target="_blank" rel="noopener">${esc(host)}</a>` : '')
      + `<a href="${esc(mapHref)}">Show on map</a>`
      + `</p></li>`;
  }

  // mode: 'keep' preserves scroll (a sheet refresh or typing a search), 'hash' opens the linked entry, 'top' follows a new sort.
  function render(mode) {
    const y = window.scrollY;
    const query = q.value.trim().toLowerCase();
    const rows = groups.filter(g => matches(g, query));
    rows.sort((a, b) => {
      if (sort === 'name') {
        const by = byName(a, b);
        if (by) return by;
      }
      const byTable = tableNum(a.table) - tableNum(b.table);
      return byTable || byName(a, b);
    });
    const used = {};
    list.innerHTML = rows.length
      ? rows.map(g => entryHtml(g, entryId(g.table, used))).join('')
      : `<li class="empty">${groups.length ? 'No groups match that search.' : 'No groups are listed yet.'}</li>`;
    count.textContent = query
      ? `${rows.length} of ${groups.length} groups`
      : `${groups.length} group${groups.length === 1 ? '' : 's'}`;

    // The list is built after load, so the browser's :target highlight never attaches. Mark the entry ourselves.
    const hashId = decodeURIComponent(location.hash.replace(/^#/, ''));
    const hashed = hashId && document.getElementById(hashId);
    if (hashed) hashed.classList.add('current');

    if (mode === 'hash') {
      if (hashed) hashed.scrollIntoView({ block: 'start' });
    } else if (mode === 'top') {
      window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, y);
    }
  }

  const statusLine = (source, at) => {
    const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    status.textContent = source === 'live' ? `Updated ${time}` : `Showing saved list (couldn't reach the sheet, ${time})`;
    status.classList.toggle('backup', source !== 'live');
  };

  async function refresh() {
    lastLoad = Date.now();
    try {
      const loaded = await loadGroups();
      const data = JSON.stringify(loaded.groups);
      if (data !== lastData) {
        lastData = data;
        groups = loaded.groups;
        // Only the first successful load follows a #table-N link. Later refreshes keep the scroll position.
        render(!openedHash && location.hash && !q.value ? 'hash' : 'keep');
      }
      openedHash = true;
      statusLine(loaded.source, loaded.at);
    } catch (err) {
      console.error(err);
      status.textContent = "Couldn't load the list of groups.";
      status.classList.add('backup');
    }
  }

  q.addEventListener('input', () => render('keep'));
  for (const btn of sortButtons) {
    btn.addEventListener('click', () => {
      sort = btn.dataset.sort;
      for (const b of sortButtons) b.setAttribute('aria-pressed', String(b === btn));
      render('top');
    });
  }
  window.addEventListener('hashchange', () => {
    if (!location.hash) return;
    q.value = '';
    render('hash');
  });

  refresh();
  setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastLoad > 30 * 1000) refresh();
  });
})();
