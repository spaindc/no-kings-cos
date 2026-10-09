// Where everything sits on the map. Coordinates are pixels in the 977x1024 reference photo of the
// marked-up park (the same grid park.svg is drawn in): x to the right, y down. Sizes are in the same
// pixels, about 7 per meter. r is rotation in degrees, clockwise.
(function () {
  const STD = 30;
  const GRID = 2.2; // the street grid is turned slightly from north

  const PLAZA = [490, 515];
  const NE_PATH = -42.6;
  const SE_PATH = 47.2;

  // A spot t pixels along a path from the plaza, `side` pixels off it (positive = to the right of travel).
  function along(angle, t, side) {
    const a = angle * Math.PI / 180;
    return [
      PLAZA[0] + t * Math.cos(a) - side * Math.sin(a),
      PLAZA[1] + t * Math.sin(a) + side * Math.cos(a),
    ];
  }
  const northEdge = x => [x, 64.5 + (x - 193.6) * 0.0363 - 30];
  const eastEdge = y => [947.4 - (y - 178.9) * 0.042 - 30, y];

  const tables = {};
  const put = (n, [x, y], r, w = STD, h = STD) => { tables[n] = { x, y, w, h, r }; };

  put(1, [447, 528], GRID, 52, 48);
  put(2, [512, 540], GRID, 52, 48);

  // Southeast path: 3-6 on the east side, 7-11 on the west side.
  put(3, along(SE_PATH, 205, -36), SE_PATH);
  put(4, along(SE_PATH, 299, -36), SE_PATH);
  put(5, along(SE_PATH, 340, -36), SE_PATH);
  put(6, along(SE_PATH, 417, -36), SE_PATH);
  [7, 8, 9, 10, 11].forEach((n, i) => put(n, along(SE_PATH, 272 + i * 50, 30), SE_PATH));

  // East edge along Nevada, south to north.
  put(12, eastEdge(660), GRID);
  put(13, eastEdge(610), GRID);
  put(14, eastEdge(515), GRID);
  put(15, eastEdge(377), GRID);
  put(16, eastEdge(342), GRID);
  put(17, eastEdge(280), GRID);

  // Northeast path: 18 and 19 on the corners where it meets the spur to Nevada.
  put(18, [885, 205], NE_PATH, 44, 44);
  put(19, [838, 128], NE_PATH, 44, 44);
  // 19 side (northwest of the path): 20 at the top down to 26.
  [20, 21, 22, 23, 24, 25, 26].forEach((n, i) => put(n, along(NE_PATH, 467 - i * 51.2, -30), NE_PATH));
  // 18 side (southeast of the path): 32 at the top down to 27.
  [27, 28, 29, 30, 31, 32].forEach((n, i) => put(n, along(NE_PATH, 156 + i * 45.6, 30), NE_PATH));

  // North edge, left to right: 36, 35, 34, 33.
  put(36, northEdge(617), GRID);
  put(35, northEdge(665), GRID);
  put(34, northEdge(827), GRID);
  put(33, northEdge(863), GRID);

  const features = [
    { id: 'stage', name: 'Bandshell stage', note: 'Performers', x: 484, y: 864, w: 92, h: 70, r: GRID },
    { id: 'art', name: 'Art project', note: 'Index-card protest signs and the VOTE sign', x: 370, y: 828, w: 68, h: 92, r: GRID },
    { id: 'medic', name: 'Medic', note: 'First aid and water', x: 595, y: 720, w: 40, h: 30, r: SE_PATH },
    { id: 'training', name: 'Petition Signature Training', note: '', x: 462, y: 366, w: 62, h: 58, r: GRID },
    { id: 'data', name: 'Data center', note: '', x: 880, y: 835, w: 54, h: 84, r: SE_PATH },
    { id: 'restrooms', name: 'Restrooms', note: '', x: 372, y: 922, w: 56, h: 28, r: GRID },
  ];

  // The map is drawn turned by `angle` degrees around `center` so the street grid runs straight
  // up and across. Positions above stay in photo pixels; map.js and park.svg apply the turn.
  const square = { angle: -2.25, center: PLAZA };

  window.NoKingsLayout = { tables, features, square, viewBox: [-120, -120, 1300, 1240], park: [-10, -40, 990, 1030] };
})();
