(function () {
  const { tables, features, square, viewBox, park } = window.NoKingsLayout;
  const [vx, vy, vw, vh] = viewBox;
  const REFRESH_MS = 2 * 60 * 1000;

  const CATEGORY_NAMES = { info: 'Info booth', org: 'Group', ballot: 'Ballot measures', aid: 'Mutual aid' };
  const FEATURE_LABELS = {
    stage: ['Stage'],
    art: ['Art'],
    medic: ['+'],
    training: ['Petition', 'Signature', 'Training'],
    data: ['Data', 'center'],
    restrooms: ['Restrooms'],
  };

  // Leaflet's flat map mode: latitude is -y, longitude is x, in reference-photo pixels.
  const ll = (x, y) => L.latLng(-y, x);
  const box = (x, y, w, h) => L.latLngBounds(ll(x, y + h), ll(x + w, y));
  const css = getComputedStyle(document.documentElement);
  const color = name => css.getPropertyValue('--' + name).trim();
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const map = L.map('map', { crs: L.CRS.Simple, zoomSnap: 0.25, zoomDelta: 0.5, minZoom: -4, maxZoom: 2 });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  map.createPane('park').style.zIndex = 200;
  map.createPane('booths').style.zIndex = 410;
  const labelsPane = map.createPane('labels');
  labelsPane.style.zIndex = 420;
  labelsPane.classList.add('labels-pane');
  const renderer = L.svg({ pane: 'booths', padding: 0.5 });

  L.imageOverlay('park.svg', box(vx, vy, vw, vh), {
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

  // Turn a photo-pixel spot into its squared-up map position.
  function sq({ x, y, r = 0 }) {
    const a = square.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const [cx, cy] = square.center, dx = x - cx, dy = y - cy;
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c, r: r + square.angle };
  }

  function corners(spot) {
    const { x, y, r } = sq(spot), { w, h } = spot;
    const a = r * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
      .map(([dx, dy]) => ll(x + dx * c - dy * s, y + dx * s + dy * c));
  }

  function textLines(x, y, lines, cls, lineHeight) {
    const top = y - (lines.length - 1) * lineHeight / 2;
    return lines.map((line, i) => `<text class="${cls}" x="${x}" y="${top + i * lineHeight}">${esc(line)}</text>`).join('');
  }

  // Fixed features: always shown, drawn once.
  let featureLabels = '';
  for (const f of features) {
    const medic = f.id === 'medic';
    L.polygon(corners(f), {
      renderer,
      color: medic ? '#d32f2f' : '#fff',
      weight: medic ? 2.5 : 1.5,
      fillColor: color(f.id),
      fillOpacity: 1,
    }).bindPopup(`<h2>${esc(f.name)}</h2>${f.note ? `<p>${esc(f.note)}</p>` : ''}`).addTo(map);
    const lines = FEATURE_LABELS[f.id] || [f.name];
    const p = sq(f);
    featureLabels += medic
      ? `<text class="big" style="fill:#d32f2f" x="${p.x}" y="${p.y}">+</text>`
      : textLines(p.x, p.y, lines, `feat ${f.id}`, 12);
  }

  // Booths from the sheet: redrawn whenever the sheet changes.
  const booths = L.layerGroup().addTo(map);
  const boothByTable = {};
  let lastData = '';

  function popupHtml(g) {
    let host = '';
    try { host = new URL(g.website).hostname.replace(/^www\./, ''); } catch { /* no website */ }
    return `<h2>${esc(g.name)}</h2>`
      + `<p class="pop-meta"><span class="chip ${g.category}"></span>Table ${esc(g.table)} &middot; ${CATEGORY_NAMES[g.category]}</p>`
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
      const c = color(g.category);
      boothByTable[g.table] = L.polygon(corners(spot), {
        renderer, color: '#fff', weight: 1.5, fillColor: c, fillOpacity: 1,
      }).bindPopup(popupHtml(g)).addTo(booths);
      const p = sq(spot);
      labels += `<text class="${spot.w > 40 ? 'big' : 'num'}" x="${p.x}" y="${p.y}">${esc(g.table)}</text>`;
    }
    labelsSvg.innerHTML = featureLabels + labels;
  }

  const status = document.getElementById('status');
  let lastLoad = 0;

  async function refresh() {
    lastLoad = Date.now();
    try {
      const { groups, source, at } = await window.NoKingsData.loadGroups();
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
      + item('info', 'Info booths') + item('org', 'Groups') + item('ballot', 'Ballot measures') + item('aid', 'Mutual aid')
      + features.map((f, i) => item(f.id, f.name, i === 0 ? 'gap' : '')).join('')
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
