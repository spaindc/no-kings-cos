// Reads the list of groups from the Google Sheet. Falls back to backup.csv (same folder as this file)
// if Google can't be reached. Columns are found by header name, so adding or reordering columns is safe.
(function () {
  const SHEET_ID = '1ERqVExjKtiGJWD8l27ccgtYYMivZpuAjKsb5PActKG4';
  const SOURCES = [
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Sheet1`,
  ];
  const BACKUP = new URL('backup.csv', document.currentScript.src).href;

  const CATEGORIES = {
    'info': 'info',
    'org': 'org',
    'ballot measures': 'ballot',
    'mutual aid': 'aid',
  };

  const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
  const key = s => clean(s).toLowerCase();

  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function toGroups(text) {
    const rows = parseCSV(text.replace(/^\uFEFF/, ''));
    const header = (rows[0] || []).map(key);
    const col = name => header.indexOf(name);
    const c = {
      table: col('table number'), name: col('name'), description: col('description'),
      website: col('website'), category: col('category'), active: col('active'),
    };
    if (c.table < 0 || c.name < 0 || c.active < 0) {
      throw new Error('Sheet is missing a "Table Number", "Name" or "Active" column');
    }
    const get = (r, i) => (i < 0 ? '' : clean(r[i]));
    const groups = [];
    for (const r of rows.slice(1)) {
      const name = get(r, c.name).replace(/\.$/, '').trim();
      const active = ['true', 'yes', 'y', '1', 'x'].includes(key(get(r, c.active)));
      if (!name || !active) continue;
      let website = get(r, c.website);
      if (website && !/^https?:\/\//i.test(website)) website = 'https://' + website;
      groups.push({
        table: get(r, c.table),
        name,
        description: get(r, c.description),
        website,
        category: CATEGORIES[key(get(r, c.category))] || 'org',
      });
    }
    return groups;
  }

  async function fetchCSV(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} from ${url}`);
    if (!/csv/i.test(res.headers.get('Content-Type') || '')) throw new Error(`Not a CSV: ${url}`);
    return res.text();
  }

  async function loadGroups() {
    for (const url of SOURCES) {
      try {
        return { groups: toGroups(await fetchCSV(url)), source: 'live', at: new Date() };
      } catch (err) {
        console.warn('Sheet read failed, trying next source:', err);
      }
    }
    return { groups: toGroups(await fetchCSV(BACKUP)), source: 'backup', at: new Date() };
  }

  window.NoKingsData = { loadGroups };
})();
