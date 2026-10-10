// Map behavior: draws the spots from layout.js, fills booths from the sheet, popups, legend, refresh.
// No styling here: everything visual is a class styled in map.css (booth, cat-*, feature, feat-*, label).
// Booth popup markup lives in the #booth-popup template. This file only fills its data-field slots.
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
  // Opening frame is the part of the park with the tables, stage, and the City Hall arrow.
  map.fitBounds(box(240, 10, 930, 1000), { padding: [12, 12] });

  const labelsSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  labelsSvg.setAttribute('viewBox', viewBox.join(' '));
  labelsSvg.classList.add('labels');
  L.svgOverlay(labelsSvg, box(vx, vy, vw, vh), { pane: 'labels', interactive: false }).addTo(map);

  const spotLayer = (spot, className) => L.polygon(spot.points.map(ll), { renderer, className });

  function textLines([x, y], lines, cls, lineHeight = 12) {
    const top = y - (lines.length - 1) * lineHeight / 2;
    return lines.map((line, i) => `<text class="${cls}" x="${x}" y="${top + i * lineHeight}">${esc(line)}</text>`).join('');
  }

  // A named place with an icon in the sprite sits the mark above its words.
  function featureLabel(f) {
    const lines = f.lines || [f.name];
    const cls = `label feat-label feat-${f.id}`;
    if (!document.getElementById('icon-' + f.id)) return textLines(f.label, lines, cls, 22);
    const [x, y] = f.label;
    const size = 24;
    const gap = 3;
    const textH = (lines.length - 1) * 12;
    const top = y - (size + gap + textH) / 2;
    return `<use href="#icon-${f.id}" x="${x - size / 2}" y="${top}" width="${size}" height="${size}" class="place-icon"/>`
      + textLines([x, top + size + gap + textH / 2], lines, cls);
  }

  // Fixed features: always shown, drawn once.
  let featureLabels = '';
  for (const f of features) {
    spotLayer(f, `feature feat-${f.id}`)
      .bindPopup(`<h2>${esc(f.name)}</h2>${f.note ? `<p>${esc(f.note)}</p>` : ''}`)
      .addTo(map);
    featureLabels += featureLabel(f);
  }

  // Booths from the sheet: redrawn whenever the sheet changes.
  const booths = L.layerGroup().addTo(map);
  const boothByTable = {};
  let lastData = '';

  const popupTemplate = document.getElementById('booth-popup');

  function popupSlot(node, name) {
    const el = node.querySelector('[data-field="' + name + '"]');
    if (!el) throw new Error('Popup template is missing data-field="' + name + '"');
    return el;
  }

  function popupElement(g) {
    const node = popupTemplate.content.firstElementChild.cloneNode(true);
    const cat = CATEGORIES[g.category] || CATEGORIES.org;
    let host = '';
    try { host = new URL(g.website).hostname.replace(/^www\./, ''); } catch { /* no website */ }
    popupSlot(node, 'name').textContent = g.name;
    popupSlot(node, 'chip').classList.add('cat-' + (CATEGORIES[g.category] ? g.category : 'org'));
    popupSlot(node, 'table').textContent = g.table;
    popupSlot(node, 'category').textContent = cat.label;
    const description = popupSlot(node, 'description');
    if (g.description) description.textContent = g.description;
    else description.remove();
    const website = popupSlot(node, 'website');
    if (host) {
      website.href = g.website;
      website.textContent = host;
    } else website.parentElement.remove();
    popupSlot(node, 'groups').href = '../groups/#table-' + encodeURIComponent(g.table);
    return node;
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
      boothByTable[g.table] = spotLayer(spot, `booth cat-${g.category}`).bindPopup(popupElement(g)).addTo(booths);
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
        fillLegend(groups);
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
  let legendEl;
  function fillLegend(groups) {
    const used = groups ? new Set(groups.map(g => g.category)) : null;
    const cats = Object.entries(CATEGORIES).filter(([key]) => !used || used.has(key));
    const words = text => text.replace(/\S+/g, word => word.charAt(0).toUpperCase() + word.slice(1));
    const item = (cls, text) => `<li><span class="chip ${cls}"></span>${esc(words(text))}</li>`;
    const open = legendEl.open;
    legendEl.innerHTML = '<summary>Legend</summary><ul>'
      + cats.map(([key, c]) => item(`cat-${key}`, c.legend)).join('')
      + features.map(f => item(`feat-${f.id}`, f.legend || f.name)).join('')
      + '</ul>';
    legendEl.open = open;
  }
  legend.onAdd = () => {
    legendEl = L.DomUtil.create('details', 'legend');
    legendEl.open = window.innerWidth >= 700;
    fillLegend(null);
    L.DomEvent.disableClickPropagation(legendEl);
    L.DomEvent.disableScrollPropagation(legendEl);
    return legendEl;
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
