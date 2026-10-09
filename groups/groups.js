// Groups list: same sheet as the map. Search, sort, and links to each spot.
// The entry's markup lives in the #group-entry template. This file only fills its data-field slots.
(function () {
  const { loadGroups, CATEGORIES } = window.NoKingsData;
  const REFRESH_MS = 2 * 60 * 1000;
  const entryTemplate = document.getElementById('group-entry');

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

  function slot(node, name) {
    const el = node.querySelector('[data-field="' + name + '"]');
    if (!el) throw new Error('Group template is missing data-field="' + name + '"');
    return el;
  }

  function fillEntry(g, id) {
    const node = entryTemplate.content.firstElementChild.cloneNode(true);
    const cat = CATEGORIES[g.category] || CATEGORIES.org;
    const host = hostOf(g.website);
    node.id = id;
    slot(node, 'name').textContent = g.name;
    slot(node, 'chip').classList.add('cat-' + (CATEGORIES[g.category] ? g.category : 'org'));
    slot(node, 'table').textContent = g.table;
    slot(node, 'category').textContent = cat.label;
    const description = slot(node, 'description');
    if (g.description) description.textContent = g.description;
    else description.remove();
    const website = slot(node, 'website');
    if (host) {
      website.href = g.website;
      website.textContent = host;
    } else website.remove();
    slot(node, 'map').href = '../map/#table-' + encodeURIComponent(g.table);
    return node;
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
    list.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = groups.length ? 'No groups match that search.' : 'No groups are listed yet.';
      list.append(empty);
    } else {
      for (const g of rows) list.append(fillEntry(g, entryId(g.table, used)));
    }
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
