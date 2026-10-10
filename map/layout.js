// Where everything sits on the map: shapes only, no colors or styling (those live in map.css).
// Coordinates are the same as park.svg: x to the right, y down, about 7 per meter.
// Each spot is a polygon (`points`); its number or name is drawn at `label` (default: the middle).
// Spots keep about 4 clear of path edges: main paths are 24 wide, so a spot's edge sits 16-17 from a
// path's centerline. `building: true` marks a spot that is a real building (the bandshell), which may touch paths.
// Check the layout after any change: node private/work/check.mjs
(function () {
  const PLAZA = [490, 515.3]; // where the four diagonals cross
  const LONG = 44;            // regular table, along the path
  const DEEP = 48;            // regular table, away from the path
  const OFF = 12 + 5 + DEEP / 2;

  function rect(cx, cy, w, h, deg = 0) {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
      .map(([dx, dy]) => [cx + dx * c - dy * s, cy + dx * s + dy * c]);
  }

  // A regular table t along a diagonal from the plaza, on one side of it (+1 = right of travel, -1 = left).
  function onDiagonal(deg, t, side) {
    const a = deg * Math.PI / 180;
    const x = PLAZA[0] + t * Math.cos(a) - side * OFF * Math.sin(a);
    const y = PLAZA[1] + t * Math.sin(a) + side * OFF * Math.cos(a);
    return { points: rect(x, y, LONG, DEEP, deg) };
  }
  const NE = -45, SE = 45;

  const EAST_X = 933 - OFF;   // Nevada-side walk
  const NORTH_Y = 75.5 - OFF; // Platte-side walk
  const eastEdge = y => ({ points: rect(EAST_X, y, DEEP, LONG) });
  const northEdge = x => ({ points: rect(x, NORTH_Y, LONG, DEEP) });

  const tables = {};

  // Info booths: matching triangles in the west and east wedges of the plaza.
  tables[1] = { big: true, points: [[467.4, 515.3], [415, 462.9], [415, 567.7]] };
  tables[2] = { big: true, points: [[512.6, 515.3], [565, 462.9], [565, 567.7]] };

  // Southeast diagonal: 3-6 on the east side, 7-11 on the west side.
  [[3, 150], [4, 255], [5, 303], [6, 405]].forEach(([n, t]) => { tables[n] = onDiagonal(SE, t, -1); });
  // The medic tent is the first spot on the west side (see features).
  [7, 8, 9, 10, 11].forEach((n, i) => { tables[n] = onDiagonal(SE, 254 + i * 54.5, 1); });

  // East edge along Nevada, south to north.
  [[12, 715], [13, 660], [14, 520], [15, 395], [16, 347], [17, 270]].forEach(([n, y]) => { tables[n] = eastEdge(y); });

  // Northeast corner: 19 between the Platte walk and the diagonal; 18 under the spur to Nevada.
  tables[19] = { big: true, points: [[812, 91.5], [892.5, 91.5], [812, 172]] };
  tables[18] = { big: true, points: [[853.2, 176], [917, 176], [917, 215], [814.2, 215]], label: [878, 196] };

  // Northeast diagonal. 19 side (northwest of the path): 20 at the top down to 26.
  [20, 21, 22, 23, 24, 25, 26].forEach((n, i) => { tables[n] = onDiagonal(NE, 443 - i * 54, -1); });
  // 18 side (southeast of the path): 30 at the top down to 27. The old 31 and 32 spots are the mutual aid area.
  [27, 28, 29, 30].forEach((n, i) => { tables[n] = onDiagonal(NE, 118 + i * 59, 1); });

  // North edge, left to right: 34, 33, 32, 31. Same ground as the old 36, 35, 34, 33.
  [[34, 598], [33, 646], [32, 809], [31, 857]].forEach(([n, x]) => { tables[n] = northEdge(x); });

  const features = [
    {
      id: 'stage', name: 'Bandshell stage', note: 'Performers', lines: ['Stage'], building: true,
      points: [[447, 828], [546, 828], [546, 854], [530, 854], [530, 906], [462, 906], [462, 854], [447, 854]],
      label: [496, 872],
    },
    {
      id: 'art', name: 'Art project', note: 'Index-card protest signs and the VOTE sign', lines: ['Art'],
      points: [[318, 738], [412, 738], [412, 888], [280, 888], [310, 820]],
    },
    {
      id: 'aid', name: 'Mutual aid', note: 'Collection point. Migra Watch is at table 19.', lines: ['Mutual', 'aid'],
      // Rectangle in the lawn of the marked box: off the diagonal path, short of table 30 and the Nevada tables.
      points: [[770, 270], [860, 270], [860, 370], [770, 370]],
    },
    { id: 'restrooms', name: 'Restrooms', note: '', lines: ['Restrooms'], points: rect(380, 919, 68, 42) },
    { id: 'medic', name: 'Medic', note: 'First aid and water', lines: ['+'], ...onDiagonal(SE, 196, 1) },
    {
      id: 'training', name: 'Petition Signature Training', note: '', lines: ['Petition', 'Training'],
      points: [[348, 308], [470, 308], [470, 414], [416, 414]],
    },
    {
      id: 'data', name: 'Data center', note: '', lines: ['Data', 'center'],
      points: [[838, 776], [915, 776], [915, 880], [879, 880], [838, 839]],
      label: [878, 822],
    },
  ];

  const middle = pts => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  for (const spot of [...Object.values(tables), ...features]) spot.label = spot.label || middle(spot.points);

  // Round convex corners inward. Straight edges stay put, so a spot does not move.
  // Reflex corners (the bandshell's steps) are left sharp so the outline cannot grow.
  function roundCorners(points, radius) {
    const n = points.length;
    let area = 0;
    for (let i = 0; i < n; i++) area += points[i][0] * points[(i + 1) % n][1] - points[(i + 1) % n][0] * points[i][1];
    const clockwise = area > 0;
    const out = [];
    const steps = 4;
    for (let i = 0; i < n; i++) {
      const prev = points[(i + n - 1) % n], curr = points[i], next = points[(i + 1) % n];
      const ix = curr[0] - prev[0], iy = curr[1] - prev[1];
      const ox = next[0] - curr[0], oy = next[1] - curr[1];
      const li = Math.hypot(ix, iy), lo = Math.hypot(ox, oy);
      const turn = ix * oy - iy * ox;
      const convex = clockwise ? turn > 1 : turn < -1;
      if (!convex || li < 1 || lo < 1) { out.push(curr); continue; }
      const ux = -ix / li, uy = -iy / li, wx = ox / lo, wy = oy / lo;
      const theta = Math.acos(Math.max(-1, Math.min(1, ux * wx + uy * wy)));
      if (theta < 0.25 || theta > Math.PI - 0.08) { out.push(curr); continue; }
      const t = Math.min(radius / Math.tan(theta / 2), li * 0.45, lo * 0.45);
      const r = t * Math.tan(theta / 2);
      if (r < 1.5) { out.push(curr); continue; }
      const p1 = [curr[0] + ux * t, curr[1] + uy * t];
      const p2 = [curr[0] + wx * t, curr[1] + wy * t];
      const bl = Math.hypot(ux + wx, uy + wy);
      const cx = curr[0] + (ux + wx) / bl * (r / Math.sin(theta / 2));
      const cy = curr[1] + (uy + wy) / bl * (r / Math.sin(theta / 2));
      const a1 = Math.atan2(p1[1] - cy, p1[0] - cx);
      let sweep = Math.atan2(p2[1] - cy, p2[0] - cx) - a1;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      const want = Math.PI - theta;
      if (Math.abs(Math.abs(sweep) - want) > 0.35) sweep += sweep > 0 ? -2 * Math.PI : 2 * Math.PI;
      out.push(p1);
      for (let s = 1; s < steps; s++) {
        const a = a1 + sweep * (s / steps);
        out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      out.push(p2);
    }
    return out.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  }
  for (const spot of Object.values(tables)) spot.points = roundCorners(spot.points, 10);
  for (const spot of features) spot.points = roundCorners(spot.points, spot.id === 'stage' ? 6 : 10);

  window.NoKingsLayout = { tables, features, viewBox: [-120, -120, 1300, 1240], park: [-10, -30, 990, 1030] };
})();
