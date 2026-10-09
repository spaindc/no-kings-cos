// Map behavior: draws the spots from layout.js, fills booths from the sheet, popups, legend, refresh.
// No styling here: everything visual is a class styled in map.css (booth, cat-*, feature, feat-*, label).
(function () {
  const { tables, features, viewBox, park } = window.NoKingsLayout;
  const { loadGroups, CATEGORIES } = window.NoKingsData;
  const [vx, vy, vw, vh] = viewBox;
  const REFRESH_MS = 2 * 60 * 1000;

  // Leaflet's flat map mode: latitude is -y, longitude is x.
  const ll = ([x, y]) => L.latLng(-y, x);
  const box = (x, y, w, h) => L.latLngBounds(ll([x, y + h]), ll([x + w, y]));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const map = L.map('map', { crs: L.CRS.Simple, zoomSnap: 0.25, zoomDelta: 0.5, minZoom: -4, maxZoom: 2 });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  map.createPane('park').style.zIndex = 200;
  map.createPane('spots').style.zIndex = 410;
  const labelsPane = map.createPane('labels');
  labelsPane.style.zIndex = 420;
  labelsPane.classList.add('labels-pane');
  const renderer = L.svg({ pane: 'spots', padding: 0.5 });

  L.imageOverlay('park.svg' + new URL(document.currentScript.src).search, box(vx, vy, vw, vh), {
    pane: 'park',
    attribution: 'Park drawing from &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const parkBox = box(park[0], park[1], park[2] - park[0], park[3] - park[1]);
  map.fitBounds(parkBox);
  map.setMinZoom(map.getZoom() - 0.5);
  map.setMaxBounds(box(vx, vy, vw, vh));

  const labelsSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  labelsSvg.setAttribute('viewBox', viewBox.join(' '));
  labelsSvg.classList.add('labels');
  L.svgOverlay(labelsSvg, box(vx, vy, vw, vh), { pane: 'labels', interactive: false }).addTo(map);

  const spotLayer = (spot, className) => L.polygon(spot.points.map(ll), { renderer, className });

  function textLines([x, y], lines, cls, lineHeight = 12) {
    const top = y - (lines.length - 1) * lineHeight / 2;
    return lines.map((line, i) => `<text class="${cls}" x="${x}" y="${top + i * lineHeight}">${esc(line)}</text>`).join('');
  }

  // Fixed features: always shown, drawn once.
  let featureLabels = '';
  for (const f of features) {
    spotLayer(f, `feature feat-${f.id}`)
      .bindPopup(`<h2>${esc(f.name)}</h2>${f.note ? `<p>${esc(f.note)}</p>` : ''}`)
      .addTo(map);
    featureLabels += textLines(f.label, f.lines || [f.name], `label feat-label feat-${f.id}`);
  }

  // Booths from the sheet: redrawn whenever the sheet changes.
  const booths = L.layerGroup().addTo(map);
  const boothByTable = {};
  let lastData = '';

  function popupHtml(g) {
    let host = '';
    try { host = new URL(g.website).hostname.replace(/^www\./, ''); } catch { /* no website */ }
    return `<h2>${esc(g.name)}</h2>`
      + `<p class="pop-meta"><span class="chip cat-${g.category}"></span>Table ${esc(g.table)} &middot; ${esc(CATEGORIES[g.category].label)}</p>`
      + (g.description ? `<p>${esc(g.description)}</p>` : '')
      + (host ? `<p><a href="${esc(g.website)}" target="_blank" rel="noopener">${esc(host)}</a></p>` : '');
  }

  function drawBooths(groups) {
    booths.clearLayers();
    for (const k of Object.keys(boothByTable)) delete boothByTable[k];
    let labels = '';
    for (const g of groups) {
      const spot = tables[g.table];
      if (!spot) {
        console.warn(`No spot on the map for table "${g.table}" (${g.name})`);
        continue;
      }
      if (boothByTable[g.table]) console.warn(`Table ${g.table} is listed twice; showing ${g.name}`);
      boothByTable[g.table] = spotLayer(spot, `booth cat-${g.category}`).bindPopup(popupHtml(g)).addTo(booths);
      labels += textLines(spot.label, [g.table], `label table-label${spot.big ? ' big' : ''}`);
    }
    labelsSvg.innerHTML = featureLabels + labels;
  }

  const status = document.getElementById('status');
  let lastLoad = 0;

  async function refresh() {
    lastLoad = Date.now();
    try {
      const { groups, source, at } = await loadGroups();
      const data = JSON.stringify(groups);
      if (data !== lastData) {
        lastData = data;
        drawBooths(groups);
      }
      const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      status.textContent = source === 'live' ? `Updated ${time}` : `Showing saved list (couldn't reach the sheet, ${time})`;
      status.classList.toggle('backup', source !== 'live');
    } catch (err) {
      console.error(err);
      status.textContent = "Couldn't load the list of groups.";
      status.classList.add('backup');
    }
  }

  function openFromHash() {
    const m = location.hash.match(/^#table-(.+)$/);
    const booth = m && boothByTable[decodeURIComponent(m[1])];
    if (booth) {
      map.setView(booth.getCenter(), Math.max(map.getZoom(), 0.5));
      booth.openPopup();
    }
  }

  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = () => {
    const el = L.DomUtil.create('details', 'legend');
    el.open = window.innerWidth >= 700;
    const item = (cls, text, extra = '') => `<li class="${extra}"><span class="chip ${cls}"></span>${esc(text)}</li>`;
    el.innerHTML = '<summary>Legend</summary><ul>'
      + Object.entries(CATEGORIES).map(([key, c]) => item(`cat-${key}`, c.legend)).join('')
      + features.map((f, i) => item(`feat-${f.id}`, f.name, i === 0 ? 'gap' : '')).join('')
      + '</ul>';
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    return el;
  };
  legend.addTo(map);

  labelsSvg.innerHTML = featureLabels;
  refresh().then(openFromHash);
  window.addEventListener('hashchange', openFromHash);
  setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastLoad > 30 * 1000) refresh();
  });
})();
