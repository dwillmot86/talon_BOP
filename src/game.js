import * as THREE from 'three';

const V3 = THREE.Vector3;
const $ = id => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');
const KEY = isTouch
  ? { fly: 'FLAP', dive: 'DIVE', act: 'ACT', sleep: 'ACT', up: 'push the stick up', skill: 'the SKILL button', brake: 'BRAKE' }
  : { fly: 'Space', dive: 'Shift', act: 'E', sleep: 'Z', up: 'hold W', skill: 'Q', brake: 'B' };

// ---------- helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = rng(20261018);
const perm = new Uint8Array(512);
{ const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
const hash = (i, j) => perm[(perm[i & 255] + j) & 255] / 255;
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(hash(xi, zi), hash(xi + 1, zi), u), lerp(hash(xi, zi + 1), hash(xi + 1, zi + 1), u), v);
}
function fbm(x, z, o = 5) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, z * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
const tA = new V3(), tB = new V3(), tC = new V3(), pv = new V3();

// ---------- which world ----------
// Each world is built once when the game loads; switching worlds reloads the page into the other world.
const WORLDS = {
  valley: { name: 'British Valley', blurb: 'Fields, woods, moors and cliffs, with a river winding through a village.', unlock: 0 },
  rainforest: { name: 'Rainforest', blurb: 'A steaming jungle river, giant trees, an ancient temple and a flat-topped mountain with a waterfall.', unlock: 3 },
  arctic: { name: 'Arctic Tundra', blurb: 'Open tundra, icy lakes, glaciers and caribou herds, with the northern lights at night.', unlock: 4 },
};
const BIOME = (() => {
  const h = (location.hash || '').match(/world-(\w+)/);
  let id = h && h[1];
  if (!WORLDS[id]) { try { id = localStorage.getItem('talon-world'); } catch (e) { } }
  return WORLDS[id] ? id : 'valley';
})();
function switchWorld(id) {
  try { localStorage.setItem('talon-world', id); } catch (e) { }
  location.hash = 'world-' + id;
  location.reload();
}

// ---------- world shape ----------
const WORLD = 3200, LIMIT = 1050;
const THIN_AIR = 450;           // above this height (sea level) the air is too thin and energy drains
const riverX = BIOME === 'rainforest' ? z => 260 * Math.sin(z * 0.0016 + 0.5) + 90 * Math.sin(z * 0.0055)
  : BIOME === 'arctic' ? z => 120 * Math.sin(z * 0.002 + 1) + 40 * Math.sin(z * 0.008)
  : z => 160 * Math.sin(z * 0.0026) + 60 * Math.sin(z * 0.007 + 1.3);
const CLIFF = 330;
// the "village" spot: the church, the temple or the research hut
const VZ = BIOME === 'rainforest' ? 320 : BIOME === 'arctic' ? -200 : 260;
const VX = riverX(VZ) + (BIOME === 'rainforest' ? 190 : BIOME === 'arctic' ? 140 : 150);
// rainforest: a flat-topped mountain (tepui) with a waterfall; arctic: a rocky crag for the gyrfalcon
const TEPUI = { x: -620, z: -350, r: 230 };
const CRAG = { x: -430, z: 330 };
function heightAt(x, z) {
  if (BIOME === 'rainforest') return rainforestHeight(x, z);
  if (BIOME === 'arctic') return arcticHeight(x, z);
  const rx = riverX(z), d = Math.abs(x - rx);
  const n = fbm(x * 0.0035 + 10, z * 0.0035 - 5);
  let h = -6 + 14 * smooth(8, 60, d) + Math.pow(n, 1.6) * 230 * smooth(60, 520, d);
  const w = rx - x;
  h += smooth(CLIFF - 25, CLIFF + 15, w) * (110 + 60 * fbm(z * 0.01, 3.3, 3));
  const r = Math.hypot(x, z);
  h += smooth(850, 1250, r) * 260 * fbm(x * 0.004, z * 0.004, 3);
  const dv = Math.hypot(x - VX, z - VZ);
  h = lerp(h, 9, smooth(140, 60, dv));
  return h;
}
function rainforestHeight(x, z) {
  const rx = riverX(z), d = Math.abs(x - rx);
  const n = fbm(x * 0.004 + 3, z * 0.004 + 9);
  let h = -5 + 12 * smooth(15, 110, d) + Math.pow(n, 1.3) * 110 * smooth(100, 500, d);
  const dt = Math.hypot(x - TEPUI.x, z - TEPUI.z);
  h = Math.max(h, smooth(TEPUI.r + 30, TEPUI.r - 10, dt) * (240 + 20 * fbm(x * 0.02, z * 0.02, 2)));
  const ol = Math.hypot(x - (riverX(-650) + 190), z + 650);                // an oxbow lake
  h = lerp(h, -4, smooth(95, 55, ol));
  const r = Math.hypot(x, z);
  h += smooth(850, 1250, r) * 200 * fbm(x * 0.004, z * 0.004, 3);
  return lerp(h, 14, smooth(110, 60, Math.hypot(x - VX, z - VZ)));
}
function arcticHeight(x, z) {
  const rx = riverX(z), d = Math.abs(x - rx);
  let h = -4 + 10 * smooth(8, 45, d) + fbm(x * 0.005 + 20, z * 0.005, 4) * 40 * smooth(40, 300, d);
  const lake = fbm(x * 0.004 + 50, z * 0.004 - 30, 3);                     // icy lakes scattered over the tundra
  if (lake > 0.6) h -= (lake - 0.6) * 160 * smooth(40, 120, d);
  h += Math.pow(fbm(x * 0.006 - 40, z * 0.006 + 12, 3), 3) * 170;          // rocky hills
  h += smooth(150, 30, Math.hypot(x - CRAG.x, z - CRAG.z)) * 130;           // the gyrfalcon's crag
  const r = Math.hypot(x, z);
  h += smooth(700, 1150, r) * 380 * fbm(x * 0.004, z * 0.004, 3);           // glaciers around the edge
  return lerp(h, 8, smooth(90, 45, Math.hypot(x - VX, z - VZ)));
}
let groundAt = (x, z) => Math.max(heightAt(x, z), 0);
const slopeAt = (x, z) => { const e = 3; return tC.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize().y; };

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !isTouch;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd3e9ef, BIOME === 'rainforest' ? 160 : 260, BIOME === 'rainforest' ? 1250 : 1650);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 6000);
scene.add(camera);

const SUN_DIR = new V3(-0.45, 0.62, 0.35).normalize();
const MOON_DIR = new V3(0.4, 0.6, -0.3).normalize();
const LIGHT_DIR = new V3().copy(SUN_DIR);
const hemi = new THREE.HemisphereLight(0xc4e4ff, 0x6a8a48, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d2, 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 700 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

const skyU = {
  top: { value: new THREE.Color(0x3f8fd4) }, horizon: { value: new THREE.Color(0xd3e9ef) },
  sunDir: { value: SUN_DIR }, moonDir: { value: MOON_DIR }, night: { value: 0 }
};
const sky = new THREE.Mesh(new THREE.SphereGeometry(4500, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: `varying vec3 vW; void main(){ vW = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 moonDir; uniform float night; varying vec3 vW;
    void main(){ vec3 d = normalize(vW); float h = clamp(d.y, 0.0, 1.0); vec3 c = mix(horizon, top, pow(h, 0.5));
      float s = max(dot(d, sunDir), 0.0);
      c += (1.0 - night) * (vec3(1.0,0.9,0.7) * pow(s, 400.0) * 2.0 + vec3(1.0,0.8,0.55) * pow(s, 10.0) * 0.2);
      float m = max(dot(d, moonDir), 0.0);
      c += night * (vec3(0.92,0.94,1.0) * smoothstep(0.9993, 0.9996, m) * 1.3 + vec3(0.5,0.6,0.9) * pow(m, 40.0) * 0.18);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`
}));
sky.renderOrder = -1;
scene.add(sky);
const stars = (() => {
  const n = 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rand() * 6.283, y = 0.05 + rand() * 0.95, r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r * 4200, y * 4200, Math.sin(a) * r * 4200], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  p.frustumCulled = false; scene.add(p); return p;
})();

const grad = new THREE.DataTexture(new Uint8Array([105, 180, 255]), 3, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const toon = (c, extra = {}) => new THREE.MeshToonMaterial({ color: c, gradientMap: grad, ...extra });

// ---------- terrain ----------
const SEG = 260;
const tGeo = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG);
tGeo.rotateX(-Math.PI / 2);
function terrainColor(x, z, h, ny, out) {
  if (BIOME === 'rainforest') {
    const C = terrainColor.R || (terrainColor.R = { bed: new THREE.Color(0x5a4a2c), mud: new THREE.Color(0xa2845a), floor: new THREE.Color(0x2f6b2a), moss: new THREE.Color(0x4a8a34), stone: new THREE.Color(0x9a6a4a), high: new THREE.Color(0x5a8a3c) });
    if (h < 1.3) return out.copy(h < -1.5 ? C.bed : C.mud);
    if (ny < 0.7) return out.copy(C.stone).lerp(C.floor, fbm(x * .03, z * .03, 2) * 0.35);   // red sandstone cliffs
    return out.copy(C.floor).lerp(h > 200 ? C.high : C.moss, fbm(x * .015, z * .015, 2) * 0.8);
  }
  if (BIOME === 'arctic') {
    const C = terrainColor.A || (terrainColor.A = { bed: new THREE.Color(0x5a6a70), shore: new THREE.Color(0x9a968a), tundra: [0x8a8a5a, 0xa89a6a, 0x7a8a6a, 0x9a6a5a].map(v => new THREE.Color(v)), rock: new THREE.Color(0x7f8288), snow: new THREE.Color(0xf2f6f8) });
    if (h < 1.3) return out.copy(h < -1.5 ? C.bed : C.shore);
    if (ny < 0.72) return out.copy(C.rock);
    if (h > 190 || fbm(x * 0.01 + 7, z * 0.01, 3) > 0.64) return out.copy(C.snow).lerp(C.rock, h > 190 ? 0 : 0.1);
    return out.copy(C.tundra[Math.floor(hash(Math.floor((x + 4000) / 40), Math.floor((z + 4000) / 40)) * 3.99)]).lerp(C.tundra[2], fbm(x * .02, z * .02, 2) * 0.5);
  }
  const C = terrainColor.C || (terrainColor.C = {
    bed: new THREE.Color(0x8f8a64), sand: new THREE.Color(0xd2c08e), grass: new THREE.Color(0x5e9a42),
    fields: [0x86b84e, 0x9ccb5c, 0x72a845, 0xdcc94a, 0xa9cc6c, 0x8fbf55].map(v => new THREE.Color(v)),
    moor: new THREE.Color(0x93708c), brown: new THREE.Color(0x7f6f4c), rock: new THREE.Color(0x918a7e), snow: new THREE.Color(0xf0f4f5)
  });
  if (h < 1.3) return out.copy(h < -1.5 ? C.bed : C.sand);
  if (ny < 0.74) return out.copy(C.rock).lerp(C.brown, fbm(x * .02, z * .02, 2) * .45);
  if (h < 45) return out.copy(C.fields[Math.floor(hash(Math.floor((x + 4000) / 70), Math.floor((z + 4000) / 55)) * 5.99)]);
  if (h < 110) return out.copy(C.grass).lerp(C.fields[2], fbm(x * .01, z * .01, 2) * .6);
  if (h < 240) return out.copy(C.grass).lerp(fbm(x * .008 + 4, z * .008, 2) > 0.5 ? C.moor : C.brown, smooth(110, 165, h));
  return out.copy(C.rock).lerp(C.snow, smooth(250, 320, h));
}
{
  const P = tGeo.attributes.position;
  for (let i = 0; i < P.count; i++) P.setY(i, heightAt(P.getX(i), P.getZ(i)));
  tGeo.computeVertexNormals();
  const N = tGeo.attributes.normal, cols = new Float32Array(P.count * 3), c = new THREE.Color();
  for (let i = 0; i < P.count; i++) { terrainColor(P.getX(i), P.getZ(i), P.getY(i), N.getY(i), c); cols.set([c.r, c.g, c.b], i * 3); }
  tGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
}
// The drawn ground is made of flat triangles, so its height between grid points differs a little from heightAt.
// Small, real-size animals must stand on the drawn surface, so read heights from the mesh itself.
const GRID = SEG + 1, CELLSZ = WORLD / SEG, gridH = new Float32Array(GRID * GRID);
{ const P = tGeo.attributes.position; for (let i = 0; i < P.count; i++) gridH[i] = P.getY(i); }
function meshHeight(x, z) {
  const gx = clamp((x + WORLD / 2) / CELLSZ, 0, SEG - 1e-4), gz = clamp((z + WORLD / 2) / CELLSZ, 0, SEG - 1e-4);
  const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
  const h = (i, j) => gridH[j * GRID + i];
  const a = h(ix, iz), b = h(ix, iz + 1), c = h(ix + 1, iz + 1), d = h(ix + 1, iz);
  return fx + fz <= 1 ? a + (d - a) * fx + (b - a) * fz : c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
}
groundAt = (x, z) => Math.max(meshHeight(x, z), 0);
const terrain = new THREE.Mesh(tGeo, toon(0xffffff, { vertexColors: true }));
terrain.receiveShadow = true;
scene.add(terrain);
const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD).rotateX(-Math.PI / 2), toon(BIOME === 'rainforest' ? 0x6a7a48 : BIOME === 'arctic' ? 0x4a86b0 : 0x3d9cc6, { transparent: true, opacity: BIOME === 'rainforest' ? 0.9 : 0.84 }));
scene.add(water);
const dummy = new THREE.Object3D();

// ---------- trees (also perches and hiding places) ----------
const TREES = [], TREE_GRID = new Map(), CELL = 40;
const cellKey = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
function treesNear(x, z) {
  const out = [], cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = TREE_GRID.get((cx + i) + ',' + (cz + j)); if (l) out.push(...l); }
  return out;
}
function addTree(t) { TREES.push(t); const k = cellKey(t.x, t.z); if (!TREE_GRID.has(k)) TREE_GRID.set(k, []); TREE_GRID.get(k).push(t); }
if (BIOME === 'valley') {
  const spots = [];
  for (let i = 0; i < 9000 && spots.length < 2100; i++) {
    const x = (rand() - .5) * 2200, z = (rand() - .5) * 2200, h = heightAt(x, z);
    if (h < 3 || h > 175) continue;
    if (Math.hypot(x - VX, z - VZ) < 110) continue;
    const wood = fbm(x * 0.006 + 30, z * 0.006 - 7, 3);
    if (wood < 0.56 && rand() > 0.025) continue;
    if (slopeAt(x, z) < 0.8) continue;
    spots.push([x, h, z, h > 95 || (wood > 0.66 && rand() < .5) ? 1 : 0]);
  }
  const broad = spots.filter(s => !s[3]), pine = spots.filter(s => s[3]);
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 1, 6).translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon(0x6b4f35), spots.length);
  const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), toon(0xffffff), broad.length);
  const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), toon(0xffffff), pine.length);
  const col = new THREE.Color();
  spots.forEach((s, i) => {
    const sz = 0.8 + rand() * 0.7;
    dummy.position.set(s[0], s[1] - 0.5, s[2]); dummy.rotation.set(0, rand() * 6, 0); dummy.scale.set(sz, (s[3] ? 4 : 5) * sz, sz); dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
  });
  const crownPts = canopy.geometry.attributes.position, cp = new V3();
  broad.forEach((s, i) => {
    const sz = 0.8 + rand() * 0.7, cy = s[1] + 5.5 * sz + 2.5;
    dummy.position.set(s[0], cy, s[2]); dummy.rotation.set(rand(), rand() * 6, rand()); dummy.scale.set(5 * sz, 4.4 * sz, 5 * sz); dummy.updateMatrix();
    let crownTop = -Infinity; for (let k = 0; k < crownPts.count; k++) crownTop = Math.max(crownTop, cp.fromBufferAttribute(crownPts, k).applyMatrix4(dummy.matrix).y);
    canopy.setMatrixAt(i, dummy.matrix);
    canopy.setColorAt(i, col.setHSL(0.24 + rand() * 0.07, 0.45 + rand() * .15, 0.30 + rand() * 0.1));
    addTree({ x: s[0], z: s[2], base: cy - 3.5 * sz, top: crownTop, r: 4.6 * sz, perchY: crownTop - 0.05, kind: 'oak' });
  });
  pine.forEach((s, i) => {
    const sz = 0.8 + rand() * 0.6;
    dummy.position.set(s[0], s[1] + 2, s[2]); dummy.rotation.set(0, rand() * 6, 0); dummy.scale.set(3.2 * sz, 13 * sz, 3.2 * sz); dummy.updateMatrix();
    cones.setMatrixAt(i, dummy.matrix);
    cones.setColorAt(i, col.setHSL(0.36 + rand() * 0.05, 0.35, 0.22 + rand() * 0.06));
    addTree({ x: s[0], z: s[2], base: s[1] + 2.5, top: s[1] + 2 + 13 * sz, r: 2.2 * sz, perchY: s[1] + 2 + 11 * sz, kind: 'pine' });
  });
  for (const m of [trunks, canopy, cones]) { m.castShadow = m.receiveShadow = true; scene.add(m); }
} else if (BIOME === 'rainforest') {
  // dense canopy on tall trunks, a few giant emergent kapok trees poking above it, and palms underneath
  const crowns = [], palms = [];
  for (let i = 0; i < 18000 && crowns.length < 2700; i++) {
    const x = (rand() - .5) * 2300, z = (rand() - .5) * 2300, h = heightAt(x, z);
    if (h < 2 || h > 330 || Math.hypot(x - VX, z - VZ) < 75 || slopeAt(x, z) < 0.75) continue;
    if (Math.hypot(x - TEPUI.x, z - TEPUI.z) < TEPUI.r - 20 && rand() < 0.8) continue;
    const giant = rand() < 0.045;
    (rand() < 0.2 && !giant ? palms : crowns).push([x, h, z, giant]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.55, 1, 6).translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 0), crownPts = crownGeo.attributes.position, cp = new V3();
  const trunks = new THREE.InstancedMesh(trunkGeo, toon(0x8a7a64), crowns.length + palms.length);
  const canopy = new THREE.InstancedMesh(crownGeo, toon(0xffffff), crowns.length);
  const fronds = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), toon(0xffffff), palms.length);
  const col = new THREE.Color();
  crowns.forEach((s, i) => {
    const sz = 0.9 + rand() * 0.6, giant = s[3], th = giant ? 40 + rand() * 10 : 17 + rand() * 11, cr = giant ? 13 + rand() * 4 : 6.5 * sz, ch = giant ? 6 : 3.2 * sz;
    dummy.position.set(s[0], s[1] - 0.5, s[2]); dummy.rotation.set(0, rand() * 6, 0); dummy.scale.set(sz * (giant ? 3 : 1), th, sz * (giant ? 3 : 1)); dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(s[0], s[1] + th, s[2]); dummy.rotation.set((rand() - .5) * 0.3, rand() * 6, (rand() - .5) * 0.3); dummy.scale.set(cr, ch, cr); dummy.updateMatrix();
    let crownTop = -Infinity; for (let k = 0; k < crownPts.count; k++) crownTop = Math.max(crownTop, cp.fromBufferAttribute(crownPts, k).applyMatrix4(dummy.matrix).y);
    canopy.setMatrixAt(i, dummy.matrix);
    const flower = rand();
    canopy.setColorAt(i, flower < 0.03 ? col.setHSL(0.93, 0.6, 0.62) : flower < 0.06 ? col.setHSL(0.14, 0.8, 0.55) : col.setHSL(0.25 + rand() * 0.12, 0.5 + rand() * .2, 0.2 + rand() * 0.12));
    addTree({ x: s[0], z: s[2], base: s[1] + th - ch * 0.6, top: crownTop, r: cr * 0.9, perchY: crownTop - 0.05, kind: 'oak', giant });
  });
  palms.forEach((s, i) => {
    const th = 7 + rand() * 7;
    dummy.position.set(s[0], s[1] - 0.5, s[2]); dummy.rotation.set((rand() - .5) * 0.25, rand() * 6, (rand() - .5) * 0.25); dummy.scale.set(0.5, th, 0.5); dummy.updateMatrix();
    trunks.setMatrixAt(crowns.length + i, dummy.matrix);
    dummy.position.set(s[0], s[1] + th - 0.3, s[2]); dummy.rotation.set(0, rand() * 6, 0); dummy.scale.set(4 + rand() * 1.5, 1.1, 4 + rand() * 1.5); dummy.updateMatrix();
    fronds.setMatrixAt(i, dummy.matrix); fronds.setColorAt(i, col.setHSL(0.27 + rand() * 0.06, 0.55, 0.33 + rand() * 0.08));
    addTree({ x: s[0], z: s[2], base: s[1] + th - 1, top: s[1] + th + 0.8, r: 2.5, perchY: s[1] + th + 0.7, kind: 'pine' });
  });
  for (const m of [trunks, canopy, fronds]) { m.castShadow = m.receiveShadow = true; scene.add(m); }
} else {
  // tundra: no trees, just low shrubs (willow and birch only grow knee-high here)
  const spots = [];
  for (let i = 0; i < 6000 && spots.length < 1100; i++) {
    const x = (rand() - .5) * 2200, z = (rand() - .5) * 2200, h = heightAt(x, z);
    if (h > 1.5 && h < 150 && slopeAt(x, z) > 0.85) spots.push([x, h, z]);
  }
  const shrubs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), toon(0xffffff), spots.length), col = new THREE.Color();
  spots.forEach(([x, h, z], i) => {
    const sz = 0.4 + rand() * 0.7;
    dummy.position.set(x, h + sz * 0.3, z); dummy.rotation.set(rand(), rand() * 6, rand()); dummy.scale.set(sz * 1.4, sz * 0.6, sz * 1.4); dummy.updateMatrix();
    shrubs.setMatrixAt(i, dummy.matrix); shrubs.setColorAt(i, rand() < 0.5 ? col.setHSL(0.05, 0.45, 0.32) : col.setHSL(0.2, 0.3, 0.3));
  });
  shrubs.receiveShadow = true; scene.add(shrubs);
}

// sheep in the valley; caribou herds on the tundra
if (BIOME === 'arctic') {
  const spots = [];
  for (let i = 0; i < 3000 && spots.length < 90; i++) {
    const x = (rand() - .5) * 1700, z = (rand() - .5) * 1700, h = heightAt(x, z);
    if (h < 3 || h > 110 || slopeAt(x, z) < 0.9) continue;
    const n = 5 + Math.floor(rand() * 7);
    for (let k = 0; k < n; k++) spots.push([x + (rand() - .5) * 30, z + (rand() - .5) * 30]);
  }
  const bodies = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), toon(0x6a523a), spots.length);
  const necks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.55, 0.4), toon(0xe6dccb), spots.length);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.28, 0.55), toon(0x5a4430), spots.length);
  const antlers = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 0.9, 4).translate(0, 0.45, 0), toon(0xd8ccb0), spots.length * 2);
  const e = new THREE.Euler(), off = new V3();
  spots.forEach(([x, z], i) => {
    const h = groundAt(x, z), yaw = rand() * 6.28; e.set(0, yaw, 0);
    dummy.position.set(x, h + 1.05, z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(0.5, 0.55, 1.0); dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix);
    off.set(0, 0.35, 0.85).applyEuler(e); dummy.position.set(x + off.x, h + 1.35, z + off.z); dummy.rotation.set(-0.4, yaw, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); necks.setMatrixAt(i, dummy.matrix);
    off.set(0, 0, 1.2).applyEuler(e); dummy.position.set(x + off.x, h + 1.6, z + off.z); dummy.rotation.set(0.5, yaw, 0); dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
    for (const sx of [-1, 1]) { off.set(sx * 0.1, 0, 1.05).applyEuler(e); dummy.position.set(x + off.x, h + 1.75, z + off.z); dummy.rotation.set(-0.5, yaw, sx * 0.5); dummy.updateMatrix(); antlers.setMatrixAt(i * 2 + (sx > 0 ? 1 : 0), dummy.matrix); }
  });
  for (const m of [bodies, necks, heads, antlers]) { m.castShadow = true; scene.add(m); }
}
if (BIOME === 'valley') {
  const spots = [];
  for (let i = 0; i < 4000 && spots.length < 160; i++) {
    const x = (rand() - .5) * 1800, z = (rand() - .5) * 1800, h = heightAt(x, z);
    if (h < 4 || h > 70 || Math.hypot(x - VX, z - VZ) < 120 || slopeAt(x, z) < 0.9) continue;
    if (fbm(x * 0.006 + 30, z * 0.006 - 7, 3) > 0.5) continue;
    const n = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) spots.push([x + (rand() - .5) * 16, z + (rand() - .5) * 16]);
  }
  const bodies = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), toon(0xf6f3ea), spots.length);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.55, 0.7), toon(0x26221f), spots.length);
  const e = new THREE.Euler(), off = new V3();
  spots.forEach(([x, z], i) => {
    const h = heightAt(x, z), yaw = rand() * 6.28;
    dummy.position.set(x, h + 0.6, z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(0.42, 0.38, 0.62); dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix);
    off.set(0, 0.1, 0.62).applyEuler(e.set(0, yaw, 0));
    dummy.position.set(x + off.x, h + 0.5, z + off.z); dummy.rotation.set(0.5, yaw, 0); dummy.scale.set(0.55, 0.55, 0.55); dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
  });
  bodies.castShadow = heads.castShadow = true;
  scene.add(bodies, heads);
}

// village with a church; buildings are obstacles you can also land on
const COLLIDERS = [];
const windowMat = new THREE.MeshBasicMaterial({ color: 0x55524a });
const waterfall = { mat: null };
if (BIOME === 'valley') {
  const stone = toon(0xdcd2bb), white = toon(0xefe9dc), slate = toon(0x596072), red = toon(0x9a5a45);
  const box = new THREE.BoxGeometry(1, 1, 1), roof = new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4);
  const g = new THREE.Group();
  const house = (x, z, w, d, hgt, rot, wall, rf) => {
    const h = heightAt(VX + x, VZ + z), grp = new THREE.Group();
    const b = new THREE.Mesh(box, wall); b.scale.set(w, hgt, d); b.position.y = hgt / 2; grp.add(b);
    const r = new THREE.Mesh(roof, rf); r.scale.set(w * 1.38, hgt * 0.75, d * 1.38); r.position.y = hgt + hgt * 0.37; grp.add(r);
    for (const sx of [-0.25, 0.25]) { const wdw = new THREE.Mesh(box, windowMat); wdw.scale.set(1.1, 1.2, 0.2); wdw.position.set(w * sx, hgt * 0.55, d / 2 + 0.05); grp.add(wdw); }
    grp.position.set(VX + x, h - 0.3, VZ + z); grp.rotation.y = rot; g.add(grp);
    COLLIDERS.push({ x: VX + x, z: VZ + z, r: Math.max(w, d) * 0.55, top: h - 0.3 + hgt * 1.35, name: 'roof' });
  };
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * 6.28 + rand() * .3, r = 32 + rand() * 40;
    house(Math.cos(a) * r, Math.sin(a) * r, 7 + rand() * 4, 9 + rand() * 4, 5 + rand() * 2, -a, rand() < .5 ? stone : white, rand() < .7 ? slate : red);
  }
  const ch = new THREE.Group(), h = heightAt(VX, VZ), rot = 0.4;
  const nave = new THREE.Mesh(box, stone); nave.scale.set(9, 9, 22); nave.position.y = 4.5; ch.add(nave);
  const nr = new THREE.Mesh(new THREE.CylinderGeometry(0, 1, 1, 4, 1).rotateY(Math.PI / 4), slate); nr.scale.set(9 * .72, 5, 22 * .72); nr.position.y = 11.5; ch.add(nr);
  const tower = new THREE.Mesh(box, stone); tower.scale.set(7, 22, 7); tower.position.set(0, 11, -13); ch.add(tower);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(4.6, 18, 4).rotateY(Math.PI / 4), slate); spire.position.set(0, 31, -13); ch.add(spire);
  ch.position.set(VX, h - 0.3, VZ); ch.rotation.y = rot; g.add(ch);
  const local = (lz) => ({ x: VX + lz * Math.sin(rot), z: VZ + lz * Math.cos(rot) });
  for (const lz of [-6, 1, 8]) COLLIDERS.push({ ...local(lz), r: 5.2, top: h + 12, name: 'church roof' });
  COLLIDERS.push({ ...local(-13), r: 4.6, top: h + 23, name: 'church tower' });
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  scene.add(g);
} else if (BIOME === 'rainforest') {
  // a stepped stone temple, half swallowed by the jungle
  const g = new THREE.Group(), h = heightAt(VX, VZ), stone = toon(0x9a9a7a), moss = toon(0x6a8a4a), box = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 5; i++) {
    const w = 40 - i * 7, tier = new THREE.Mesh(box, i % 2 ? moss : stone); tier.scale.set(w, 5, w); tier.position.y = 2.5 + i * 5; g.add(tier);
    COLLIDERS.push({ x: VX, z: VZ, r: w * 0.5, top: h + 5 * (i + 1), name: 'temple steps' });
  }
  const stairs = new THREE.Mesh(box, stone); stairs.scale.set(7, 2, 26); stairs.position.set(0, 12, 17); stairs.rotation.x = -0.75; g.add(stairs);
  const shrine = new THREE.Mesh(box, stone); shrine.scale.set(8, 6, 8); shrine.position.y = 28; g.add(shrine);
  const door = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x15120c })); door.scale.set(2.4, 3.4, 0.3); door.position.set(0, 27, 4.05); g.add(door);
  COLLIDERS.push({ x: VX, z: VZ, r: 4.5, top: h + 31, name: 'temple shrine' });
  g.position.set(VX, h - 0.2, VZ); g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); scene.add(g);
  // a waterfall pouring off the tepui towards the river
  const dir = Math.atan2(riverX(TEPUI.z) - TEPUI.x, 0.0001) > 0 ? 1 : -1;
  const wx = TEPUI.x + dir * (TEPUI.r + 8), wz = TEPUI.z, top = heightAt(TEPUI.x + dir * (TEPUI.r - 25), wz), bottom = heightAt(wx + dir * 40, wz) + 1;
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 256; const cx = cv.getContext('2d');
  for (let i = 0; i < 260; i++) { cx.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`; cx.fillRect(Math.random() * 32, Math.random() * 256, 1 + Math.random() * 3, 10 + Math.random() * 40); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, (top - bottom) / 30);
  waterfall.mat = new THREE.MeshBasicMaterial({ color: 0xd8f0ff, map: tex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(16, top - bottom), waterfall.mat);
  fall.position.set(wx, (top + bottom) / 2, wz); fall.rotation.y = Math.PI / 2; scene.add(fall);
  const mist = new THREE.Mesh(new THREE.IcosahedronGeometry(14, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
  mist.position.set(wx + dir * 6, bottom + 4, wz); mist.scale.y = 0.5; scene.add(mist);
  Object.assign(waterfall, { x: wx, z: wz, top, bottom });
} else {
  // a little research hut with a radio mast, an inukshuk stone marker, and boulders you can perch on
  const g = new THREE.Group(), h = heightAt(VX, VZ), box = new THREE.BoxGeometry(1, 1, 1);
  const walls = new THREE.Mesh(box, toon(0xa8382a)); walls.scale.set(6, 3.5, 10); walls.position.y = 1.75; g.add(walls);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 4.4, 2, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.7), toon(0x5a6068)); roof.position.y = 4.5; g.add(roof);
  for (const sx of [-0.25, 0.25]) { const w = new THREE.Mesh(box, windowMat); w.scale.set(1, 1, 0.2); w.position.set(sx * 6, 2, 5.05); g.add(w); }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 14, 5), toon(0xc8c8c8)); mast.position.set(5, 7, -3); g.add(mast);
  g.position.set(VX, h - 0.2, VZ); g.rotation.y = 0.3; g.traverse(m => { if (m.isMesh) m.castShadow = true; }); scene.add(g);
  COLLIDERS.push({ x: VX, z: VZ, r: 5.5, top: h + 5.4, name: 'hut roof' });
  const ix = 320, iz = -520, ih = heightAt(ix, iz), ink = new THREE.Group(), rockM = toon(0x8a8c90);
  for (const [w, hh, d, y, x] of [[0.8, 1.4, 0.6, 0.7, -0.6], [0.8, 1.4, 0.6, 0.7, 0.6], [2.6, 0.5, 0.7, 1.65, 0], [0.9, 0.9, 0.6, 2.35, 0], [2, 0.4, 0.6, 3, 0], [0.6, 0.6, 0.5, 3.5, 0]]) {
    const st = new THREE.Mesh(box, rockM); st.scale.set(w, hh, d); st.position.set(x, y, 0); ink.add(st);
  }
  ink.position.set(ix, ih, iz); ink.traverse(m => { if (m.isMesh) m.castShadow = true; }); scene.add(ink);
  COLLIDERS.push({ x: ix, z: iz, r: 1.2, top: ih + 3.8, name: 'inukshuk' });
  const boulders = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), toon(0x8a8c90), 420);
  for (let i = 0; i < 420; i++) {
    let x, z, bh; do { x = (rand() - .5) * 2000; z = (rand() - .5) * 2000; bh = heightAt(x, z); } while (bh < 1.5);
    const sc = rand() < 0.12 ? 2.2 + rand() * 2 : 0.5 + rand() * 1.2;
    dummy.position.set(x, bh + sc * 0.4, z); dummy.rotation.set(rand(), rand() * 6, rand()); dummy.scale.set(sc, sc * 0.8, sc); dummy.updateMatrix(); boulders.setMatrixAt(i, dummy.matrix);
    if (sc > 2) COLLIDERS.push({ x, z, r: sc * 0.8, top: bh + sc * 1.1, name: 'boulder' });
  }
  boulders.castShadow = boulders.receiveShadow = true; scene.add(boulders);
}
function colliderAt(x, z) { let best = null; for (const c of COLLIDERS) if (Math.hypot(x - c.x, z - c.z) < c.r && (!best || c.top > best.top)) best = c; return best; }
function surfaceAt(x, z) { const c = colliderAt(x, z), g = groundAt(x, z); return c ? Math.max(g, c.top) : g; }

// the northern lights: glowing curtains in the Arctic night sky
const aurora = { mat: null };
if (BIOME === 'arctic') {
  aurora.mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { t: { value: 0 }, night: { value: 0 } },
    vertexShader: `varying vec2 vUv; uniform float t; void main(){ vUv = uv; vec3 p = position; p.z += sin(p.x * 0.004 + t * 0.3) * 120.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float t; uniform float night;
      void main(){ float bands = 0.55 + 0.45 * sin(vUv.x * 40.0 + t * 0.8) * sin(vUv.x * 13.0 - t * 0.5);
        float fade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        vec3 c = mix(vec3(0.15, 1.0, 0.55), vec3(0.6, 0.3, 1.0), smoothstep(0.45, 1.0, vUv.y));
        gl_FragColor = vec4(c * bands * fade * night * 0.85, 1.0); }`
  });
  for (const [x, z, ry] of [[0, -1500, 0], [-900, -1200, 0.6], [900, -1250, -0.5]]) {
    const cur = new THREE.Mesh(new THREE.PlaneGeometry(1800, 380, 60, 1), aurora.mat);
    cur.position.set(x, 820, z); cur.rotation.y = ry; cur.frustumCulled = false; scene.add(cur);
  }
}
// clouds
const clouds = [];
const cloudMat = toon(0xffffff, { emissive: 0x7d8a96, emissiveIntensity: 0.35 });
{
  const geo = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 34; i++) {
    const c = new THREE.Group(), n = 4 + Math.floor(rand() * 5);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(geo, cloudMat), s = 14 + rand() * 18;
      m.scale.set(s * 1.4, s * 0.8, s); m.position.set((k - n / 2) * 16 + rand() * 8, rand() * 8, (rand() - .5) * 20); c.add(m);
    }
    c.position.set((rand() - .5) * 2600, 520 + rand() * 120, (rand() - .5) * 2600);
    scene.add(c); clouds.push(c);
  }
}

// ---------- birds ----------
// Birds are low-poly: every triangle is flat-shaded and coloured on its own.
const birdMat = toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide });
const fv = new V3(), fnrm = new V3(), fc = new V3();
// Polygon-art look: every triangle gets its own slightly lighter or darker shade, like a low-poly illustration.
const facetShade = m => { const h = Math.sin(m.x * 127.1 + m.y * 311.7 + m.z * 74.7) * 43758.5453; return h - Math.floor(h) - 0.5; };
function facet(geo, colorFn, jitter = 0.08) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const P = g.attributes.position, cols = new Float32Array(P.count * 3), c = new THREE.Color();
  for (let i = 0; i < P.count; i += 3) {
    fnrm.fromBufferAttribute(g.attributes.normal, i);
    fc.set(0, 0, 0); for (let k = 0; k < 3; k++) fc.add(fv.fromBufferAttribute(P, i + k)); fc.multiplyScalar(1 / 3);
    c.setHex(colorFn(fnrm, fc));
    if (jitter) c.offsetHSL(0, 0, facetShade(fc) * jitter);
    for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}
// place a copy of a part, then join many parts into one mesh (fewer meshes keeps the game smooth)
const partM = new THREE.Matrix4(), partE = new THREE.Euler();
const place = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1) => geo.clone().applyMatrix4(partM.makeRotationFromEuler(partE.set(rx, ry, rz)).scale(new V3(sx, 1, 1)).setPosition(x, y, z));
function mergeGeos(geos) {
  geos = geos.filter(Boolean);
  const n = geos.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return m;
}
function bladeGeo(pts, top, under, edge, depth = 0.022) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).rotateX(Math.PI / 2);
  return facet(g, typeof top === 'function' ? top : n => n.y > 0.5 ? top : n.y < -0.5 ? under : edge);
}
// one long pointed feather lying along +x, with optional dark bars across it
function featherGeo(len, w, top, under, bars) {
  const pts = [[0, w * .45], [len * .72, w * .5], [len, 0], [len * .72, -w * .5], [0, -w * .45]];
  return bladeGeo(pts, (n, m) => n.y < -0.5 ? under : bars && Math.floor(m.x / len * 6) % 2 === 1 ? bars : top, under, top, 0.012);
}
let BEND_K = 0.32;
// add points between profile points so belly barring has enough rows
const densify = pts => pts.flatMap((p, i) => i < pts.length - 1 ? [p, [(p[0] + pts[i + 1][0]) / 2, (p[1] + pts[i + 1][1]) / 2]] : [p]);
// Stretch the wings so wingspan-to-length matches the real bird, then scale it to real size in metres.
function fitBird(o) {
  if (o._fit) return o._fit;
  const r = o.headR, hz = (o.headShape || [1, 1, 1.18])[2], bl = o.beakLen || 0.95, [bx, , bz] = o.body;
  const len = o.headZ + Math.max(r * hz, r * (hz * .5 + bl * .92)) + bz * .4 + Math.max(...o.tail.map(p => -p[1]));
  const wantHalf = len * (o.realSpan / o.realLen) / 2;
  const stretch = (wantHalf - bx * .3) / (o.span + Math.max(...o.outer.map(p => p[0])));
  // wing depth (front to back) as a share of body length: broad for owls and eagles, slimmer for falcons
  const chordNow = Math.max(...o.inner.map(p => p[1])) - Math.min(...o.inner.map(p => p[1]));
  const chord = (o.chord || 0.42) * len / chordNow;
  return (o._fit = { stretch, chord, scale: o.realLen / len });
}
const shade = (hex, k) => new THREE.Color(hex).offsetHSL(0, 0, k).getHex();
function birdGeos(o) {
  if (o._geo) return o._geo;
  const [bx, by, bz] = o.body, r = o.headR, k = fitBird(o).stretch;
  const body = facet(new THREE.LatheGeometry(densify(densify(o.profile)).map(([a, b]) => new THREE.Vector2(a, b)), 9).rotateX(Math.PI / 2).scale(bx, by, bz),
    (n, m) => {
      if (n.y < -0.3 && m.z > -bz * 0.35) return o.bars && Math.floor((m.z + 1) * 22) % 2 === 0 && m.z < bz * 0.3 ? o.bars : o.belly;
      if (n.y < 0.1 && n.y >= -0.3) return shade(o.back, 0.05);
      return o.mantle && n.y > 0.6 && m.z > -bz * 0.1 ? o.mantle : o.back;
    });
  // a thick neck that flows from the chest up into the head, so the head isn't a ball on a stick
  const hs = o.headShape || [1, 0.92, 1.18], hz = hs[2], bl = o.beakLen || 0.95;
  const prof = o.profile, profR = zn => { for (let i = 1; i < prof.length; i++) if (prof[i][1] >= zn) { const [a0, b0] = prof[i - 1], [a1, b1] = prof[i]; return a0 + (a1 - a0) * (zn - b0) / ((b1 - b0) || 1); } return 0; };
  const nz0 = bz * 0.22, nr0 = profR(0.22) * 0.98, nz1 = o.headZ - r * 0.2;
  const neckG = new THREE.CylinderGeometry(1, 1, 1, 8, 3, true).rotateX(Math.PI / 2);
  { const NP = neckG.attributes.position;
    for (let i = 0; i < NP.count; i++) {
      const t = NP.getZ(i) + 0.5, e = t * t * (3 - 2 * t);
      NP.setXYZ(i, NP.getX(i) * lerp(bx * nr0, r * 0.82 * hs[0], e), NP.getY(i) * lerp(by * nr0, r * 0.8 * hs[1], e) + lerp(by * 0.06, o.headY - r * 0.12, e), lerp(nz0, nz1, t));
    } }
  const neck = facet(neckG, (n, m) => n.y < -0.25 ? (o.cheek || o.belly) : m.z > (nz0 + nz1) * 0.55 ? (o.nape || o.head) : (o.mantle || o.back));
  const bodyAll = mergeGeos([body, neck]);
  // the head and everything on it become one mesh
  const skull = facet(new THREE.IcosahedronGeometry(r, 1).scale(...hs),
    (n, m) => o.face && n.z > 0.3 ? o.face : o.cheek && n.y < -0.15 && m.z > -r * 0.2 ? o.cheek : o.nape && m.z < -r * 0.3 && n.y > 0 ? o.nape : o.head, 0.06);
  const beakG = facet(new THREE.ConeGeometry(r * (o.beakW || .34), r * bl, 5).rotateX(Math.PI / 2), (n, m) => m.z > r * bl * 0.2 && o.beakTip ? o.beakTip : o.beak, 0.05);
  const headParts = [skull, place(beakG, 0, -r * .22, r * (hz * .5 + bl * .42), o.hook ?? 0.5)];
  if (o.cere) headParts.push(place(facet(new THREE.OctahedronGeometry(r * .26, 0).scale(1, .8, .9), () => o.cere), 0, -r * .12, r * hz * .9));
  if (o.crest) headParts.push(place(facet(new THREE.ConeGeometry(r * .35, r * 1.3, 4).rotateX(-Math.PI / 2 - 0.5), () => o.crest), 0, r * .55, -r * .45));
  for (const sx of [-1, 1]) {
    const ex = sx * r * .74 * hs[0] / 0.82 * 0.82, ey = r * .2, ez = r * .5 * hz / 1.18;
    headParts.push(place(facet(new THREE.OctahedronGeometry(r * .2, 0), () => 0x0d0d0d, 0), ex, ey, ez));
    headParts.push(place(facet(new THREE.OctahedronGeometry(r * .055, 0), () => 0xffffff, 0), ex + sx * r * .1, ey + r * .08, ez + r * .1));
    if (o.eyeRing) headParts.push(place(facet(new THREE.OctahedronGeometry(r * .29, 0), () => o.eyeRing, 0), ex * .93, ey * .93, ez * .93));
    if (o.malar) headParts.push(place(facet(new THREE.OctahedronGeometry(r * .3, 0).scale(.45, 1.5, .7), () => o.malar), sx * r * .62, -r * .42, r * .38, -0.3));
    if (o.neck) headParts.push(place(facet(new THREE.OctahedronGeometry(r * .42, 0).scale(1, 1.3, 1), () => o.neck), sx * r * .62, -r * .85, -r * .1));
    if (o.patch) headParts.push(place(facet(new THREE.OctahedronGeometry(r * .4, 0).scale(.7, .8, 1.9), () => o.patch), sx * r * .66, r * .12, r * .05));
  }
  const head = mergeGeos(headParts);
  // wings: a covert panel with individual flight feathers fanning out behind it
  const span = o.span, outerMax = Math.max(...o.outer.map(p => p[0]));
  const innerTrail = Math.min(...o.inner.map(p => p[1])), outerTrail = Math.min(...o.outer.map(p => p[1]));
  const nSec = (o.secondaries ?? 5) + 2, nPri = (o.primaries ?? 6) + 1, fw = Math.max(0.07, outerMax * 0.2);
  const secs = [...Array(nSec)].map((_, i) => {
    const t = (i + 0.5) / nSec;
    return place(featherGeo(Math.abs(innerTrail) * 0.85 + 0.03 + (i % 2) * 0.012, fw * 1.25, shade(o.wing, -0.06 + (i % 3) * 0.035), o.under), span * t, -0.024 - (i % 2) * 0.003, innerTrail * 0.4, 0, Math.PI / 2 - 0.1);
  });
  const sweep = o.fingered ? [1.25, 0.35] : o.rounded ? [1.35, 0.55] : [1.15, 0.18];
  const pris = [...Array(nPri)].map((_, i) => {
    const t = i / (nPri - 1), len = outerMax * (0.42 + 0.28 * t) * (o.primLen || 1);
    return place(featherGeo(len, fw * (o.fingered && t > 0.6 ? 0.7 : 1), shade(o.tip, -0.06 + (i % 3) * 0.04), o.under), outerMax * (0.1 + 0.66 * t), -0.024 - i * 0.002, outerTrail * 0.3, 0, lerp(sweep[0], sweep[1], t));
  });
  const ch = fitBird(o).chord;
  const inner = mergeGeos([bladeGeo(o.inner, o.wing, o.under, o.tip), ...secs]).scale(k, 1, ch);
  const outer = mergeGeos([bladeGeo(o.outer, o.tip, o.under, o.tip), ...pris]).scale(k, 1, ch);
  inner.computeVertexNormals(); outer.computeVertexNormals();
  // a curved copy of each wing (front and back edges bent inwards), blended in when the wing is folded
  // so it wraps around the bird's side instead of lying flat like a board
  const bend = (geo, k) => {
    const P = geo.attributes.position, cur = new Float32Array(P.array);
    let z0 = Infinity, z1 = -Infinity; for (let i = 0; i < P.count; i++) { z0 = Math.min(z0, P.getZ(i)); z1 = Math.max(z1, P.getZ(i)); }
    const zc = (z0 + z1) / 2, half = (z1 - z0) / 2 || 1;
    for (let i = 0; i < P.count; i++) { const u = (P.getZ(i) - zc) / half; cur[i * 3 + 1] -= k * half * u * u; }
    geo.morphAttributes.position = [new THREE.BufferAttribute(cur, 3)];
  };
  bend(inner, BEND_K); bend(outer, BEND_K * 0.6);
  // tail: a fan of separate feathers
  const tailLen = Math.max(...o.tail.map(p => -p[1])), nTail = o.tailFeathers ?? 7, tw = Math.max(...o.tail.map(p => Math.abs(p[0])));
  const tailFs = [...Array(nTail)].map((_, i) => {
    const a = (i / (nTail - 1) - 0.5) * (o.forked ? 0.55 : 0.45);
    const len = tailLen * (0.95 + (o.forked ? Math.abs(a) * 1.6 : 0) - (o.rounded ? Math.abs(a) * 0.5 : 0));
    return place(featherGeo(len, tw * 0.55, shade(o.tailTop || o.wing, -0.03 + (i % 2) * 0.05), o.under, o.tailBars), 0, 0.012, 0, 0, Math.PI / 2 + a);
  });
  const tail = mergeGeos([bladeGeo(o.tail, o.tailTop || o.wing, o.under, o.tip), ...tailFs]);
  const legC = o.feet || o.beak;
  const legOne = mergeGeos([
    place(facet(new THREE.OctahedronGeometry(1, 0).scale(.028, .12, .028), () => legC), 0, -.1, 0),
    place(facet(new THREE.OctahedronGeometry(1, 0).scale(.05, .03, .08), () => legC), 0, -.21, .03),
    ...[-.03, 0, .03].map(tx => place(facet(new THREE.ConeGeometry(.012, .05, 3).rotateX(Math.PI / 2 + 0.6), () => 0x1a1a1a, 0), tx, -.22, .1)),
  ]);
  return (o._geo = { body: bodyAll, head, tail, inner, outer, legOne });
}
function makeBird(o) {
  const G = birdGeos(o), g = new THREE.Group(), M = geo => new THREE.Mesh(geo, birdMat);
  const [bx, by, bz] = o.body;
  const body = M(G.body); g.add(body);
  const head = new THREE.Group(); head.position.set(0, o.headY, o.headZ); g.add(head);
  head.add(M(G.head));
  const tail = new THREE.Group(); tail.position.set(0, 0, -bz * .4); tail.add(M(G.tail)); g.add(tail);
  const wings = [];
  const mkWing = parent => {
    const root = new THREE.Group(); root.rotation.order = 'ZYX'; root.position.set(bx * .3, by * .22, o.wingZ); parent.add(root);
    const inner = M(G.inner); root.add(inner);
    const elbow = new THREE.Group(); elbow.position.x = o.span * fitBird(o).stretch; root.add(elbow);
    const outer = M(G.outer); elbow.add(outer);
    wings.push({ root, elbow, inner, outer, ex: elbow.position.x, rx: root.position.x });
  };
  mkWing(g);
  const mirror = new THREE.Group(); mirror.scale.x = -1; g.add(mirror); mkWing(mirror);
  // legs with feet and talons, shown for landing, walking, perching and carrying
  const legs = new THREE.Group();
  for (const s of [-1, 1]) { const lg = new THREE.Group(); lg.position.set(s * bx * .3, -by * .35, bz * .05); lg.add(M(G.legOne)); legs.add(lg); }
  legs.visible = false; g.add(legs);
  const sc = fitBird(o).scale;
  g.scale.setScalar(sc);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return { group: g, body, wings, head, tail, legs, scale: sc, span: o.realSpan, leg: (by * 0.35 + 0.3) * sc };
}
// Natural wingbeat: the outer wing folds back on the upstroke and stretches out on the downstroke.
function animWings(b, { ph = 0, amp = 0, tuck = 0, dihedral = 0, flare = 0, droop = 0, fold = 0 } = {}) {
  const s = Math.sin(ph), up = Math.max(0, Math.cos(ph)), open = 1 - tuck;
  // resting birds fluff their feathers out, so they look rounder and bigger than in flight
  if (b.body) b.body.scale.set(1 + 0.16 * fold, 1 + 0.12 * fold, 1 + 0.03 * fold);
  for (const w of b.wings) {
    w.root.rotation.z = (amp * s + dihedral + flare * 0.45) * open - tuck * 0.18 - droop;
    w.root.rotation.y = tuck * 1.05 - flare * 0.45 * open + amp * up * 0.15 * open;
    w.elbow.rotation.z = (-amp * 0.45 * s - flare * 0.25) * open - droop * 0.5;
    w.elbow.rotation.y = tuck * 1.55 + amp * up * 0.7 * open;
    // folded at rest: the wing swings back, then turns down to lie flat against the bird's side,
    // with the wingtips crossing over the tail
    // The arm and forearm fold up in a Z under the coverts, so the inner wing gets much shorter and narrower.
    if (fold) {
      w.root.rotation.set(0, lerp(w.root.rotation.y, 1.35, fold), lerp(w.root.rotation.z, -1.4, fold));
      w.elbow.rotation.set(0, lerp(w.elbow.rotation.y, 0.12, fold), lerp(w.elbow.rotation.z, 0.06, fold));
    }
    if (w.inner) {
      w.inner.scale.set(lerp(1, 0.38, fold), 1, lerp(1, 0.55, fold));
      w.outer.scale.set(1, 1, lerp(1, 0.6, fold));
      w.elbow.position.x = w.ex * lerp(1, 0.38, fold);
      w.root.position.x = w.rx * (1 + 0.45 * fold);
      w.inner.morphTargetInfluences[0] = w.outer.morphTargetInfluences[0] = fold;
    }
  }
}
const LOOK = {
  falcon: { chord: 0.4, tailBars: 0x3a4658, realLen: 0.42, realSpan: 1.05, body: [.25, .23, 1.05], headR: .13, headY: .085, headZ: .56, wingZ: .14, span: .46,
    profile: [[0, -.5], [.1, -.36], [.3, -.1], [.48, .16], [.42, .34], [.24, .46], [0, .5]],
    headShape: [.82, .82, 1.32], beakLen: 1.4, cere: 0xf0c02a, malar: 0x1c2027,
    inner: [[0, .13], [.46, .05], [.46, -.12], [.36, -.16], [.27, -.13], [.18, -.17], [.09, -.14], [0, -.18]],
    outer: [[0, .05], [.36, -.04], [.78, -.3], [.62, -.25], [.57, -.3], [.47, -.23], [.41, -.28], [.3, -.2], [.23, -.24], [.12, -.16], [0, -.13]],
    tail: [[-.05, 0], [-.09, -.38], [-.05, -.45], [-.02, -.4], [0, -.46], [.02, -.4], [.05, -.45], [.09, -.38], [.05, 0]],
    back: 0x52627a, mantle: 0x46566d, belly: 0xf1e7d1, bars: 0xc9bba0, head: 0x262b34, wing: 0x5a6a82, tip: 0x2f3846, under: 0xd9d2c2,
    beak: 0x7d8a9e, beakTip: 0x2a2e35, eyeRing: 0xf0c02a, cheek: 0xf1e7d1, feet: 0xf0c02a },
  pigeon: { chord: 0.42, primaries: 5, secondaries: 4, realLen: 0.41, realSpan: 0.77, body: [.26, .26, .64], headR: .1, headY: .11, headZ: .37, wingZ: .06, span: .3,
    profile: [[0, -.5], [.2, -.3], [.5, .05], [.44, .32], [0, .5]],
    inner: [[0, .12], [.3, .12], [.3, -.12], [.2, -.15], [.1, -.12], [0, -.14]],
    outer: [[0, .12], [.32, .04], [.38, -.06], [.31, -.09], [.28, -.15], [.2, -.11], [.15, -.16], [.08, -.11], [0, -.12]],
    tail: [[-.07, 0], [-.1, -.28], [-.04, -.24], [0, -.3], [.04, -.24], [.1, -.28], [.07, 0]],
    back: 0x8b93a3, belly: 0xb8a2ae, head: 0x8b93a3, wing: 0x9aa2b0, tip: 0x3d4048, under: 0xc9cdd6, beak: 0xe8c070, neck: 0xffffff, feet: 0xd77a8a },
  teal: { chord: 0.36, primaries: 5, secondaries: 4, realLen: 0.36, realSpan: 0.6, body: [.26, .23, .64], headR: .1, headY: .1, headZ: .38, wingZ: .06, span: .3,
    profile: [[0, -.5], [.22, -.3], [.5, .02], [.46, .3], [0, .5]],
    inner: [[0, .1], [.3, .07], [.3, -.08], [.18, -.11], [0, -.1]],
    outer: [[0, .07], [.36, 0], [.44, -.07], [.33, -.06], [.28, -.1], [.16, -.07], [0, -.08]],
    tail: [[-.06, 0], [-.07, -.18], [0, -.22], [.07, -.18], [.06, 0]],
    back: 0x8d8f8a, belly: 0xdcd2bf, head: 0x8a3b22, wing: 0x7d7f78, tip: 0x2c6e52, under: 0xcfc8b8, beak: 0x333333, patch: 0x2d7a4a, feet: 0x8a8a80 },
  crow: { chord: 0.5, fingered: true, realLen: 0.47, realSpan: 0.98, body: [.24, .24, .66], headR: .11, headY: .1, headZ: .4, wingZ: .07, span: .32, headShape: [.9, .9, 1.25], beakLen: 1.6, hook: 0.15,
    profile: [[0, -.5], [.2, -.3], [.48, .05], [.42, .32], [0, .5]],
    inner: [[0, .12], [.32, .1], [.32, -.14], [.2, -.16], [.1, -.13], [0, -.15]],
    outer: [[0, .1], [.3, .06], [.42, -.02], [.36, -.04], [.45, -.08], [.34, -.09], [.41, -.13], [.28, -.13], [.2, -.16], [0, -.14]],
    tail: [[-.07, 0], [-.11, -.3], [0, -.34], [.11, -.3], [.07, 0]],
    back: 0x1e2026, belly: 0x2a2c33, head: 0x17181c, wing: 0x23262c, tip: 0x111214, under: 0x30333a, beak: 0x2b2b2b, feet: 0x222222 },
  eagle: { chord: 0.5, fingered: true, primaries: 7, tailBars: 0x3a2a1c, realLen: 0.85, realSpan: 2.05, body: [.3, .28, .95], headR: .14, headY: .1, headZ: .52, wingZ: .12, span: .55, headShape: [.85, .85, 1.3], beakLen: 1.3,
    profile: [[0, -.5], [.15, -.34], [.42, -.05], [.48, .2], [.36, .38], [0, .5]],
    inner: [[0, .16], [.55, .14], [.55, -.18], [.4, -.22], [.25, -.19], [.1, -.23], [0, -.22]],
    outer: [[0, .14], [.3, .12], [.5, .06], [.42, .02], [.58, -.02], [.44, -.05], [.57, -.1], [.42, -.12], [.5, -.17], [.3, -.18], [0, -.18]],
    tail: [[-.08, 0], [-.12, -.38], [0, -.42], [.12, -.38], [.08, 0]],
    back: 0x4a3626, belly: 0x3d2c20, head: 0x4a3626, nape: 0xc28a3a, wing: 0x4f3a28, tip: 0x231a13, under: 0x5c4632,
    beak: 0x3a3a3a, beakTip: 0x1e1e1e, cere: 0xe8b830, feet: 0xe8b830 },
};
Object.assign(LOOK, {
  owl: { chord: 0.62, rounded: true, primaries: 7, secondaries: 6, tailBars: 0xb88a4c, realLen: 0.35, realSpan: 0.89, body: [.24, .25, .62], headR: .15, headY: .13, headZ: .32, wingZ: .08, span: .45, headShape: [1.05, 1, 0.85], beakLen: .7, hook: .9,
    profile: [[0, -.5], [.25, -.3], [.5, 0], [.48, .3], [.3, .45], [0, .5]],
    inner: [[0, .18], [.45, .17], [.45, -.24], [.32, -.27], [.2, -.24], [0, -.26]],
    outer: [[0, .17], [.3, .15], [.52, .04], [.5, -.08], [.4, -.18], [.24, -.25], [0, -.24]],
    tail: [[-.07, 0], [-.1, -.22], [.1, -.22], [.07, 0]],
    back: 0xcf9f5a, mantle: 0xb9b0a2, belly: 0xfbf6ec, head: 0xd0a060, face: 0xfdfaf2, wing: 0xd8a862, tip: 0xc2a27a, under: 0xfaf4e6, beak: 0xe6d3b0, feet: 0xd9cfc0 },
  osprey: { chord: 0.42, fingered: true, tailBars: 0x5a4636, realLen: 0.57, realSpan: 1.6, body: [.26, .24, .95], headR: .13, headY: .08, headZ: .52, wingZ: .12, span: .55, headShape: [.85, .85, 1.25], beakLen: 1.3,
    profile: [[0, -.5], [.1, -.36], [.3, -.1], [.48, .16], [.42, .34], [.24, .46], [0, .5]],
    inner: [[0, .12], [.55, .08], [.55, -.12], [.4, -.15], [.25, -.12], [.1, -.15], [0, -.15]],
    outer: [[0, .08], [.35, .02], [.6, -.12], [.52, -.14], [.58, -.18], [.45, -.2], [.5, -.24], [.35, -.2], [0, -.13]],
    tail: [[-.06, 0], [-.1, -.36], [.1, -.36], [.06, 0]],
    back: 0x4a3626, belly: 0xf6f3ec, head: 0xf3efe6, wing: 0x4f3a2a, tip: 0x2a1e15, under: 0xe9e4da, beak: 0x2a2a2a, cere: 0x5f6f80, malar: 0x3a2a1e, eyeRing: 0xf2d23a, feet: 0xb9c4c8 },
  kite: { chord: 0.44, fingered: true, forked: true, realLen: 0.63, realSpan: 1.85, body: [.25, .24, .9], headR: .12, headY: .08, headZ: .48, wingZ: .1, span: .52, headShape: [.85, .85, 1.25], beakLen: 1.2,
    profile: [[0, -.5], [.12, -.34], [.32, -.1], [.48, .16], [.42, .34], [.22, .46], [0, .5]],
    inner: [[0, .13], [.52, .1], [.52, -.14], [.38, -.16], [.24, -.14], [.1, -.17], [0, -.17]],
    outer: [[0, .1], [.3, .06], [.5, -.02], [.44, -.05], [.55, -.09], [.43, -.11], [.52, -.16], [.38, -.17], [0, -.15]],
    tail: [[-.05, 0], [-.15, -.52], [-.07, -.42], [0, -.38], [.07, -.42], [.15, -.52], [.05, 0]],
    back: 0x9a4a24, belly: 0xb5602c, bars: 0x8a3e1c, head: 0xd8d4cc, wing: 0xa65a2c, tip: 0x1f1a17, under: 0xece6dc, tailTop: 0xc4702e, beak: 0x3a3330, cere: 0xe8c040, eyeRing: 0xe8d070, feet: 0xe8c040 },
  hawk: { chord: 0.55, rounded: true, tailBars: 0x3f4a56, realLen: 0.33, realSpan: 0.68, body: [.24, .23, .8], headR: .12, headY: .07, headZ: .42, wingZ: .1, span: .33, headShape: [.85, .85, 1.2], beakLen: 1.0,
    profile: [[0, -.5], [.15, -.32], [.38, -.06], [.48, .18], [.4, .36], [.2, .46], [0, .5]],
    inner: [[0, .14], [.33, .12], [.33, -.15], [.22, -.18], [.1, -.16], [0, -.18]],
    outer: [[0, .12], [.22, .1], [.36, .03], [.4, -.05], [.35, -.12], [.22, -.17], [0, -.16]],
    tail: [[-.07, 0], [-.09, -.55], [0, -.57], [.09, -.55], [.07, 0]],
    back: 0x5d6a7a, belly: 0xf3e7d6, bars: 0xd9874a, head: 0x56636f, cheek: 0xe8a060, wing: 0x5f6c7c, tip: 0x3f4a56, under: 0xe8dccb, tailTop: 0x6a7686, beak: 0x2f2f33, cere: 0xe8c84a, eyeRing: 0xf2a020, feet: 0xf0c83a },
  grouse: { chord: 0.45, rounded: true, primaries: 5, secondaries: 4, realLen: 0.38, realSpan: 0.62, body: [.32, .3, .62], headR: .1, headY: .1, headZ: .36, wingZ: .06, span: .28, beakLen: .7, hook: .5,
    profile: [[0, -.5], [.22, -.3], [.5, .02], [.46, .3], [0, .5]],
    inner: [[0, .12], [.28, .11], [.28, -.13], [.16, -.15], [0, -.14]], outer: [[0, .1], [.22, .06], [.3, -.02], [.26, -.1], [.14, -.14], [0, -.13]],
    tail: [[-.07, 0], [-.09, -.18], [.09, -.18], [.07, 0]],
    back: 0x6a3820, belly: 0x5a2c18, bars: 0x3a2014, head: 0x7a4024, wing: 0x7a4a2c, tip: 0x5a3a24, under: 0x9a7a5a, beak: 0x2a2a2a, eyeRing: 0xd8342a, feet: 0xe8e0d0 },
  finch: { chord: 0.45, primaries: 5, secondaries: 3, tailFeathers: 5, realLen: 0.145, realSpan: 0.26, body: [.2, .2, .42], headR: .09, headY: .08, headZ: .24, wingZ: .04, span: .18, beakLen: .8, hook: .2,
    profile: [[0, -.5], [.2, -.3], [.5, .05], [.44, .32], [0, .5]],
    inner: [[0, .08], [.18, .07], [.18, -.08], [0, -.09]], outer: [[0, .07], [.2, .03], [.24, -.04], [.12, -.08], [0, -.08]],
    tail: [[-.04, 0], [-.05, -.22], [.05, -.22], [.04, 0]],
    back: 0x8a6a4c, belly: 0xd98f78, head: 0x6f8aa6, wing: 0x3a3836, tip: 0x2c2a28, under: 0xd8cfc4, beak: 0xa8a6a0, feet: 0x9a8a80 },
});

// birds of the rainforest and the Arctic, built from the British shapes with new sizes and colours
const like = (base, o) => ({ ...LOOK[base], _fit: undefined, _geo: undefined, ...o });
Object.assign(LOOK, {
  harpy: like('eagle', { rounded: true, chord: 0.6, primaries: 7, secondaries: 6, tailBars: 0x2a2a2e, realLen: 0.95, realSpan: 1.9, headR: .16, headShape: [.95, .95, 1.15], beakLen: 1.15, hook: .8,
    tail: [[-.08, 0], [-.12, -.46], [0, -.5], [.12, -.46], [.08, 0]],
    back: 0x3a3c42, mantle: 0x2c2e33, belly: 0xf2f0ea, head: 0xa8aab0, nape: undefined, crest: 0x2a2a2e, cheek: 0xb8bac0, wing: 0x3e4048, tip: 0x1e2024, under: 0xe8e6e0,
    tailTop: 0x45474e, beak: 0x2a2a2a, beakTip: 0x151515, cere: 0x2a2a2a, neck: 0x26282c, feet: 0xf0c83a }),
  batfalcon: like('falcon', { realLen: 0.26, realSpan: 0.6, back: 0x1c1e24, mantle: 0x15171c, belly: 0xb85a2a, bars: 0x1c1e24, head: 0x15171c, cheek: 0xf0dcb8,
    wing: 0x23262e, tip: 0x111318, under: 0x3a3a40, malar: undefined, tailBars: 0x6a6a70 }),
  gyr: like('falcon', { realLen: 0.55, realSpan: 1.25, chord: 0.44, back: 0xd2d0c8, mantle: 0xb8b6ae, belly: 0xf6f4ee, bars: 0x8a8a90, head: 0xe6e4dc, cheek: 0xf6f4ee,
    wing: 0xc8c6be, tip: 0x5a5a62, under: 0xeeece6, malar: 0x9a9aa0, tailBars: 0x8a8a90, beak: 0x6a7280, cere: 0xe8c84a, eyeRing: 0xe8c84a, feet: 0xe8c84a }),
  snowyowl: like('owl', { realLen: 0.6, realSpan: 1.4, headShape: [1, 0.95, 0.95], back: 0xf2f0ea, mantle: 0xe0ded6, belly: 0xfbfaf6, bars: 0x3a3a3a, head: 0xf4f2ec, face: 0xffffff,
    wing: 0xeeece4, tip: 0xd8d6ce, under: 0xfbfaf6, tailBars: 0x6a6a6a, beak: 0x2a2a2a, eyeRing: 0xf2d020, feet: 0xfbfaf6 }),
  macaw: like('pigeon', { realLen: 0.85, realSpan: 1.0, chord: 0.36, tailFeathers: 5, headR: .12, beakLen: 1.1, hook: 1.1, beakW: .5,
    tail: [[-.05, 0], [-.06, -.7], [0, -.85], [.06, -.7], [.05, 0]],
    back: 0xd8261e, belly: 0xd02a20, head: 0xe02a22, face: 0xf6f0e6, wing: 0xf0c020, tip: 0x2a4ac0, under: 0xc0302a, tailTop: 0xd8261e, beak: 0xe8e0d0, beakTip: 0x222222, neck: undefined, feet: 0x5a5a5a }),
  toucan: like('crow', { rounded: true, fingered: false, realLen: 0.6, realSpan: 0.6, beakLen: 3.4, beakW: .55, hook: .15,
    tail: [[-.07, 0], [-.09, -.3], [.09, -.3], [.07, 0]],
    back: 0x15161a, belly: 0x18191d, head: 0x15161a, cheek: 0xffffff, beak: 0xf5891e, beakTip: 0x1a1a1a, eyeRing: 0x3a8ad8, feet: 0x5a7ab0 }),
  parakeet: like('finch', { realLen: 0.25, realSpan: 0.4, beakLen: .7, hook: 1.1, beakW: .45,
    tail: [[-.03, 0], [-.04, -.4], [0, -.48], [.04, -.4], [.03, 0]], back: 0x4ab03a, belly: 0x7ad04a, head: 0x5ac040, wing: 0x3a9a30, tip: 0x2a6a8a, under: 0x8ad05a, beak: 0xe8b0a0, feet: 0x8a8a8a }),
  muscovy: like('teal', { realLen: 0.75, realSpan: 1.35, back: 0x1e2a26, belly: 0x22262a, head: 0x2a2e30, face: 0xc0302a, wing: 0x1a3a30, tip: 0x0f1a16, under: 0xf2f2f2, patch: undefined, beak: 0xe8b0a8, feet: 0x3a3a3a }),
  tinamou: like('grouse', { realLen: 0.42, realSpan: 0.6, back: 0x6a6a3a, belly: 0x8a7a54, head: 0x5a5a32, wing: 0x6a6038, tip: 0x4a4228, bars: 0x4a4a2a, eyeRing: undefined, beak: 0x6a6a5a, feet: 0x8a9aa0 }),
  goose: like('teal', { realLen: 0.7, realSpan: 1.45, chord: 0.38, headR: .11, back: 0xf4f4f0, belly: 0xffffff, head: 0xf8f8f4, wing: 0xf0f0ec, tip: 0x1a1a1a, under: 0xf4f4f0, patch: undefined, beak: 0xe88a8a, feet: 0xe88a8a }),
  raven: like('crow', { realLen: 0.63, realSpan: 1.2, beakLen: 1.9, tail: [[-.07, 0], [-.12, -.34], [0, -.42], [.12, -.34], [.07, 0]], back: 0x121318, head: 0x0e0f12 }),
  bunting: like('finch', { realLen: 0.165, realSpan: 0.33, back: 0x3a3632, mantle: 0x2a2622, belly: 0xffffff, head: 0xf4f2ee, wing: 0xffffff, tip: 0x1a1a1a, under: 0xffffff, beak: 0x2a2a2a, feet: 0x1a1a1a }),
  longtail: like('teal', { realLen: 0.5, realSpan: 0.73, tail: [[-.04, 0], [-.05, -.3], [0, -.5], [.05, -.3], [.04, 0]], back: 0x2a2622, belly: 0xf4f2ee, head: 0xf4f2ee, cheek: 0x8a8070,
    wing: 0x2a2622, tip: 0x1a1a1a, under: 0xd8d4cc, patch: 0x6a6a5a, beak: 0xe89aa0, feet: 0x6a6a6a }),
  ptarmigan: like('grouse', { back: 0xd8d2c0, mantle: 0xa89a7a, belly: 0xffffff, bars: undefined, head: 0xb8ac90, wing: 0xffffff, tip: 0xf4f4f0, under: 0xffffff, feet: 0xffffff }),
  bat: like('finch', { rounded: true, primaries: 4, secondaries: 3, tailFeathers: 3, realLen: 0.11, realSpan: 0.4, beakLen: .4, crest: 0x4a3a30,
    back: 0x4a3a30, belly: 0x6a5444, head: 0x4a3a30, wing: 0x2a201c, tip: 0x2a201c, under: 0x3a2c26, beak: 0x3a2a24, feet: 0x2a201c }),
});

// Each playable bird flies differently, has its own special skill and its own favourite food.
const SPECIES = {
  peregrine: { lookLimit: 1.6, look: 'falcon', name: 'Peregrine Falcon', plural: 'Peregrines', drag: .0016, tuckDrag: .00098, arrowDrag: .00078, thrust: 1.88, lift: 2.6, turn: 1.95, energy: 100, flapCost: 5, maxSpeed: 115, thermal: 1, ability: null, start: 7,
    diet: { grouse: 1, pigeon: 1, teal: 1, crow: 1, finch: .8, shrew: 1, eel: 1, fish: .3, hare: .1, carrion: .6 } },
  eagle: { lookLimit: 1.6, look: 'eagle', name: 'Golden Eagle', plural: 'Golden eagles', drag: .0013, tuckDrag: .0016, arrowDrag: .0013, thrust: 1.75, lift: 2.8, turn: 1.4, energy: 140, flapCost: 6, maxSpeed: 90, thermal: 1.3, ability: 'sight', start: 7,
    diet: { grouse: 1.15, hare: 1.2, crow: .9, teal: .8, pigeon: .7, shrew: .9, fish: .6, eel: .7, carrion: 1, finch: .3 } },
  owl: { lookLimit: 4.71, look: 'owl', name: 'Barn Owl', plural: 'Barn owls', drag: .0024, tuckDrag: .0035, arrowDrag: .003, thrust: 1.75, lift: 3, turn: 2.4, energy: 90, flapCost: 4, maxSpeed: 60, thermal: .8, ability: 'listen', nocturnal: true, silent: true, start: 19.5,
    diet: { grouse: .2, shrew: 1.25, finch: .6, pigeon: .4, teal: .2, crow: .2, eel: .3, fish: .2, hare: .1, carrion: .5 } },
  osprey: { lookLimit: 1.6, look: 'osprey', name: 'Osprey', plural: 'Ospreys', drag: .0017, tuckDrag: .0014, arrowDrag: .0012, thrust: 1.88, lift: 2.8, turn: 1.7, energy: 110, flapCost: 5, maxSpeed: 90, thermal: 1, ability: 'hover', start: 7,
    diet: { grouse: .1, fish: 1.3, eel: 1.2, pigeon: .15, teal: .15, crow: .1, finch: .1, shrew: .15, hare: .05, carrion: .1 } },
  kite: { lookLimit: 1.6, look: 'kite', name: 'Red Kite', plural: 'Red kites', drag: .0011, tuckDrag: .0025, arrowDrag: .002, thrust: 1.5, lift: 2.4, turn: 2.6, energy: 120, flapCost: 4.5, maxSpeed: 80, thermal: 1.2, ability: 'scan', start: 7,
    diet: { grouse: .25, carrion: 1.25, shrew: .9, finch: .4, pigeon: .3, eel: .5, fish: .4, crow: .2, teal: .2, hare: .1 } },
  hawk: { lookLimit: 1.7, look: 'hawk', name: 'Sparrowhawk', plural: 'Sparrowhawks', drag: .002, tuckDrag: .0018, arrowDrag: .0015, thrust: 2.75, lift: 3, turn: 2.9, energy: 80, flapCost: 6, maxSpeed: 90, thermal: .9, ability: 'burst', treeSafe: true, start: 7,
    diet: { grouse: .6, finch: 1.3, pigeon: .8, shrew: .6, crow: .3, teal: .3, eel: .3, fish: .1, hare: .05, carrion: .3 } },
  harpy: { world: 'rainforest', lookLimit: 1.6, look: 'harpy', name: 'Harpy Eagle', plural: 'Harpy eagles', drag: .0019, tuckDrag: .0022, arrowDrag: .0018, thrust: 2.2, lift: 2.9, turn: 2.3, energy: 130, flapCost: 6, maxSpeed: 80, thermal: 1, ability: 'sight', treeSafe: true, start: 7,
    diet: { monkey: 1.3, sloth: 1.3, crow: .9, pigeon: .8, hare: 1.1, grouse: .8, teal: .6, shrew: .4, finch: .3, bat: .3, fish: .2, eel: .2, carrion: .4 } },
  batfalcon: { world: 'rainforest', lookLimit: 1.6, look: 'batfalcon', name: 'Bat Falcon', plural: 'Bat falcons', drag: .0016, tuckDrag: .001, arrowDrag: .0008, thrust: 2.1, lift: 2.7, turn: 2.4, energy: 90, flapCost: 5, maxSpeed: 110, thermal: 1, ability: null, start: 16,
    diet: { bat: 1.3, finch: 1.25, crow: .5, pigeon: .35, teal: .3, grouse: .3, shrew: .8, monkey: .05, sloth: .05, hare: .05, fish: .1, eel: .1, carrion: .2 } },
  snowyowl: { world: 'arctic', lookLimit: 2.35, look: 'snowyowl', name: 'Snowy Owl', plural: 'Snowy owls', drag: .0021, tuckDrag: .003, arrowDrag: .0026, thrust: 1.8, lift: 3, turn: 2.2, energy: 110, flapCost: 4.5, maxSpeed: 70, thermal: .9, ability: 'listen', silent: true, start: 9,
    diet: { shrew: 1.3, grouse: 1.1, hare: 1, teal: .8, finch: .7, pigeon: .5, crow: .4, fish: .3, eel: .3, carrion: .6 } },
  gyr: { world: 'arctic', lookLimit: 1.6, look: 'gyr', name: 'Gyrfalcon', plural: 'Gyrfalcons', drag: .0016, tuckDrag: .001, arrowDrag: .0008, thrust: 2.0, lift: 2.7, turn: 1.9, energy: 115, flapCost: 5, maxSpeed: 115, thermal: 1, ability: null, start: 7,
    diet: { grouse: 1.3, teal: 1.1, pigeon: 1, crow: .9, finch: .7, shrew: .8, hare: .8, fish: .3, eel: .3, carrion: .6 } },
};
for (const sp of Object.values(SPECIES)) sp.world = sp.world || 'valley';
const ABILITY = {
  sight: { label: 'SIGHT', name: 'Keen sight', hold: false },
  listen: { label: 'LISTEN', name: 'Listen', hold: true },
  hover: { label: 'HOVER', name: 'Hover', hold: true },
  scan: { label: 'SCAN', name: 'Scan for food', hold: false },
  burst: { label: 'BURST', name: 'Burst of speed', hold: false },
};
let spId = 'peregrine', SP = SPECIES.peregrine;

const PREY = {
  pigeon: { name: 'Wood pigeon', xp: 40, speed: 15, flee: 23, alert: 45, feathers: [0x9aa2b0, 0xb8a2ae, 0xe9e9ee], food: 45 },
  teal: { name: 'Teal', xp: 90, speed: 20, flee: 30, alert: 60, feathers: [0x8d8f8a, 0xdcd2bf, 0x2c6e52], food: 55, restOn: 'water' },
  grouse: { name: 'Red grouse', xp: 55, speed: 17, flee: 21, alert: 35, feathers: [0x7a3f24, 0x9a5a34, 0x3a2418], food: 50, restOn: 'ground' },
  crow: { name: 'Carrion crow', xp: 60, speed: 13, flee: 21, alert: 40, feathers: [0x1e2026, 0x30333a, 0x111214], food: 55 },
  shrew: { name: 'Shrew', xp: 12, food: 22, feathers: [0x5e4632, 0xb8a58a], critter: true, range: 160 },
  eel: { name: 'Eel', xp: 30, food: 35, feathers: [0x4b5a2c, 0xcfe8f5, 0xffffff], critter: true, range: 260 },
  finch: { name: 'Chaffinch', xp: 25, speed: 11, flee: 17, alert: 30, feathers: [0x8a6a4c, 0xd98f78, 0x6f8aa6], food: 18 },
  hare: { name: 'Mountain hare', xp: 70, food: 70, feathers: [0x8a6a48, 0xd8c8a8], critter: true, range: 300 },
  fish: { name: 'Brown trout', xp: 45, food: 45, feathers: [0xcfe8f5, 0xffffff, 0x9fd0ec], critter: true, range: 260 },
  carrion: { name: 'Dead rabbit', xp: 20, food: 50, feathers: [0x8a7a68, 0xb0a08a], critter: true, range: 300 },
};
Object.assign(PREY, {
  monkey: { name: 'Capuchin monkey', xp: 80, food: 70, feathers: [0x6a4a2a, 0xe8d8b8], critter: true, range: 300 },
  sloth: { name: 'Three-toed sloth', xp: 90, food: 85, feathers: [0x8a7a5a, 0x6a7a4a], critter: true, range: 300 },
  bat: { name: 'Fruit bat', xp: 35, speed: 12, flee: 18, alert: 30, feathers: [0x4a3a30, 0x2a201c, 0x6a5444], food: 22, nightOnly: true },
});
// the same jobs are done by different animals in each world: [name, look, feathers, food]
const SKINS = {
  rainforest: {
    pigeon: ['Scarlet macaw', 'macaw', [0xd8261e, 0xf0c020, 0x2a4ac0], 50],
    crow: ['Toco toucan', 'toucan', [0x15161a, 0xffffff, 0xf5891e], 60],
    finch: ['Green parakeet', 'parakeet', [0x4ab03a, 0x7ad04a, 0x2a6a8a], 22],
    teal: ['Muscovy duck', 'muscovy', [0x1e2a26, 0xf2f2f2, 0x1a3a30], 60],
    grouse: ['Great tinamou', 'tinamou', [0x6a6a3a, 0x8a7a54, 0x4a4a2a], 50],
    shrew: ['Anole lizard', null, [0x5ab04a, 0xd8e0a0]], eel: ['Electric eel', null, [0x3a3a38, 0xd08a3a, 0xcfe8f5]], hare: ['Agouti', null, [0x8a5a2a, 0xc89a5a]],
    fish: ['Peacock bass', null, [0x9ab03a, 0xe8c050, 0xcfe8f5]], carrion: ['Dead peccary', null, [0x4a4038, 0x6a5a4a]],
  },
  arctic: {
    pigeon: ['Snow goose', 'goose', [0xf4f4f0, 0xffffff, 0x1a1a1a], 70],
    crow: ['Common raven', 'raven', [0x121318, 0x23262c, 0x30333a], 60],
    finch: ['Snow bunting', 'bunting', [0xffffff, 0x3a3632, 0x1a1a1a], 18],
    teal: ['Long-tailed duck', 'longtail', [0x2a2622, 0xf4f2ee, 0x8a8070], 55],
    grouse: ['Rock ptarmigan', 'ptarmigan', [0xffffff, 0xb0a890, 0xeeeeea], 55],
    shrew: ['Lemming', null, [0x8a6a4a, 0xd8c8a0]], eel: ['Arctic grayling', null, [0x6a7078, 0xcfe8f5, 0xffffff]], hare: ['Arctic hare', null, [0xf2f2ee, 0xffffff]],
    fish: ['Arctic char', null, [0xd85a3a, 0xcfe8f5, 0xffffff]], carrion: ['Caribou leftovers', null, [0x6a523a, 0xe6dccb]],
  },
};
for (const [type, [name, look, feathers, food]] of Object.entries(SKINS[BIOME] || {})) {
  PREY[type].name = name;
  if (look) LOOK[type] = LOOK[look];
  if (feathers) PREY[type].feathers = feathers;
  if (food) PREY[type].food = food;
}
// colours for the ground animals in each world
const CRIT = {
  valley: { shrew: [0x5e4632, 0xb8a58a, 0xd99a9a, 0x4a3828], hare: [0x8a6a48, 0xd8c8a8, 0x222222], eel: [0x4b5a2c, 0xc9b98a], fish: [0x7a6a48, 0x3a2a1a, 0xe8dcc0, 0x6a5a3a], carrion: [0x8a7a68, 0xb0a08a, 0x7a6a58] },
  rainforest: { shrew: [0x5ab04a, 0xd8e0a0, 0x4a9a3a, 0x4a9a3a], hare: [0x8a5a2a, 0xc89a5a, 0x6a4020], eel: [0x3a3a38, 0xd08a3a], fish: [0x9ab03a, 0x1a2a1a, 0xe8c050, 0xd8502a], carrion: [0x4a4038, 0x6a5a4a, 0x3a302a] },
  arctic: { shrew: [0x8a6a4a, 0xd8c8a0, 0xb08a7a, 0x8a6a4a], hare: [0xf2f2ee, 0xffffff, 0x222222], eel: [0x6a7078, 0xd8dce0], fish: [0x5a6a5a, 0xe8e0c8, 0xd85a3a, 0x4a5a4a], carrion: [0x6a523a, 0xe6dccb, 0x5a4430] },
}[BIOME];
const catchable = p => p.state === 'fly' || p.state === 'active';

// ---------- nests: every species has its own home ----------
const PEREGRINE_Z = -180, PEREGRINE_X = riverX(PEREGRINE_Z) - CLIFF - 22;
let EZ = PEREGRINE_Z, EX = PEREGRINE_X, EY = groundAt(EX, EZ);
const EYRIE = new V3(EX, EY, EZ);
const chicks = [];
let chickHop = 0;
const NESTS = {};
function buildNest(id, x, y, z, { scale = 1.3, rocks = false, rags = false, perch = [2.4, 1.0, 0.6], chicksN = 3, owlets = false } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const nest = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.6, 6, 14).rotateX(Math.PI / 2), toon(0x7a5a3a)); nest.position.y = 0.4; g.add(nest);
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.2, 0.5, 12), toon(0x5a4129)); fill.position.y = 0.3; g.add(fill);
  if (rocks) { const rockG = new THREE.DodecahedronGeometry(1, 0), rockM = toon(0x8f887c); for (let i = 0; i < 7; i++) { const r = new THREE.Mesh(rockG, rockM), a = i / 7 * 6.28; r.scale.setScalar(1 + rand() * 1.6); r.position.set(Math.cos(a) * 4.2, 0.3, Math.sin(a) * 4.2); g.add(r); } }
  // red kites really do decorate their nests with rags and litter
  if (rags) for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35), toon([0xf2f2f2, 0x4a7fc0, 0xe0c040, 0xd04040][i], { side: THREE.DoubleSide })); r.position.set(Math.cos(i * 1.6) * 1.6, 0.7, Math.sin(i * 1.6) * 1.6); r.rotation.set(rand(), rand() * 6, rand()); g.add(r); }
  const fluff = new THREE.IcosahedronGeometry(0.5, 0), fluffM = toon(0xfbf8f1), beakM = toon(owlets ? 0xe6d3b0 : 0x30343b), eyeM = toon(0x0d0d0d);
  for (let i = 0; i < chicksN; i++) {
    // downy chicks stand about a quarter as tall as their parent is long
    const k = 0.28 * LOOK[SPECIES[id].look].realLen / scale, gap = Math.min(0.75, k * 0.95);
    const c = new THREE.Group(); c.scale.setScalar(k); c.position.set((i - (chicksN - 1) / 2) * gap, 0.55 + 0.3 * k, (i % 2) * gap * 0.5 - gap * 0.25); c.rotation.y = Math.PI / 2 + (i - 1) * 0.4;
    const b = new THREE.Mesh(fluff, fluffM); b.scale.set(.75, .7, .75); c.add(b);
    const hd = new THREE.Group(); hd.position.set(0, .5, .18); c.add(hd);
    const hm = new THREE.Mesh(fluff, fluffM); hm.scale.setScalar(owlets ? .55 : .45); hd.add(hm);
    const bk = new THREE.Mesh(new THREE.ConeGeometry(.06, .16, 4).rotateX(Math.PI / 2), beakM); bk.position.set(0, -.03, .24); hd.add(bk);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.OctahedronGeometry(.05, 0), eyeM); e.position.set(s * .13, .06, .16); hd.add(e); }
    g.add(c); chicks.push({ g: c, hd, ph: i * 1.7 });
  }
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.scale.setScalar(scale);
  scene.add(g);
  // you perch on the rim facing out over the valley, with your chicks behind you
  const out = x < riverX(z) ? Math.PI / 2 : -Math.PI / 2;
  NESTS[id] = { x, y, z, yaw: out, perch: new V3(x + Math.sin(out) * 1.9 * scale, y + 0.6 * scale, z + Math.cos(out) * 1.9 * scale) };
}
function nearestTree(x, z, kind) { let best = null, bd = Infinity; for (const t of TREES) { if (kind && t.kind !== kind) continue; const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = t; } } return best; }
// a tall dead tree with a few bare branches; returns the height of its top
function deadTree(x, z, hgt) {
  const h = heightAt(x, z), snag = new THREE.Group(), deadM = toon(0x8f8a80);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, hgt, 6), deadM); trunk.position.y = hgt / 2; snag.add(trunk);
  for (const [a, y] of [[0.6, hgt * 0.6], [2.5, hgt * 0.75], [4.2, hgt * 0.45]]) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 5, 5), deadM); br.position.set(Math.cos(a) * 1.6, y, Math.sin(a) * 1.6); br.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); snag.add(br); }
  snag.position.set(x, h, z); snag.traverse(m => { m.castShadow = true; }); scene.add(snag);
  COLLIDERS.push({ x, z, r: 1.4, top: h + hgt - 0.4, name: 'dead tree' });
  return h + hgt - 0.4;
}
if (BIOME === 'valley') {
  buildNest('peregrine', EX, EY, EZ, { scale: 0.3, rocks: true });
  // golden eagle: the highest gentle crag in the western mountains, below the thin air
  let best = null, bh = -1;
  for (let x = -1000; x < -500; x += 20) for (let z = -900; z < 900; z += 20) {
    const h = heightAt(x, z); if (h < bh || h > THIN_AIR - 70 || Math.hypot(x, z) > 980 || slopeAt(x, z) < 0.75) continue; bh = h; best = [x, z];
  }
  buildNest('eagle', best[0], groundAt(best[0], best[1]), best[1], { scale: 0.65, rocks: true, chicksN: 2 });
  // barn owl: an old barn out in the fields, nest up on its roof beam
  let bx = riverX(-120) + 230, bz = -120;
  for (let k = 0; k < 200; k++) { const x = riverX(-120) + 180 + rand() * 160, z = -220 + rand() * 200; const h = heightAt(x, z); if (h > 4 && h < 40 && slopeAt(x, z) > 0.95 && !treesNear(x, z).some(t => Math.hypot(t.x - x, t.z - z) < 18)) { bx = x; bz = z; break; } }
  const bh2 = heightAt(bx, bz), barn = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(9, 7, 15), toon(0x8a3b2a)); walls.position.y = 3.5; barn.add(walls);
  const roofB = new THREE.Mesh(new THREE.CylinderGeometry(0, 6.4, 3.6, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.75), toon(0x4a4f58)); roofB.position.y = 8.8; barn.add(roofB);
  const door = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.2, 0.2), toon(0x3a2418)); door.position.set(0, 2.1, 7.55); barn.add(door);
  const hole = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.2), new THREE.MeshBasicMaterial({ color: 0x120c08 })); hole.position.set(0, 7.2, 7.55); barn.add(hole);
  barn.position.set(bx, bh2 - 0.2, bz); barn.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); scene.add(barn);
  COLLIDERS.push({ x: bx, z: bz, r: 7, top: bh2 + 10.4, name: 'barn roof' });
  buildNest('owl', bx, bh2 + 10.2, bz, { scale: 0.3, owlets: true, chicksN: 3 });
  // osprey: a big stick nest on top of a dead tree by the river
  let ox = riverX(560) + 52, oz = 560;
  for (let k = 0; k < 40 && heightAt(ox, oz) < 2; k++) ox += 4;
  buildNest('osprey', ox, deadTree(ox, oz, 20), oz, { scale: 0.5, chicksN: 2 });
  // red kite: high in a big oak, decorated with rags
  const kt = nearestTree(riverX(300) + 330, 300, 'oak');
  buildNest('kite', kt.x, kt.top - 0.1, kt.z, { scale: 0.35, rags: true, chicksN: 2 });
  NESTS.kite.camMin = kt.top + 0.6;
  // sparrowhawk: high in a tree in the woods
  const ht = nearestTree(riverX(-420) + 280, -420, 'oak');
  buildNest('hawk', ht.x, ht.top - 0.1, ht.z, { scale: 0.25, chicksN: 3 });
  NESTS.hawk.camMin = ht.top + 0.6;
} else if (BIOME === 'rainforest') {
  // harpy eagle: a huge stick nest on top of a giant emergent kapok tree
  const want = [riverX(-250) - 260, -250];
  let gt = null, gd = Infinity; for (const t of TREES) if (t.giant) { const d = Math.hypot(t.x - want[0], t.z - want[1]); if (d < gd) { gd = d; gt = t; } }
  buildNest('harpy', gt.x, gt.top - 0.4, gt.z, { scale: 0.75, chicksN: 1 }); NESTS.harpy.camMin = gt.top + 1;
  // bat falcon: high in a tall dead tree standing on the river bank
  let ox = riverX(140) + 34, oz = 140; for (let k = 0; k < 40 && heightAt(ox, oz) < 2; k++) ox += 4;
  buildNest('batfalcon', ox, deadTree(ox, oz, 36) + 0.45, oz, { scale: 0.3, chicksN: 3 });
} else {
  // snowy owl: a scrape on top of a low rise in the open tundra
  let best = [riverX(250) + 200, 250], bh = -1;
  for (let x = -100; x < 500; x += 12) for (let z = -100; z < 600; z += 12) {
    const h = heightAt(x, z); if (h > bh && h > 6 && h < 70 && slopeAt(x, z) > 0.9 && Math.hypot(x - VX, z - VZ) > 120) { bh = h; best = [x, z]; }
  }
  buildNest('snowyowl', best[0], groundAt(best[0], best[1]), best[1], { scale: 0.4, owlets: true, chicksN: 4 });
  // gyrfalcon: a bare ledge high on the crag
  let gb = [CRAG.x, CRAG.z], gh = -1;
  for (let x = CRAG.x - 120; x < CRAG.x + 120; x += 6) for (let z = CRAG.z - 120; z < CRAG.z + 120; z += 6) {
    const h = heightAt(x, z); if (h > gh && h < THIN_AIR - 70 && slopeAt(x, z) > 0.7) { gh = h; gb = [x, z]; }
  }
  buildNest('gyr', gb[0], groundAt(gb[0], gb[1]), gb[1], { scale: 0.32, rocks: true, chicksN: 3 });
}
// start next to the first nest in this world
{ const first = NESTS[Object.keys(NESTS)[0]]; EX = first.x; EY = first.y; EZ = first.z; EYRIE.set(EX, EY, EZ); }
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 340, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xf0c02a, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
beacon.position.set(EX, EY + 170, EZ); beacon.visible = false; scene.add(beacon);

// ---------- thermals ----------
const THERMALS = [
  [EX + 160, EZ + 90], [riverX(-520) + 260, -520], [riverX(330) + 360, 330], [riverX(680) - 170, 680], [riverX(-820) + 120, -820], [riverX(60) - 210, 60]
].map(([x, z]) => ({ x, z, r: 42, lift: 7, top: THIN_AIR - 10, base: groundAt(x, z) }));
// ---------- wind ----------
// Wind gets stronger with height and veers (turns) as you climb. Its strength and direction slowly change over time.
const W = { dir: rand() * 6.283, strength: 2.6 };
const wTmp = new V3();
function windAt(y, out) {
  const h = clamp(y / THIN_AIR, 0, 1.3);
  const gust = 0.85 + 0.15 * Math.sin(game.t * 0.9 + y * 0.013) * Math.sin(game.t * 0.37);
  const speed = (1 + W.strength * (0.25 + h)) * gust;
  const dir = W.dir + h * 1.3;
  return out.set(Math.sin(dir) * speed, 0, Math.cos(dir) * speed);
}
function updateWind(dt) {
  W.dir += Math.sin(game.t * 0.013) * 0.03 * dt;
  W.strength = 2.6 + 1.4 * Math.sin(game.t * 0.006 + 1.7);
}
// thermals lean downwind as they rise
function thermalLean(t, y) { windAt(y, wTmp); const k = Math.max(0, y - t.base) / 60; return { x: t.x + wTmp.x * k, z: t.z + wTmp.z * k }; }
const MOTES = 140;
const moteGeo = new THREE.BufferGeometry();
const motePos = new Float32Array(THERMALS.length * MOTES * 3), moteData = [];
THERMALS.forEach(t => { for (let i = 0; i < MOTES; i++) moteData.push({ t, a: rand() * 6.28, r: Math.sqrt(rand()) * t.r, y: t.base + rand() * (t.top - t.base), s: 4 + rand() * 4 }); });
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: 0xffeab0, size: 1.8, transparent: true, opacity: 0.65, depthWrite: false }));
motes.frustumCulled = false;
scene.add(motes);
function updateThermals(dt) {
  motes.material.opacity = 0.65 * (1 - nightF * 0.8);
  moteData.forEach((m, i) => {
    m.y += m.s * dt; m.a += dt * 0.7;
    if (m.y > m.t.top) m.y = m.t.base + 2;
    const rr = m.r * (0.6 + 0.4 * (m.y - m.t.base) / (m.t.top - m.t.base));
    const c = thermalLean(m.t, m.y);
    motePos[i * 3] = c.x + Math.cos(m.a) * rr; motePos[i * 3 + 1] = m.y; motePos[i * 3 + 2] = c.z + Math.sin(m.a) * rr;
  });
  moteGeo.attributes.position.needsUpdate = true;
}

// ---------- time of day ----------
const HOUR = 40;                       // real seconds per game hour (a full day is 16 minutes)
const TOD = { hour: 7, day: 1, scale: 1 };
let nightF = 0;
const SKY = {
  dayTop: new THREE.Color(BIOME === 'rainforest' ? 0x5c9fd6 : BIOME === 'arctic' ? 0x6ea9dc : 0x3f8fd4), dayHor: new THREE.Color(BIOME === 'rainforest' ? 0xd6e6cc : BIOME === 'arctic' ? 0xe8eff3 : 0xd3e9ef), duskTop: new THREE.Color(0x47609c), duskHor: new THREE.Color(0xf2a774),
  nightTop: new THREE.Color(0x060b1f), nightHor: new THREE.Color(0x18233f),
  hemiDay: new THREE.Color(0xc4e4ff), hemiNight: new THREE.Color(0x5a70b0), gDay: new THREE.Color(0x6a8a48), gNight: new THREE.Color(0x1a2030),
  sunCol: new THREE.Color(0xfff0d2), duskCol: new THREE.Color(0xffa060), moonCol: new THREE.Color(0x9fb4ff),
  winOff: new THREE.Color(0x55524a), winOn: new THREE.Color(0xffc861), cloudDay: new THREE.Color(0xffffff), cloudNight: new THREE.Color(0x46506e),
};
function updateTime(dt) {
  const before = TOD.hour;
  TOD.hour += dt * TOD.scale / HOUR;
  if (TOD.hour >= 24) { TOD.hour -= 24; TOD.day++; }
  if (game.state === 'play') {
    if (before < 20 && TOD.hour >= 20) toast(SP.nocturnal ? 'Night has fallen. Time to hunt!' : 'Night is falling. Find a safe place to sleep: a tree or your nest.', 'gold', 4500);
    if (before < 6 && TOD.hour >= 6 && F.mode !== 'sleep') toast(SP.nocturnal ? 'Dawn. Go back to your nest or find a tree and sleep through the day.' : 'Dawn. Time to hunt!', 'gold', 4500);
  }
  const a = (TOD.hour - 6) / 12 * Math.PI;
  SUN_DIR.set(Math.cos(a) * 0.85, Math.sin(a), 0.35).normalize();
  MOON_DIR.set(-Math.cos(a) * 0.7, -Math.sin(a) * 0.9 + 0.2, -0.3).normalize();
  const elev = SUN_DIR.y;
  nightF = 1 - smooth(-0.12, 0.12, elev);
  const dusk = clamp(1 - Math.abs(elev) / 0.28, 0, 1);
  skyU.top.value.copy(SKY.dayTop).lerp(SKY.nightTop, nightF).lerp(SKY.duskTop, dusk * 0.55);
  skyU.horizon.value.copy(SKY.dayHor).lerp(SKY.nightHor, nightF).lerp(SKY.duskHor, dusk * 0.7);
  skyU.night.value = nightF;
  scene.fog.color.copy(skyU.horizon.value);
  hemi.intensity = lerp(1.05, 0.38, nightF) + (SP.nocturnal ? nightF * 0.75 : 0);  // owls see well in the dark
  hemi.color.copy(SKY.hemiDay).lerp(SKY.hemiNight, nightF); hemi.groundColor.copy(SKY.gDay).lerp(SKY.gNight, nightF);
  if (elev > -0.03) { sun.intensity = 2.1 * smooth(-0.03, 0.2, elev); sun.color.copy(SKY.sunCol).lerp(SKY.duskCol, dusk * 0.7); LIGHT_DIR.copy(SUN_DIR); }
  else { sun.intensity = 0.6 * nightF; sun.color.copy(SKY.moonCol); LIGHT_DIR.copy(MOON_DIR); }
  stars.material.opacity = nightF * 0.9;
  if (aurora.mat) { aurora.mat.uniforms.t.value = game.t; aurora.mat.uniforms.night.value = nightF; }
  if (waterfall.mat) waterfall.mat.map.offset.y += dt * 0.9;
  windowMat.color.copy(SKY.winOff).lerp(SKY.winOn, nightF);
  cloudMat.color.copy(SKY.cloudDay).lerp(SKY.cloudNight, nightF); cloudMat.emissiveIntensity = 0.35 * (1 - nightF);
}
const spdUnit = () => settings.mph ? 'mph' : 'km/h';
const spd = kmh => Math.round(settings.mph ? kmh * 0.621 : kmh) + ' ' + spdUnit();
const fmtTime = h => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0');
const partOfDay = h => h < 5 ? 'Night' : h < 7 ? 'Dawn' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 20 ? 'Evening' : 'Night';

// ---------- settings, progress and saves ----------
const SETTINGS_KEY = 'talon-settings-v1', AUTO_KEY = 'talon-auto-v2', SLOT_KEY = n => 'talon-slot-v2-' + n;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};
const settings = { invert: false, muted: false, autoLevel: false, horizon: true, mph: true, ...(store.get(SETTINGS_KEY) || {}) };
const saveSettings = () => store.set(SETTINGS_KEY, settings);
const blankStats = () => ({ monkey: 0, sloth: 0, bat: 0, grouse: 0, distance: 0, pigeon: 0, teal: 0, crow: 0, shrew: 0, eel: 0, finch: 0, hare: 0, fish: 0, carrion: 0, scans: 0, bursts: 0, listenTime: 0, hoverTime: 0, woodsTime: 0, fed: 0, stoops: 0, thermalTime: 0, topSpeed: 0, eaten: 0, landings: 0, drinks: 0, sleeps: 0, misses: 0, crashes: 0 });
let prog = { xp: 0, mission: 0, stats: blankStats(), done: false, found: [], chal: [] };
const stats = () => prog.stats;

const LEVELS = [
  { xp: 0, name: 'Fledgling' }, { xp: 120, name: 'Juvenile', skill: 'keen' }, { xp: 320, name: 'Hunter', skill: 'wings' },
  { xp: 600, name: 'Sky Master', skill: 'arrow' }, { xp: 950, name: 'Master Hunter', skill: 'grip' },
  { xp: 1400, name: 'Explorer', skill: 'stamina' }, { xp: 2000, name: 'Legend', skill: 'talons' }, { xp: 2800, name: 'Lord of the Skies', skill: 'glide' }
];
const SKILLS = {
  keen: { name: 'Keen Eyes', desc: 'Spot prey from 450 m away instead of 250 m.' },
  wings: { name: 'Strong Wings', desc: 'Flapping is 30% stronger and you hold more energy.' },
  arrow: { name: 'Living Arrow', desc: 'A tighter tuck raises your top stoop speed to about 390 km/h.' },
  grip: { name: 'Iron Grip', desc: 'Your talons reach further and hold on better, so more strikes succeed.' },
  stamina: { name: 'Tireless', desc: 'You get hungry, thirsty and tired 25% more slowly.' },
  talons: { name: 'Razor Talons', desc: 'Even more of your strikes hold on.' },
  glide: { name: 'Master Glider', desc: 'Your wings slip through the air more easily, so you glide further and faster.' },
};
const levelIdx = () => { let l = 0; LEVELS.forEach((L, i) => { if (prog.xp >= L.xp) l = i; }); return l; };
const has = k => LEVELS.slice(0, levelIdx() + 1).some(L => L.skill === k);

const FACTS = {
  thermal: 'Birds of prey ride thermals, columns of warm rising air, to climb high without flapping. It saves a lot of energy.',
  landing: 'Before landing, birds of prey "flare": they spread their wings and tail wide like air brakes and swing their feet forward.',
  stoop: 'Peregrines are the fastest animals on Earth. In a hunting dive, called a stoop, they have been measured at over 320 km/h (200 mph).',
  pigeon: 'Wood pigeons are Britain\'s commonest pigeons. They are a favourite food of peregrines and sparrowhawks, which catch them in mid-air.',
  chicks: 'Peregrine chicks are called eyasses. They hatch covered in fluffy white down and make their first flight at about six weeks old.',
  drink: 'Birds of prey get most of their water from their food, but they do drink and bathe in streams and pools, especially in hot weather.',
  talons: 'A peregrine hits its prey with its feet balled up like a fist, then grabs with its talons. A notch on its beak, the "tomial tooth", finishes the job quickly.',
  sleep: 'Birds of prey that hunt by day roost at night somewhere sheltered and high up, like a cliff ledge, a tall building or a tree, often close to their nest.',
  hChicks: 'Sparrowhawks lay four or five eggs in a twiggy nest high in a tree. The chicks are ready to fly at about four weeks old.',
  ddt: 'In the 1960s British peregrines nearly disappeared because of a pesticide called DDT. After it was banned they recovered, and today some even nest on cathedrals, like Salisbury and Norwich.',
  tiercel: 'Female peregrines are about a third bigger than males. A male is called a tiercel, from an old word meaning "a third".',
  eagle: 'Golden eagles are one of Britain\'s biggest birds of prey, with wings over 2 m across. They live mostly in the Scottish Highlands and will attack other raptors.',
  crow: 'Crows often "mob" birds of prey, calling loudly and diving at them to chase them off, but they rarely hurt them. Peregrines do sometimes catch crows and jackdaws to eat.',
  shrew: 'Shrews have smelly glands that put off foxes and cats, but birds of prey have a poor sense of smell, so owls and hawks eat them happily.',
  eel: 'Eels are long, slippery fish that can even wriggle across wet grass. Ospreys have spiky pads on their feet to grip slippery prey like eels.',
  teal: 'Teal are Britain\'s smallest ducks. When danger comes they spring straight up off the water, which is why a group of teal is called a "spring".',
  grouse: 'Red grouse live on heather moors. They crouch hidden until danger is close, then burst up with a whirr of wings, calling "go-back, go-back".',
  hare: 'Mountain hares can run at over 60 km/h and zigzag sharply to escape. Their fur turns white in winter.',
  fish: 'Brown trout live in clear rivers and streams. They rise to the surface to snap up insects, which is when a hunter can grab them.',
  carrion: 'Eating animals that are already dead is called scavenging. It\'s an easy meal, and it helps keep the countryside clean.',
  finch: 'Chaffinches are one of Britain\'s commonest birds. They fly in a bouncing way: a few flaps, then a glide with wings closed.',
  eThermal: 'Golden eagles can soar for hours on thermals and ridge winds, hardly flapping their 2 m wide wings.',
  eSight: 'An eagle\'s eyesight is several times sharper than ours. It can spot a hare moving more than a kilometre away.',
  eHare: 'Mountain hares and red grouse are the golden eagle\'s main food in Scotland. Mountain hares turn white in winter to hide in the snow.',
  eChicks: 'Golden eagles usually lay two eggs, but often only the older, stronger chick survives.',
  eNest: 'A golden eagle eyrie can be used for decades. The pair add sticks every year, so some nests grow taller than a person.',
  oHear: 'Barn owls can catch mice in complete darkness using only their hearing. Their heart-shaped face works like a satellite dish, funnelling sound to their ears.',
  oSilent: 'Barn owl wings have soft, comb-like edges that hush the sound of the air, so prey can\'t hear them coming.',
  oPellet: 'Owls swallow small prey whole, then cough up the bones and fur as a neat "pellet". Scientists open pellets to find out what owls eat.',
  oBarn: 'Barn owls nest in old barns, hollow trees and nest boxes. Lots of farmers put up boxes to help them.',
  oFood: 'A barn owl eats about four small mammals a night, mostly field voles, shrews and wood mice.',
  pHover: 'Ospreys hover high over the water to pinpoint a fish before they dive.',
  pFish: 'Ospreys dive feet-first and can plunge right under the water. They can close their nostrils to keep the water out.',
  pBack: 'Ospreys disappeared from Britain in 1916. They came back to Scotland in the 1950s and now a few hundred pairs nest here.',
  pMigrate: 'Every autumn, British ospreys fly about 5,000 km to West Africa for the winter, then return in spring.',
  kScav: 'Red kites are mainly scavengers. In medieval London they helped clean up rubbish and scraps from the streets.',
  kBack: 'Red kites were almost wiped out in Britain. They were brought back from 1989 and there are now thousands across the country.',
  kTail: 'A red kite twists its forked tail like a rudder to steer, so it can glide in slow, tight circles.',
  kNest: 'Red kites decorate their nests with strange things they find: rags, crisp packets, plastic bags, even underwear!',
  hWoods: 'Sparrowhawks have short, rounded wings and a long tail, perfect for twisting between trees at speed.',
  hAmbush: 'Sparrowhawks hunt by surprise. They use hedges and trees as cover, then burst out to snatch small birds.',
  hSize: 'Female sparrowhawks are almost twice as heavy as males, so they can catch bigger birds like pigeons.',
  hGarden: 'Sparrowhawks often hunt around garden bird feeders, where small birds gather.',
  wind: 'Wind usually gets stronger the higher you go, and it often changes direction with height too. Birds of prey use it: kestrels hover by facing into the wind.',
  fox: 'Foxes will happily eat a bird that lands on the ground. That is one reason birds of prey prefer to rest high up on cliffs and in trees.',
  hpTalons: 'A harpy eagle\'s back talons can be 13 cm long, about as long as a grizzly bear\'s claws. Its eyesight is sharp enough to spot a monkey hiding in the leaves.',
  hpCanopy: 'Harpy eagles hunt inside and just above the forest. Their broad, short wings let them twist between branches to snatch monkeys and sloths.',
  hpNest: 'Harpy eagles build enormous stick nests high in the tallest trees, often kapok trees that stand above the rest of the forest.',
  hpChick: 'Harpy eagles raise just one chick every two or three years, and the young eagle stays with its parents for over a year.',
  hpPanama: 'The harpy eagle is the national bird of Panama. It is named after the harpies, monsters with eagle bodies from ancient Greek stories.',
  bfSmall: 'Bat falcons are tiny falcons, not much bigger than a blackbird, but fast enough to catch swifts and bats in mid-air.',
  bfPerch: 'Bat falcons perch on tall dead trees above the forest, then dash out to catch insects, birds and bats, especially at dawn and dusk.',
  bfNest: 'Bat falcons nest in holes high up in dead trees, safe from snakes and monkeys.',
  bfEat: 'Bat falcons often eat small catches in mid-air, holding them in one foot as they fly.',
  soDay: 'Snowy owls hunt in daylight. In the Arctic summer the sun hardly sets at all, so they have to!',
  soLemm: 'A single snowy owl can eat around 1,600 lemmings in a year.',
  soNest: 'Snowy owls nest on the ground, on a little rise where they can watch out for foxes.',
  soHear: 'Snowy owls can hear lemmings moving under the snow, then plunge right through it to grab them.',
  gyBig: 'The gyrfalcon is the biggest falcon in the world. Some are almost pure white, like the one you are playing.',
  gyPtarm: 'Gyrfalcons mostly eat ptarmigan. They chase them low and fast over the ground instead of stooping from high up.',
  gyNest: 'Gyrfalcons don\'t build their own nests. They use an old raven\'s nest or a bare ledge on a cliff.',
  gyCold: 'Gyrfalcons live in the Arctic all year round, even through the long, dark winter.',
  aurora: 'The northern lights glow when tiny particles from the Sun crash into the air high above the Earth.',
  caribou: 'Caribou (called reindeer in Europe) walk thousands of kilometres every year, one of the longest migrations of any land animal.',
  monkey: 'Capuchin monkeys are very clever. Some even use stones as tools to crack nuts. Harpy eagles are one of their biggest dangers, so they keep a lookout.',
  sloth: 'Sloths move so slowly that green algae grows in their fur, which helps hide them in the trees. Harpy eagles snatch them off the branches.',
  bat: 'Bats find their way in the dark by echolocation: they make high squeaks and listen for the echoes. The bat falcon is named after the bats it catches at dusk.',
  lmChurch: 'Peregrines love tall buildings because they are like cliffs. Some nest on church and cathedral towers.',
  lmSummit: 'Up high the air is thinner, so it is harder for wings to grip it. Birds of prey save energy by soaring on thermals instead of flapping.',
  lmTemple: 'Ancient stone temples are hidden all over the rainforests of Central and South America. The jungle slowly grows back over them.',
  lmFalls: 'The world\'s highest waterfall, Angel Falls in Venezuela, pours off a flat-topped mountain called a tepui. It is nearly 1 km tall.',
  lmTepui: 'Tepuis are flat-topped mountains with sheer cliffs. Some plants and animals live on top of them and nowhere else on Earth.',
  lmOxbow: 'An oxbow lake forms when a river cuts through a loop of its own bend, leaving a curved lake behind.',
  lmKapok: 'Kapok trees can grow over 60 m tall, poking out above the rest of the rainforest. Harpy eagles love to nest in them.',
  lmHut: 'Scientists in the Arctic study animals like snowy owls and lemmings to find out how the far north is changing.',
  lmInuk: 'An inukshuk is a stone landmark built by the Inuit people of the Arctic. They help travellers find their way across the tundra.',
  lmLake: 'The tundra is dotted with thousands of shallow lakes. Under the ground is permafrost, soil that stays frozen all year.',
  lmGlacier: 'Glaciers are rivers of ice that flow very slowly downhill, carving out valleys as they go.',
};
const BIOME_FACTS = {
  rainforest: {
    pigeon: 'Scarlet macaws can live for over 50 years. They crack hard nuts with their huge hooked beaks.',
    crow: 'A toucan\'s giant beak is very light, made of keratin like your fingernails. It also helps the toucan lose heat on hot days.',
    finch: 'Parakeets are small parrots. They fly fast in noisy flocks, screeching to keep together.',
    teal: 'Muscovy ducks nest in holes in trees, high above the forest floor.',
    grouse: 'Tinamous are shy ground birds that hide on the dark forest floor. Their glossy eggs look like polished china.',
    shrew: 'Anole lizards can change colour from green to brown, and the males flash a bright throat flap to show off.',
    eel: 'Electric eels can give a shock of hundreds of volts, enough to knock over a horse. They are really a kind of knifefish, not a true eel.',
    hare: 'Agoutis are rainforest rodents. They bury seeds to eat later and forget some, which helps plant new trees.',
    fish: 'Peacock bass have a dark "eye" spot on their tail, which may confuse animals that attack them.',
    carrion: 'In the hot rainforest, vultures and other scavengers clear up dead animals very quickly.',
    eagle: 'The harpy eagle is the most powerful eagle in the Americas. It will attack other birds of prey that come near its nest.',
    fox: 'Jaguars are the biggest cats in the Americas. Unlike most cats they love water, and they are strong swimmers.',
  },
  arctic: {
    pigeon: 'Snow geese fly thousands of kilometres every year between the Arctic, where they nest, and the warmer south.',
    crow: 'Ravens are some of the cleverest birds on Earth. In the Arctic they follow wolves and polar bears to share their leftovers.',
    finch: 'Snow buntings nest further north than almost any other songbird, tucked into cracks between rocks.',
    teal: 'Long-tailed ducks can dive as deep as 60 m to find food, deeper than almost any other duck.',
    grouse: 'Ptarmigan have feathered feet like snowshoes, and turn white in winter to hide in the snow.',
    shrew: 'Lemming numbers rise and crash every 3 to 5 years. In a good lemming year, snowy owls can raise lots of chicks.',
    eel: 'Arctic grayling have a huge sail-like fin on their back, and they rise to snap insects off the surface.',
    hare: 'Arctic hares can hop along on just their back legs, like a kangaroo, and run at about 60 km/h.',
    fish: 'Arctic char live further north than any other freshwater fish. The males turn bright red in autumn.',
    carrion: 'In the Arctic nothing goes to waste. Foxes, ravens and birds of prey all share the leftovers from wolf kills.',
    eagle: 'Golden eagles live in the Arctic too, and they will attack other birds of prey.',
    fox: 'Arctic foxes have such thick fur that they can survive at minus 50°C. Their coat turns white in winter.',
  },
};
Object.assign(FACTS, BIOME_FACTS[BIOME] || {});
const PEREGRINE_MISSIONS = [
  { title: 'Ride the warm air', text: () => 'Find a thermal (swirling golden dust) and circle inside it for 6 seconds to climb.', done: s => s.thermalTime >= 6, fact: 'thermal' },
  { title: 'Touch down', text: () => `Hold ${KEY.brake} to brake below ${spd(60)}, then land gently on the ground, a tree top or your nest.`, done: s => s.landings >= 1, fact: 'landing' },
  { title: 'The stoop', text: () => `Climb high, then hold ${KEY.dive} to fold your wings and dive faster than ${spd(180)}.`, done: s => s.topSpeed >= 180, fact: 'stoop' },
  { title: 'First catch', text: () => 'Catch a wood pigeon. Strike fast, from above or behind, or it may dodge you.', done: s => s.pigeon >= 1, fact: 'pigeon' },
  { title: 'Hungry mouths', text: () => 'Carry your catch to your eyrie on the western cliffs (gold beam).', done: s => s.fed >= 1, fact: 'chicks' },
  { title: 'Thirsty work', text: () => `Land on the river bank, walk to the water's edge and press ${KEY.act} to drink.`, done: s => s.drinks >= 1, fact: 'drink' },
  { title: 'River hunter', text: () => 'Teal rest on the river. Fly close to make them spring up, then catch one in the air.', done: s => s.teal >= 1, fact: 'talons' },
  { title: 'Safe roost', text: () => `Land in a tree or your nest and press ${KEY.sleep} to sleep.`, done: s => s.sleeps >= 1, fact: 'sleep' },
  { title: 'Living arrow', text: () => `Make a Stoop Strike: catch prey while diving faster than ${spd(200)}.`, done: s => s.stoops >= 1, fact: 'ddt' },
  { title: 'Lord of the Valley', text: () => 'Feed your chicks 5 times in total.', done: s => s.fed >= 5, fact: 'tiercel' },
];
const Q = {
  thermal: fact => ({ title: 'Ride the warm air', text: () => 'Find a thermal (swirling golden dust) and circle inside it for 6 seconds to climb.', done: s => s.thermalTime >= 6, fact }),
  land: fact => ({ title: 'Touch down', text: () => `Hold ${KEY.brake} to brake below ${spd(60)}, then land gently.`, done: s => s.landings >= 1, fact }),
  feed: fact => ({ title: 'Hungry mouths', text: () => 'Carry your catch home to your nest (gold beam) to feed your chicks.', done: s => s.fed >= 1, fact }),
  drink: fact => ({ title: 'Thirsty work', text: () => `Land on the river bank, walk to the water's edge and press ${KEY.act} to drink.`, done: s => s.drinks >= 1, fact }),
  roost: fact => ({ title: 'Safe roost', text: () => `Land in a tree or your nest and press ${KEY.sleep} to sleep.`, done: s => s.sleeps >= 1, fact }),
  master: (title, fact) => ({ title, text: () => 'Feed your chicks 5 times in total.', done: s => s.fed >= 5, fact }),
};
const MISSION_SETS = {
  peregrine: PEREGRINE_MISSIONS,
  eagle: [
    Q.thermal('eThermal'),
    { title: 'Keen sight', text: () => `Press ${KEY.skill} to use your eagle eyes and spot hares far away.`, done: s => s.scans >= 1, fact: 'eSight' },
    { title: 'Mountain hare', text: () => 'Catch a mountain hare on the high moors. Swoop in low and fast before it bolts.', done: s => s.hare >= 1, fact: 'eHare' },
    Q.feed('eChicks'), Q.drink('drink'), Q.roost('eNest'),
    Q.master('King of the Glen', 'eagle'),
  ],
  owl: [
    { title: 'Listen in the dark', text: () => `Hold ${KEY.skill} to listen. You'll hear shrews rustling, even hidden in the grass.`, done: s => s.listenTime >= 3, fact: 'oHear' },
    { title: 'Silent hunter', text: () => 'Catch a shrew. Glide in low and slow: your silent wings mean it won\'t hear you coming.', done: s => s.shrew >= 1, fact: 'oSilent' },
    { title: 'Hungry owlets', text: () => 'Carry your catch home to your barn (gold beam) to feed your owlets.', done: s => s.fed >= 1, fact: 'oPellet' },
    Q.drink('drink'),
    { title: 'Sleep through the day', text: () => `When dawn comes, land in your barn or a tree and press ${KEY.sleep} to sleep.`, done: s => s.sleeps >= 1, fact: 'oBarn' },
    Q.master('Ghost of the Fields', 'oFood'),
  ],
  osprey: [
    Q.thermal('thermal'),
    { title: 'Hover', text: () => `Hold ${KEY.skill} to hover in one spot for 3 seconds.`, done: s => s.hoverTime >= 3, fact: 'pHover' },
    { title: 'Gone fishing', text: () => 'Hover over a trout (a shadow under the water), then dive feet-first into the river to grab it.', done: s => s.fish >= 1, fact: 'pFish' },
    Q.feed('pBack'),
    { title: 'Slippery catch', text: () => 'Snatch an eel when it comes up near the river bank.', done: s => s.eel >= 1, fact: 'eel' },
    Q.roost('pMigrate'),
    Q.master('Fish Hawk', 'drink'),
  ],
  kite: [
    Q.thermal('kTail'),
    { title: 'Scan for food', text: () => `Press ${KEY.skill} to scan the fields for something to scavenge.`, done: s => s.scans >= 1, fact: 'kScav' },
    { title: 'An easy meal', text: () => 'Swoop down slowly and pick up a dead rabbit from the fields.', done: s => s.carrion >= 1, fact: 'kBack' },
    Q.feed('kNest'),
    { title: 'Shrew snack', text: () => 'Catch a shrew in the grass.', done: s => s.shrew >= 1, fact: 'shrew' },
    Q.roost('sleep'),
    Q.master('Lord of the Skies', 'wind'),
  ],
  hawk: [
    Q.land('landing'),
    { title: 'Burst of speed', text: () => `Press ${KEY.skill} for a sudden burst of speed.`, done: s => s.bursts >= 1, fact: 'hAmbush' },
    { title: 'Ambush', text: () => 'Catch a chaffinch. Burst out from the trees to surprise one.', done: s => s.finch >= 1, fact: 'hGarden' },
    { title: 'Through the trees', text: () => `Fly low through the woods faster than ${spd(50)} for 5 seconds, weaving between the trees.`, done: s => s.woodsTime >= 5, fact: 'hWoods' },
    Q.feed('hChicks'),
    { title: 'Pigeon hunter', text: () => 'Catch a wood pigeon, a big meal for a sparrowhawk.', done: s => s.pigeon >= 1, fact: 'hSize' },
    Q.master('Master of the Woods', 'sleep'),
  ],
};
Object.assign(MISSION_SETS, {
  harpy: [
    Q.land('hpNest'),
    { title: 'Keen sight', text: () => `Press ${KEY.skill} to spot monkeys and sloths in the treetops.`, done: s => s.scans >= 1, fact: 'hpTalons' },
    { title: 'Canopy ambush', text: () => 'Catch a capuchin monkey. Skim in low over the treetops so it doesn\'t see you coming.', done: s => s.monkey >= 1, fact: 'monkey' },
    Q.feed('hpChick'),
    { title: 'Slow food', text: () => 'Find a sloth sitting on top of a tree and snatch it.', done: s => s.sloth >= 1, fact: 'sloth' },
    Q.roost('hpCanopy'),
    Q.master('Ruler of the Canopy', 'hpPanama'),
  ],
  batfalcon: [
    Q.thermal('bfPerch'),
    { title: 'Little arrow', text: () => `Climb high, then hold ${KEY.dive} to dive faster than ${spd(150)}.`, done: s => s.topSpeed >= 150, fact: 'bfSmall' },
    { title: 'Parakeet chase', text: () => 'Catch a green parakeet above the treetops.', done: s => s.finch >= 1, fact: 'finch' },
    Q.feed('bfNest'),
    { title: 'Dusk hunter', text: () => 'When the sun sets, bats come out over the river. Catch one!', done: s => s.bat >= 1, fact: 'bat' },
    Q.roost('sleep'),
    Q.master('Shadow of the Dusk', 'bfEat'),
  ],
  snowyowl: [
    { title: 'Listen', text: () => `Hold ${KEY.skill} to listen for lemmings hidden in the tundra.`, done: s => s.listenTime >= 3, fact: 'soHear' },
    { title: 'Lemming hunt', text: () => 'Catch a lemming. Glide in low and slow, then pounce.', done: s => s.shrew >= 1, fact: 'shrew' },
    Q.feed('soNest'),
    { title: 'Ptarmigan', text: () => 'Ptarmigan sit still on the open tundra. Fly close to flush them, then catch one.', done: s => s.grouse >= 1, fact: 'grouse' },
    Q.drink('soDay'),
    Q.roost('soLemm'),
    Q.master('Ghost of the Tundra', 'aurora'),
  ],
  gyr: [
    Q.thermal('gyCold'),
    { title: 'The stoop', text: () => `Climb high, then hold ${KEY.dive} to dive faster than ${spd(180)}.`, done: s => s.topSpeed >= 180, fact: 'gyBig' },
    { title: 'Ptarmigan chase', text: () => 'Catch a rock ptarmigan. Flush it, then chase it low and fast and strike from behind.', done: s => s.grouse >= 1, fact: 'gyPtarm' },
    Q.feed('gyNest'),
    { title: 'Duck dash', text: () => 'Catch a long-tailed duck when it springs up off a lake or the river.', done: s => s.teal >= 1, fact: 'teal' },
    Q.roost('caribou'),
    Q.master('Lord of the North', 'sleep'),
  ],
});
const missions = () => MISSION_SETS[spId];

// ---------- player falcon ----------
let falcon = null;
let LEG = 0.5;  // how high the body sits above the ground when standing
let SIZE = 1;   // current wingspan in metres, used to place the camera
// Young birds leave the nest close to adult size; they fill out over their first year.
// Here you start at 90% and reach full adult size at the top level.
const growth = () => 0.9 + 0.1 * clamp(prog.xp / LEVELS[4].xp, 0, 1);
function applyGrowth() {
  if (!falcon) return;
  const g = growth();
  falcon.group.scale.setScalar(falcon.scale * g);
  SIZE = falcon.span * g; LEG = falcon.leg * g;
}
const wingspanText = () => (falcon.span * growth()).toFixed(2) + ' m';
function setSpecies(id) {
  spId = SPECIES[id] && SPECIES[id].world === BIOME ? id : Object.keys(SPECIES).find(k => SPECIES[k].world === BIOME); SP = SPECIES[spId];
  if (falcon) { if (F.carry) dropCarry(); scene.remove(falcon.group); }
  falcon = makeBird(LOOK[SP.look]);
  falcon.group.rotation.order = 'YXZ';
  scene.add(falcon.group);
  applyGrowth();
  const n = NESTS[spId]; EX = n.x; EY = n.y; EZ = n.z; EYRIE.set(EX, EY, EZ);
  beacon.position.set(EX, EY + 170, EZ);
  eagle.b.group.visible = spId !== THREAT.player;
  const ab = SP.ability && ABILITY[SP.ability];
  $('bSkill').hidden = !ab; if (ab) $('bSkill').textContent = ab.label;
  $('birdHead').textContent = 'Your ' + SP.name.toLowerCase();
  $('factHead').textContent = 'Bird fact';
}
const F = {
  pos: new V3(), prev: new V3(), fwd: new V3(0, 0, 1), yaw: 0, pitch: 0, roll: 0, speed: 22, tuck: 0, flare: 0, flapPh: 0,
  mode: 'perch', perchType: 'nest', tree: null, stunT: 0, moving: false, drinkT: 0, carry: null,
  health: 100, energy: 100, food: 75, water: 75, rest: 85, exhausted: false,
  inThermal: false, thin: false, stall: false, hidden: false, flapSnd: 0, edgeWarned: false, wind: new V3(), sink: 0,
};
const maxEnergy = () => SP.energy * (has('wings') ? 1.3 : 1);
const energyCap = () => maxEnergy() * (F.rest < 10 ? 0.5 : 1) * (F.health < 35 ? 0.7 : 1);
const atNest = () => (F.mode === 'perch' || F.mode === 'sleep') && F.perchType === 'nest';

// ---------- prey ----------
const prey = [], flocks = [];
function pickTarget(f) {
  f.timer = 0;
  if (f.type === 'teal') {
    const z = clamp(f.home.z + (rand() - .5) * 2 * f.radius, -950, 950);
    f.target.set(riverX(z), f.altMin + rand() * (f.altMax - f.altMin), z);
  } else {
    const a = rand() * 6.28, r = rand() * f.radius;
    const x = clamp(f.home.x + Math.cos(a) * r, -950, 950), z = clamp(f.home.z + Math.sin(a) * r, -950, 950);
    f.target.set(x, groundAt(x, z) + f.altMin + rand() * (f.altMax - f.altMin), z);
  }
}
function addFlock(type, home, radius, altMin, altMax, n) {
  const restOn = PREY[type].restOn || null;
  const f = { type, home, radius, altMin, altMax, target: new V3(), timer: 0, members: [], swim: !!restOn, restOn, landing: false };
  if (f.swim) pickSwimSpot(f); else pickTarget(f);
  for (let i = 0; i < n; i++) {
    const b = makeBird(LOOK[type]);
    const p = { type, b, flock: f, pos: f.target.clone().add(new V3((rand() - .5) * 30, 0, (rand() - .5) * 30)), vel: new V3(rand() - .5, 0, rand() - .5).setLength(PREY[type].speed),
      offset: new V3((rand() - .5) * 16, (rand() - .5) * 6, (rand() - .5) * 16), phase: rand() * 6, state: 'fly', fleeT: 0, dodgeT: 0, respawn: 0, jink: 0, bank: 0, lastYaw: 0, glideT: 0 };
    if (f.swim) { p.state = 'swim'; p.offset.set((rand() - .5) * (restOn === 'ground' ? 14 : 8), 0, (rand() - .5) * (restOn === 'ground' ? 14 : 24)); p.pos.copy(f.target).add(p.offset); p.swimYaw = rand() * 6.28; }
    scene.add(b.group); f.members.push(p); prey.push(p);
  }
  flocks.push(f);
}
// a resting spot: open water for ducks, open moorland for grouse
function pickSwimSpot(f) {
  f.timer = 0;
  if (f.restOn === 'ground') {
    for (let k = 0; k < 40; k++) {
      const x = f.home.x + (rand() - .5) * 2 * f.radius, z = f.home.z + (rand() - .5) * 2 * f.radius, h = heightAt(x, z);
      if (h > (f.minH ?? 2) && h < (f.maxH ?? THIN_AIR - 40) && slopeAt(x, z) > 0.8 && !treesNear(x, z).some(t => Math.hypot(t.x - x, t.z - z) < t.r + 2)) { f.target.set(x, groundAt(x, z), z); return; }
    }
    f.target.set(f.home.x, groundAt(f.home.x, f.home.z), f.home.z); return;
  }
  for (let k = 0; k < 20; k++) {
    const z = clamp(f.home.z + (rand() - .5) * 2 * f.radius, -950, 950), x = riverX(z) + (rand() - .5) * 16;
    if (heightAt(x, z) < -2) { f.target.set(x, 0.08, z); return; }
  }
  f.target.set(riverX(f.home.z), 0.08, f.home.z);
}
const CANOPY = BIOME === 'rainforest' ? 25 : 0;
addFlock('pigeon', new V3(VX, 0, VZ), 220, 25 + CANOPY, 70 + CANOPY, 5);
addFlock('pigeon', new V3(VX + 40, 0, VZ - 300), 260, 30 + CANOPY, 80 + CANOPY, 5);
addFlock('pigeon', new V3(riverX(-450) + 250, 0, -450), 280, 30 + CANOPY, 90 + CANOPY, 5);
addFlock('pigeon', new V3(riverX(650) + 120, 0, 650), 260, 25 + CANOPY, 80 + CANOPY, 4);
addFlock('pigeon', new V3(riverX(-50) - 180, 0, -50), 200, 40 + CANOPY, 90 + CANOPY, 4);
if (BIOME === 'rainforest') for (const z of [-560, -80, 420, 820]) addFlock('bat', new V3(riverX(z), 0, z), 170, 6, 22, 6);
addFlock('teal', new V3(0, 0, -300), 450, 5, 16, 4);
addFlock('teal', new V3(0, 0, 450), 450, 5, 16, 4);
addFlock('teal', new V3(0, 0, -780), 300, 5, 16, 4);

function updatePrey(dt, playing) {
  const roosting = nightF > 0.6;
  for (const f of flocks) {
    f.timer += dt;
    if (f.restOn) { updateTealFlock(f, playing); continue; }
    const live = f.members.filter(p => p.state === 'fly');
    if (live.length) {
      tA.set(0, 0, 0); live.forEach(p => tA.add(p.pos)); tA.multiplyScalar(1 / live.length);
      if (tA.distanceTo(f.target) < 40 || f.timer > 28) pickTarget(f);
    }
  }
  for (const p of prey) {
    if (p.state === 'dead') { p.respawn -= dt; if (p.respawn <= 0) respawnPrey(p); continue; }
    if (p.state === 'carried') continue;
    if (PREY[p.type].critter) { updateCritter(p, dt, playing); continue; }
    if (p.state === 'swim') { updateSwimmer(p, dt); continue; }
    // pigeons and crows roost at night; ducks stay active
    // (bats do it the other way round: they sleep by day and fly at night)
    const rst = PREY[p.type].nightOnly ? nightF < 0.45 : roosting;
    if (!p.flock.restOn && rst && p.state === 'fly' && p.pos.distanceTo(F.pos) > 120) { p.state = 'roost'; p.b.group.visible = false; continue; }
    if (p.state === 'roost') { if (!rst) respawnPrey(p); continue; }
    const T = PREY[p.type];
    p.dodgeT = Math.max(0, p.dodgeT - dt);
    tA.subVectors(p.pos, F.pos); const d = tA.length();
    if (playing && F.mode === 'fly' && d < T.alert * (SP.silent ? 0.45 : 1)) p.fleeT = Math.max(p.fleeT, 2.6);
    if (p.fleeT > 0) {
      p.fleeT -= dt; p.jink += dt;
      tA.normalize().multiplyScalar(T.flee);
      tA.x += Math.sin(p.jink * 5 + p.phase) * 7; tA.z += Math.cos(p.jink * 4 + p.phase) * 7; tA.y = tA.y * 0.3 - 3;
    } else {
      tA.copy(p.flock.target).add(p.offset).sub(p.pos);
      tA.multiplyScalar(T.speed / Math.max(tA.length(), 1));
      if (tA.length() < T.speed * 0.6) tA.setLength(T.speed * 0.6);
    }
    p.vel.lerp(tA, 1 - Math.exp(-dt * (p.fleeT > 0 ? 3 : 1.3)));
    const g = groundAt(p.pos.x, p.pos.z);
    const landingOnWater = !!p.flock.restOn && p.flock.landing;
    if (!landingOnWater && p.pos.y < g + 4) p.vel.y = Math.max(p.vel.y, (g + 4 - p.pos.y) * 3);
    if (landingOnWater && p.pos.distanceTo(tC.copy(p.flock.target).add(p.offset)) < 8) { p.state = 'swim'; p.swimYaw = Math.atan2(p.vel.x, p.vel.z); continue; }
    if (p.pos.y > 420) p.vel.y = Math.min(p.vel.y, 0);
    if (Math.hypot(p.pos.x, p.pos.z) > LIMIT) { tB.set(-p.pos.x, 0, -p.pos.z).setLength(6 * dt); p.vel.add(tB); }
    p.pos.addScaledVector(p.vel, dt);
    // orientation with banking into turns
    const yaw = Math.atan2(p.vel.x, p.vel.z), yawRate = wrapAngle(yaw - p.lastYaw) / Math.max(dt, 1e-3); p.lastYaw = yaw;
    p.bank = damp(p.bank, clamp(-yawRate * 0.35, -0.9, 0.9), 4, dt);
    p.b.group.position.copy(p.pos);
    p.b.group.lookAt(tC.copy(p.pos).add(p.vel));
    p.b.group.rotateZ(p.bank);
    animatePrey(p, dt);
  }
}
// Teal rest on the river, spring up together when you come close, then settle again further along.
function updateTealFlock(f, playing) {
  const members = f.members.filter(p => p.state === 'swim' || p.state === 'fly');
  if (f.swim) {
    const near = playing && F.mode === 'fly' && members.some(p => p.pos.distanceTo(F.pos) < (f.restOn === 'ground' ? 45 : 75) * (SP.silent ? 0.5 : 1));
    if (near || (f.timer > 70 && nightF < 0.5)) {
      f.swim = false; f.landing = false; f.timer = 0; pickTarget(f);
      for (const p of members) { p.state = 'fly'; p.vel.set(rand() - .5, 0, rand() - .5).setLength(8); p.vel.y = 9; p.fleeT = near ? 2.5 : 0; }
      if (near) { whoosh(0.25, 1200); showFactOnce(f.type); }
    }
  } else if (!f.landing) {
    const live = members.filter(p => p.state === 'fly');
    if (live.length) {
      tA.set(0, 0, 0); live.forEach(p => tA.add(p.pos)); tA.multiplyScalar(1 / live.length);
      if (tA.distanceTo(f.target) < 40) pickTarget(f);
      if (f.timer > 30 && tA.distanceTo(F.pos) > 160) { f.landing = true; pickSwimSpot(f); f.timer = 0; }
    }
  } else if (members.length && members.every(p => p.state === 'swim')) { f.swim = true; f.landing = false; f.timer = 0; }
}
function updateSwimmer(p, dt) {
  tA.copy(p.flock.target).add(p.offset); tA.y = 0;
  p.pos.x = damp(p.pos.x, tA.x, 0.4, dt); p.pos.z = damp(p.pos.z, tA.z, 0.4, dt);
  p.pos.y = p.flock.restOn === 'ground' ? groundAt(p.pos.x, p.pos.z) + p.b.leg * 0.6 : 0.05 + Math.sin(game.t * 2 + p.phase) * 0.03;
  p.swimYaw += Math.sin(game.t * 0.3 + p.phase) * dt * 0.4;
  p.b.group.position.copy(p.pos); p.b.group.rotation.set(0, p.swimYaw, 0);
  p.b.head.rotation.x = Math.sin(game.t * 0.8 + p.phase) > 0.85 ? 0.9 : 0;
  animWings(p.b, { tuck: 1 });
}
function animatePrey(p, dt) {
  const fleeing = p.fleeT > 0;
  if (p.type === 'pigeon') {
    // pigeons flap steadily, then sail briefly with wings raised in a shallow V
    p.glideT -= dt;
    if (p.glideT < -4 - (p.phase % 3)) p.glideT = 1.2;
    if (!fleeing && p.glideT > 0) { animWings(p.b, { dihedral: 0.35 }); return; }
    p.phase += dt * (fleeing ? 16 : 10);
    animWings(p.b, { ph: p.phase, amp: fleeing ? 1.0 : 0.85 });
  } else if (p.type === 'grouse') {
    // grouse whirr fast on stubby wings, then glide on bowed wings low over the heather
    const cycle = (game.t * 0.8 + p.phase) % 1;
    if (cycle < 0.5 || fleeing) { p.phase += dt * 24; animWings(p.b, { ph: p.phase, amp: 0.65 }); } else animWings(p.b, { dihedral: -0.15 });
  } else if (p.type === 'finch') {
    // small birds bound along: a burst of flaps, then a dip with wings shut
    const cycle = (game.t * 2.2 + p.phase) % 1;
    if (cycle < 0.55 || fleeing) { p.phase += dt * 24; animWings(p.b, { ph: p.phase, amp: 0.9 }); } else animWings(p.b, { tuck: 0.9 });
  } else if (p.type === 'crow') {
    // crows row along with slow, deep, even beats
    p.phase += dt * (fleeing ? 11 : 7.5);
    animWings(p.b, { ph: p.phase, amp: 0.7 });
  } else if (p.type === 'bat') {
    // bats flutter with quick, deep, floppy beats and twist about
    p.phase += dt * (fleeing ? 22 : 17);
    animWings(p.b, { ph: p.phase, amp: 1.1 });
  } else {
    // ducks whirr with fast, shallow beats
    p.phase += dt * (fleeing ? 26 : 21);
    animWings(p.b, { ph: p.phase, amp: 0.55, dihedral: 0.05 });
  }
}
function respawnPrey(p) {
  if (PREY[p.type].critter) { hideCritter(p, 15 + rand() * 15, true); if (p.b.group.parent !== scene) scene.add(p.b.group); p.b.group.scale.setScalar(p.b.scale); return; }
  const f = p.flock;
  if (f.swim && f.restOn) {
    if (p.b.group.parent !== scene) scene.add(p.b.group);
    p.b.group.scale.setScalar(p.b.scale); p.b.group.visible = true; p.b.legs.visible = false;
    p.pos.copy(f.target).add(p.offset); p.state = 'swim'; p.fleeT = 0; p.dodgeT = 0; return;
  }
  tA.copy(f.target).add(p.offset);
  if (tA.distanceTo(F.pos) < 220) { pickTarget(f); p.respawn = 4; p.state = p.state === 'roost' ? 'roost' : 'dead'; return; }
  if (p.b.group.parent !== scene) scene.add(p.b.group);
  p.b.group.scale.setScalar(p.b.scale); p.b.group.visible = true; p.b.legs.visible = false;
  p.pos.copy(tA); p.vel.set(rand() - .5, 0, rand() - .5).setLength(PREY[p.type].speed); p.state = 'fly'; p.fleeT = 0; p.dodgeT = 0;
}

// ---------- critters: shrews in the grass and eels in the river ----------
function makeShrew() {
  const g = new THREE.Group(), M = geo => new THREE.Mesh(geo, birdMat);
  const [fur, pale, nose, tailC] = CRIT.shrew;
  const body = M(facet(new THREE.IcosahedronGeometry(0.5, 0).scale(0.22, 0.18, 0.42), n => n.y < -0.3 ? pale : fur)); body.position.y = 0.1; g.add(body);
  const head = new THREE.Group(); head.position.set(0, 0.11, 0.22); g.add(head);
  head.add(M(facet(new THREE.ConeGeometry(0.07, 0.22, 5).rotateX(Math.PI / 2), (n, m) => m.z > 0.08 ? nose : fur)));
  for (const sx of [-1, 1]) { const e = M(facet(new THREE.OctahedronGeometry(0.018, 0), () => 0x0d0d0d)); e.position.set(sx * 0.04, 0.03, 0.01); head.add(e); }
  const tail = M(facet(new THREE.ConeGeometry(BIOME === 'rainforest' ? 0.03 : 0.018, BIOME === 'rainforest' ? 0.4 : BIOME === 'arctic' ? 0.05 : 0.2, 4).translate(0, 0.1, 0).rotateX(-Math.PI / 2), () => tailC)); tail.position.set(0, 0.08, -0.2); g.add(tail);
  g.scale.setScalar(0.4);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return { group: g, scale: 0.4, wings: [], legs: { visible: false }, head };
}
function makeEel() {
  const g = new THREE.Group(), M = geo => new THREE.Mesh(geo, birdMat), segs = [];
  for (let i = 0; i < 8; i++) {
    const k = 1 - i * 0.085;
    const sg = M(facet(new THREE.OctahedronGeometry(1, 0).scale(0.07 * k, 0.06 * k, 0.14), n => n.y < -0.2 ? CRIT.eel[1] : CRIT.eel[0]));
    sg.position.z = 0.7 - i * 0.2; g.add(sg); segs.push(sg);
  }
  for (const sx of [-1, 1]) { const e = M(facet(new THREE.OctahedronGeometry(0.02, 0), () => 0x0d0d0d)); e.position.set(sx * 0.05, 0.03, 0.78); g.add(e); }
  g.scale.setScalar(0.45);
  return { group: g, scale: 0.45, wings: [], legs: { visible: false }, segs };
}
function makeHare() {
  const g = new THREE.Group(), M = geo => new THREE.Mesh(geo, birdMat);
  const [fur, pale, earTip] = CRIT.hare;
  const body = M(facet(new THREE.IcosahedronGeometry(0.5, 0).scale(0.36, 0.34, 0.62), n => n.y < -0.3 ? pale : fur)); body.position.y = 0.3; g.add(body);
  const head = new THREE.Group(); head.position.set(0, 0.5, 0.3); g.add(head);
  head.add(M(facet(new THREE.IcosahedronGeometry(0.15, 0).scale(0.9, 0.9, 1.2), () => fur)));
  for (const sx of [-1, 1]) {
    const ear = M(facet(new THREE.BoxGeometry(0.05, 0.3, 0.08).translate(0, 0.15, 0), (n, m) => m.y > 0.24 ? earTip : fur)); ear.position.set(sx * 0.05, 0.08, -0.04); ear.rotation.set(-0.35, 0, sx * 0.15); head.add(ear);
    const e = M(facet(new THREE.OctahedronGeometry(0.025, 0), () => 0x1a1208)); e.position.set(sx * 0.1, 0.03, 0.07); head.add(e);
  }
  const tail = M(facet(new THREE.IcosahedronGeometry(0.07, 0), () => 0xf4f0e8)); tail.position.set(0, 0.36, -0.32); g.add(tail);
  g.scale.setScalar(0.75); g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return { group: g, scale: 0.75, wings: [], legs: { visible: false }, head };
}
function makeFish() {
  const g = new THREE.Group(), M = geo => new THREE.Mesh(geo, birdMat), segs = [];
  for (let i = 0; i < 4; i++) {
    const k = [0.8, 1, 0.8, 0.5][i];
    const sg = M(facet(new THREE.OctahedronGeometry(1, 0).scale(0.06 * k, 0.1 * k, 0.16), (n, m) => n.y < -0.3 ? CRIT.fish[2] : (i + Math.floor(m.z * 30)) % 3 === 0 ? CRIT.fish[1] : CRIT.fish[0]));
    sg.position.z = 0.3 - i * 0.2; g.add(sg); segs.push(sg);
  }
  const fin = M(facet(new THREE.ConeGeometry(0.1, 0.14, 3).rotateX(-Math.PI / 2).scale(0.3, 1, 1), () => CRIT.fish[3])); fin.position.z = -0.4; g.add(fin); segs.push(fin);
  g.scale.setScalar(0.45);
  return { group: g, scale: 0.45, wings: [], legs: { visible: false }, segs };
}
function makeCarrion() {
  const g = new THREE.Group(), M = geo => new THREE.Mesh(geo, birdMat);
  const body = M(facet(new THREE.IcosahedronGeometry(0.5, 0).scale(0.3, 0.2, 0.55), n => n.y > 0.4 ? CRIT.carrion[1] : CRIT.carrion[0])); body.position.y = 0.1; body.rotation.z = 1.2; g.add(body);
  const head = M(facet(new THREE.IcosahedronGeometry(0.13, 0), () => CRIT.carrion[0])); head.position.set(0.05, 0.1, 0.3); g.add(head);
  for (const sx of [-1, 1]) { const ear = M(facet(new THREE.BoxGeometry(0.05, 0.03, 0.22), () => CRIT.carrion[2])); ear.position.set(0.08 + sx * 0.05, 0.06, 0.45); g.add(ear); }
  g.scale.setScalar(0.5);
  return { group: g, scale: 0.5, wings: [], legs: { visible: false } };
}
function surfaceFish(p) {
  for (let k = 0; k < 30; k++) {
    const lake = BIOME !== 'valley' && rand() < 0.4;
    const z = (rand() - .5) * 1800, x = lake ? (rand() - .5) * 1800 : riverX(z) + (rand() - .5) * 30;
    if (heightAt(x, z) < -1.5) { p.pos.set(x, -0.5, z); p.yaw = rand() * 6.28; p.state = 'active'; p.t = 0; p.jumpT = 2 + rand() * 4; p.b.group.visible = true; return; }
  }
  p.t = 0; p.hideFor = 3;
}
function placeCarrion(p) {
  for (let k = 0; k < 40; k++) {
    const x = (rand() - .5) * 1800, z = (rand() - .5) * 1800, h = heightAt(x, z);
    if (h > 3 && h < 80 && slopeAt(x, z) > 0.9 && Math.hypot(x - VX, z - VZ) > 80) { p.pos.set(x, groundAt(x, z), z); break; }
  }
  p.state = 'active'; p.t = 0; p.b.group.visible = true;
  p.b.group.position.copy(p.pos); p.b.group.rotation.set(0, rand() * 6.28, 0);
}
function hideCritter(p, secs, move) {
  p.state = 'hidden'; p.t = 0; p.hideFor = secs; p.b.group.visible = false; p.fleeT = 0;
  if (p.type === 'carrion') { placeCarrion(p); p.state = 'hidden'; p.b.group.visible = false; return; }
  if (move && (p.type === 'shrew' || p.type === 'hare')) {
    for (let k = 0; k < 10; k++) { const x = p.home.x + (rand() - .5) * 40, z = p.home.z + (rand() - .5) * 40; if (heightAt(x, z) > 1.5) { p.pos.set(x, groundAt(x, z), z); break; } }
  }
}
function surfaceEel(p) {
  for (let k = 0; k < 30; k++) {
    const z = (rand() - .5) * 1800, side = rand() < .5 ? -1 : 1, x = riverX(z) + side * (8 + rand() * 14);
    if (heightAt(x, z) < -0.8) { p.pos.set(x, 0.06, z); p.yaw = rand() * 6.28; p.state = 'active'; p.t = 0; p.b.group.visible = true; return; }
  }
  p.t = 0; p.hideFor = 3;
}
const critterBase = () => ({ vel: new V3(), t: 0, hideFor: 0, fleeT: 0, dodgeT: 0, yaw: rand() * 6.28, moveT: 0, ran: false, respawn: 0 });
{
  let made = 0;
  const on = NESTS.owl || NESTS.snowyowl || NESTS[Object.keys(NESTS)[0]], near = [[on.x + 40, on.z + 30], [on.x - 50, on.z - 20], [on.x + 10, on.z - 60], [EX + 40, EZ + 30], [EX - 60, EZ - 50]];
  for (let k = 0; k < 800 && made < (BIOME === 'rainforest' ? 26 : 52); k++) {
    let x, z;
    if (k < 60) { const n = near[k % near.length]; x = n[0] + (rand() - .5) * 30; z = n[1] + (rand() - .5) * 30; }
    else { x = (rand() - .5) * 1800; z = (rand() - .5) * 1800; }
    const h = heightAt(x, z);
    if (h < 2 || h > 260 || slopeAt(x, z) < 0.8 || Math.hypot(x - VX, z - VZ) < 90) continue;
    const b = makeShrew(); scene.add(b.group);
    prey.push({ type: 'shrew', b, pos: new V3(x, groundAt(x, z), z), home: new V3(x, 0, z), state: 'active', ...critterBase() });
    made++;
  }
  // mountain hares on the high moors, some near the eagle's crag
  made = 0;
  for (let k = 0; k < 3000 && made < (BIOME === 'rainforest' ? 20 : 32); k++) {
    const nx = NESTS.eagle || NESTS.gyr || NESTS.harpy, near = k < 500;
    const x = near ? nx.x + (rand() - .5) * 300 : (rand() - .5) * 1900, z = near ? nx.z + (rand() - .5) * 300 : (rand() - .5) * 1900, h = heightAt(x, z);
    if (h < (BIOME === 'valley' ? 100 : 4) || h > THIN_AIR - 30 || slopeAt(x, z) < 0.8 || Math.hypot(x, z) > 1000) continue;
    if (near && made >= 10) continue;
    const b = makeHare(); scene.add(b.group);
    prey.push({ type: 'hare', b, pos: new V3(x, h, z), home: new V3(x, 0, z), state: 'active', ...critterBase() });
    made++;
  }
  for (let i = 0; i < 12; i++) {
    const b = makeFish(); scene.add(b.group);
    const p = { type: 'fish', b, pos: new V3(), home: new V3(), state: 'hidden', jumpT: 3, ...critterBase() };
    hideCritter(p, rand() * 8, false); prey.push(p);
  }
  for (let i = 0; i < 8; i++) {
    const b = makeCarrion(); scene.add(b.group);
    const p = { type: 'carrion', b, pos: new V3(), home: new V3(), state: 'active', ...critterBase() };
    placeCarrion(p); prey.push(p);
  }
  for (let i = 0; i < 9; i++) {
    const b = makeEel(); scene.add(b.group);
    const p = { type: 'eel', b, pos: new V3(), home: new V3(), state: 'hidden', ...critterBase() };
    hideCritter(p, rand() * 12, false); prey.push(p);
  }
  if (BIOME === 'rainforest') {
    const hn = NESTS.harpy;
    for (let i = 0; i < 40; i++) {
      const type = i < 28 ? 'monkey' : 'sloth', b = type === 'monkey' ? makeMonkey() : makeSloth(); scene.add(b.group);
      const home = i % 4 === 0 ? new V3(hn.x + (rand() - .5) * 200, 0, hn.z + (rand() - .5) * 200) : new V3((rand() - .5) * 1800, 0, (rand() - .5) * 1800);
      const p = { type, b, pos: new V3(), home, state: 'active', ...critterBase() };
      placeOnCanopy(p); prey.push(p);
    }
  }
}
// monkeys and sloths live up in the treetops
function makeMonkey() {
  const g = new THREE.Group(), M = geo => new THREE.Mesh(geo, birdMat), fur = 0x5a3a20, pale = 0xf0e0c0;
  const body = M(facet(new THREE.IcosahedronGeometry(0.5, 0).scale(0.36, 0.42, 0.3), () => fur)); body.position.y = 0.32; g.add(body);
  const head = new THREE.Group(); head.position.set(0, 0.62, 0.05); g.add(head);
  head.add(M(facet(new THREE.IcosahedronGeometry(0.14, 0), (n) => n.z > 0.3 || n.y < -0.4 ? pale : fur)));
  const cap = M(facet(new THREE.IcosahedronGeometry(0.1, 0).scale(1, 0.5, 1), () => 0x1e140c)); cap.position.set(0, 0.1, -0.01); head.add(cap);
  for (const sx of [-1, 1]) {
    const e = M(facet(new THREE.OctahedronGeometry(0.025, 0), () => 0x111111)); e.position.set(sx * 0.05, 0.03, 0.12); head.add(e);
    const arm = M(facet(new THREE.BoxGeometry(0.07, 0.34, 0.07).translate(0, -0.17, 0), () => fur)); arm.position.set(sx * 0.17, 0.5, 0.05); arm.rotation.x = -0.5; g.add(arm);
    const leg = M(facet(new THREE.BoxGeometry(0.08, 0.26, 0.08).translate(0, -0.13, 0), () => fur)); leg.position.set(sx * 0.1, 0.18, 0); leg.rotation.x = -1.2; g.add(leg);
  }
  const tail = M(facet(new THREE.ConeGeometry(0.035, 0.7, 4).translate(0, 0.35, 0).rotateX(-2.2), () => fur)); tail.position.set(0, 0.2, -0.12); g.add(tail);
  g.scale.setScalar(0.85); g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return { group: g, scale: 0.85, wings: [], legs: { visible: false }, head };
}
function makeSloth() {
  const g = new THREE.Group(), M = geo => new THREE.Mesh(geo, birdMat), fur = 0x8a7a5a, algae = 0x6a7a4a, face = 0xe8dcc0;
  const body = M(facet(new THREE.IcosahedronGeometry(0.5, 0).scale(0.5, 0.42, 0.62), (n, m) => n.y > 0.3 && Math.sin(m.x * 30) > 0.2 ? algae : fur)); body.position.y = 0.26; g.add(body);
  const head = new THREE.Group(); head.position.set(0, 0.38, 0.34); g.add(head);
  head.add(M(facet(new THREE.IcosahedronGeometry(0.14, 0), n => n.z > 0.35 ? face : fur)));
  for (const sx of [-1, 1]) {
    const mask = M(facet(new THREE.OctahedronGeometry(0.04, 0).scale(1.4, 0.7, 0.5), () => 0x2a2018)); mask.position.set(sx * 0.055, 0.02, 0.12); head.add(mask);
    for (const fz of [0.22, -0.2]) { const limb = M(facet(new THREE.BoxGeometry(0.08, 0.08, 0.36), () => fur)); limb.position.set(sx * 0.24, 0.12, fz); limb.rotation.y = sx * (fz > 0 ? 0.6 : -0.6); g.add(limb); }
  }
  g.scale.setScalar(0.9); g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return { group: g, scale: 0.9, wings: [], legs: { visible: false }, head };
}

function placeOnCanopy(p) {
  const canopyTrees = placeOnCanopy.trees || (placeOnCanopy.trees = TREES.filter(t => t.kind === "oak" && !t.giant));
  let t = null;
  for (let k = 0; k < 40; k++) { const c = canopyTrees[Math.floor(rand() * canopyTrees.length)]; if (!t || Math.hypot(c.x - p.home.x, c.z - p.home.z) < Math.hypot(t.x - p.home.x, t.z - p.home.z)) t = c; }
  p.tree = t; p.spot = { a: rand() * 6.28, r: rand() * t.r * 0.15 };
  p.pos.set(t.x + Math.cos(p.spot.a) * p.spot.r, t.perchY - 0.25, t.z + Math.sin(p.spot.a) * p.spot.r);
  p.state = 'active'; p.t = 0; p.fleeT = 0; p.ran = false; p.b.group.visible = true;
  p.b.group.position.copy(p.pos); p.b.group.rotation.set(0, p.yaw, 0);
}
function updateCanopy(p, dt, playing) {
  if (p.state === 'hidden') { if (p.t > p.hideFor) placeOnCanopy(p); return; }
  const d = Math.hypot(F.pos.x - p.pos.x, F.pos.z - p.pos.z), above = F.pos.y - p.pos.y;
  if (p.type === 'monkey') {
    // capuchins keep a lookout: a bird coming in high and noisy is spotted, and they drop down into the leaves
    if (playing && F.mode === 'fly' && d < (SP.silent ? 8 : 24) && above > 3 && above < 35 && !p.ran) { p.ran = true; p.fleeT = 1.4; whoosh(0.15, 1500); }
    if (p.fleeT > 0) { p.fleeT -= dt; if (p.fleeT <= 0) { hideCritter(p, 10 + rand() * 10, false); return; } }
    p.moveT -= dt;
    if (p.moveT < -2) { p.moveT = 0.6 + rand(); p.yaw += (rand() - .5) * 3; }
    const speed = p.fleeT > 0 ? 2.5 : p.moveT > 0 ? 0.7 : 0;
    p.spot.r = clamp(p.spot.r + speed * dt * 0.5, 0, p.tree.r * 0.25);
    p.spot.a += speed * dt * 0.4;
    p.pos.set(p.tree.x + Math.cos(p.spot.a) * p.spot.r, p.tree.perchY - 0.25 - (p.fleeT > 0 ? (1.4 - p.fleeT) * 1.5 : 0), p.tree.z + Math.sin(p.spot.a) * p.spot.r);
    p.b.group.position.copy(p.pos); if (speed) p.b.group.position.y += Math.abs(Math.sin(p.t * 14)) * 0.08;
    p.b.group.rotation.set(0, p.yaw, 0);
    p.b.head.rotation.y = speed ? 0 : Math.sin(p.t * 1.7) * 0.8;
  } else {
    // sloths hardly move at all
    p.yaw += dt * 0.03; p.b.group.rotation.set(0, p.yaw, 0);
    p.b.head.rotation.y = Math.sin(p.t * 0.3) * 0.4;
  }
  p.vel.set(0, 0, 0);
}
function updateCritter(p, dt, playing) {
  p.t += dt; p.dodgeT = Math.max(0, p.dodgeT - dt);
  if (p.type === 'carrion') return;
  if (p.type === 'monkey' || p.type === 'sloth') { updateCanopy(p, dt, playing); return; }
  if (p.type === 'hare') { updateHare(p, dt, playing); return; }
  if (p.type === 'fish') { updateFish(p, dt); return; }
  if (p.type === 'shrew') {
    if (p.state === 'hidden') { if (p.t > p.hideFor) { p.state = 'active'; p.t = 0; p.b.group.visible = true; } return; }
    const d = Math.hypot(F.pos.x - p.pos.x, F.pos.z - p.pos.z), above = F.pos.y - p.pos.y;
    if (playing && d < (SP.silent ? 7 : 20) && above < 30 && p.fleeT <= 0 && !p.ran) { p.fleeT = 2.6; p.ran = true; p.yaw = Math.atan2(p.pos.x - F.pos.x, p.pos.z - F.pos.z); }
    let speed = 0;
    if (p.fleeT > 0) {
      p.fleeT -= dt; speed = 2.6; p.yaw += Math.sin(p.t * 9) * dt * 3;
      if (p.fleeT <= 0) { p.ran = false; hideCritter(p, 6 + rand() * 6, false); return; }
    } else {
      // forage in quick little dashes with pauses to sniff
      p.moveT -= dt;
      if (p.moveT < -1.5) { p.moveT = 0.6 + rand(); p.yaw += (rand() - .5) * 2.5; }
      speed = p.moveT > 0 ? 1.1 : 0;
      if (Math.hypot(p.pos.x - p.home.x, p.pos.z - p.home.z) > 25) p.yaw = Math.atan2(p.home.x - p.pos.x, p.home.z - p.pos.z);
    }
    const nx = p.pos.x + Math.sin(p.yaw) * speed * dt, nz = p.pos.z + Math.cos(p.yaw) * speed * dt;
    if (heightAt(nx, nz) > 0.8) { p.pos.x = nx; p.pos.z = nz; } else p.yaw += Math.PI;
    p.pos.y = groundAt(p.pos.x, p.pos.z);
    p.vel.set(Math.sin(p.yaw) * speed, 0, Math.cos(p.yaw) * speed);
    p.b.group.position.copy(p.pos); if (speed) p.b.group.position.y += Math.abs(Math.sin(p.t * 30)) * 0.04;
    p.b.group.rotation.set(0, p.yaw, 0);
    p.b.head.rotation.y = speed ? 0 : Math.sin(p.t * 5) * 0.5;
  } else {
    if (p.state === 'hidden') { if (p.t > p.hideFor) surfaceEel(p); return; }
    if (p.t > 9) { hideCritter(p, 6 + rand() * 12, false); return; }
    p.yaw += Math.sin(p.t * 0.7 + p.hideFor) * dt * 0.8;
    const nx = p.pos.x + Math.sin(p.yaw) * 0.6 * dt, nz = p.pos.z + Math.cos(p.yaw) * 0.6 * dt;
    if (heightAt(nx, nz) < -0.5) { p.pos.x = nx; p.pos.z = nz; } else p.yaw += Math.PI * dt * 3;
    p.vel.set(Math.sin(p.yaw) * 0.6, 0, Math.cos(p.yaw) * 0.6);
    p.b.group.position.copy(p.pos); p.b.group.rotation.set(0, p.yaw, 0);
    p.b.segs.forEach((sg, i) => { sg.position.x = Math.sin(p.t * 6 - i * 0.9) * 0.025 * i; });
  }
}

// hares graze, then bolt in zigzags when a big bird comes low over them
function updateHare(p, dt, playing) {
  if (p.state === 'hidden') { if (p.t > p.hideFor) { p.state = 'active'; p.t = 0; p.b.group.visible = true; } return; }
  const d = Math.hypot(F.pos.x - p.pos.x, F.pos.z - p.pos.z), above = F.pos.y - p.pos.y;
  if (playing && d < 28 && above < 30 && p.fleeT <= 0 && p.moveT > -6) { p.fleeT = 4; p.yaw = Math.atan2(p.pos.x - F.pos.x, p.pos.z - F.pos.z); p.moveT = -6; }
  let speed = 0;
  if (p.fleeT > 0) { p.fleeT -= dt; speed = 9; if (Math.sin(p.t * 3) > 0.95) p.yaw += (rand() < .5 ? 1 : -1) * 1.2; }
  else {
    p.moveT += dt;
    if (p.moveT > 0) { if (p.moveT > 1.2) p.moveT = -(2 + rand() * 4); speed = 1.6; }
    if (Math.hypot(p.pos.x - p.home.x, p.pos.z - p.home.z) > 40) p.yaw = Math.atan2(p.home.x - p.pos.x, p.home.z - p.pos.z);
  }
  const nx = p.pos.x + Math.sin(p.yaw) * speed * dt, nz = p.pos.z + Math.cos(p.yaw) * speed * dt;
  if (heightAt(nx, nz) > 1) { p.pos.x = nx; p.pos.z = nz; } else p.yaw += Math.PI;
  p.pos.y = groundAt(p.pos.x, p.pos.z);
  p.vel.set(Math.sin(p.yaw) * speed, 0, Math.cos(p.yaw) * speed);
  p.b.group.position.copy(p.pos); if (speed) p.b.group.position.y += Math.abs(Math.sin(p.t * (speed > 3 ? 14 : 8))) * (speed > 3 ? 0.35 : 0.12);
  p.b.group.rotation.set(speed > 3 ? -0.15 : 0, p.yaw, 0);
  p.b.head.rotation.x = speed ? 0 : Math.sin(p.t * 0.8) > 0.3 ? 0.7 : -0.1;
}
// trout swim just under the surface and now and then leap out
function updateFish(p, dt) {
  if (p.state === 'hidden') { if (p.t > p.hideFor) surfaceFish(p); return; }
  if (p.t > 16) { hideCritter(p, 4 + rand() * 8, false); return; }
  p.yaw += Math.sin(p.t * 0.9 + p.hideFor) * dt * 0.9;
  const nx = p.pos.x + Math.sin(p.yaw) * 1.2 * dt, nz = p.pos.z + Math.cos(p.yaw) * 1.2 * dt;
  if (heightAt(nx, nz) < -1.2) { p.pos.x = nx; p.pos.z = nz; } else p.yaw += Math.PI * dt * 3;
  p.jumpT -= dt;
  const jump = p.jumpT < 0 ? Math.max(0, Math.sin(-p.jumpT * 4)) : 0;
  if (p.jumpT < -0.8) p.jumpT = 4 + rand() * 6;
  p.pos.y = -0.5 + jump * 1.4;
  p.vel.set(Math.sin(p.yaw) * 1.2, 0, Math.cos(p.yaw) * 1.2);
  p.b.group.position.copy(p.pos); p.b.group.rotation.set(jump ? -0.6 * Math.cos(-p.jumpT * 4) : 0, p.yaw, 0);
  p.b.segs.forEach((sg, i) => { sg.position.x = Math.sin(p.t * 8 - i * 1.1) * 0.03 * i; });
}

// ---------- threats ----------
function steer(o, target, speed, turn, dt) { tB.subVectors(target, o.pos).setLength(speed); o.vel.lerp(tB, 1 - Math.exp(-turn * dt)); }
function orientFlyer(o, dt) {
  const yaw = Math.atan2(o.vel.x, o.vel.z), yawRate = wrapAngle(yaw - (o.lastYaw || 0)) / Math.max(dt, 1e-3); o.lastYaw = yaw;
  o.bank = damp(o.bank || 0, clamp(-yawRate * 0.5, -0.8, 0.8), 3, dt);
  o.b.group.position.copy(o.pos); o.b.group.lookAt(tC.copy(o.pos).add(o.vel)); o.b.group.rotateZ(o.bank);
}
// golden eagle: patrols the western moors by day and hunts you if it spots you in the air
// in the rainforest the big hunter is a harpy eagle instead
const THREAT = BIOME === 'rainforest' ? { look: 'harpy', name: 'harpy eagle', player: 'harpy' } : { look: 'eagle', name: 'golden eagle', player: 'eagle' };
const eagle = { b: makeBird(LOOK[THREAT.look]), pos: new V3(), vel: new V3(10, 0, 0), state: 'patrol', t: 0, cool: 40, huntT: 0, ph: 0, center: new V3(riverX(-600) - 470, 400, -600) };
eagle.pos.copy(eagle.center).add(new V3(260, 0, 0));
scene.add(eagle.b.group);
function updateEagle(dt) {
  if (spId === THREAT.player) { eagle.b.group.visible = false; return; }
  const E = eagle; E.t += dt; E.cool -= dt;
  const awake = nightF < 0.5;
  E.b.group.visible = awake;
  if (!awake) { if (E.state === 'hunt') E.state = 'leave'; return; }
  const d = E.pos.distanceTo(F.pos);
  const playing = game.state === 'play';
  const exposed = playing && F.mode === 'fly' && !F.hidden && Math.hypot(F.pos.x - EX, F.pos.z - EZ) > 45;
  if (E.state === 'patrol') {
    const a = E.t * 0.07;
    tA.set(E.center.x + Math.cos(a) * 260, E.center.y + Math.sin(E.t * 0.2) * 20, E.center.z + Math.sin(a) * 260);
    steer(E, tA, 16, 0.8, dt);
    if (exposed && d < 280 && E.cool <= 0) {
      E.state = 'hunt'; E.huntT = 0;
      toast(`A ${THREAT.name} is hunting you! Stoop away fast or hide in the trees.`, 'bad', 4000); sfx.eagle(); showFactOnce('eagle');
    }
  } else if (E.state === 'hunt') {
    E.huntT += dt;
    tA.copy(F.pos).addScaledVector(F.fwd, F.speed * 0.35);
    steer(E, tA, 31, 2.2, dt);
    if (d < 3.6 && F.mode === 'fly') {
      injure(40, `The ${THREAT.name} struck you!`);
      if (F.carry) { toast(`The ${THREAT.name} stole your prey!`, 'bad'); dropCarry(); }
      F.speed = 10; F.pitch = -0.3; E.state = 'leave'; E.cool = 90;
    } else if (!exposed || E.huntT > 25 || d > 450) {
      E.state = 'leave'; E.cool = 45;
      if (playing && d < 450) toast(`The ${THREAT.name} gave up the chase.`, 'gold');
    }
  } else {
    steer(E, E.center, 18, 1, dt);
    if (E.pos.distanceTo(E.center) < 300) E.state = 'patrol';
  }
  E.pos.addScaledVector(E.vel, dt);
  const g = groundAt(E.pos.x, E.pos.z); if (E.pos.y < g + 8) E.pos.y = g + 8;
  orientFlyer(E, dt);
  // eagles soar on flat, fingered wings and only flap hard in a chase
  if (E.state === 'hunt') { E.ph += dt * 7; animWings(E.b, { ph: E.ph, amp: 0.55 }); }
  else { E.ph += dt * 5; const flapping = Math.sin(E.t * 0.15) > 0.85; animWings(E.b, flapping ? { ph: E.ph, amp: 0.4 } : { dihedral: 0.12 + Math.sin(E.t * 0.8) * 0.03 }); }
}
// red grouse live in groups on the heather moors
{
  const moorFlock = (x, z, minH, maxH) => { addFlock('grouse', new V3(x, 0, z), 160, 3, 10, 5); const f = flocks[flocks.length - 1]; Object.assign(f, { minH, maxH }); pickSwimSpot(f); f.members.forEach(p => { p.pos.copy(f.target).add(p.offset); }); };
  if (BIOME === 'valley') {
    const en = NESTS.eagle, m = (x, z) => moorFlock(x, z, 105, THIN_AIR - 50);
    m(en.x + 120, en.z + 80); m(en.x - 60, en.z - 200); m(EX - 120, EZ + 260); m(EX - 200, EZ - 300); m(riverX(600) - 420, 600);
  } else {
    // tinamous on the forest floor; ptarmigan all over the tundra
    const ns = Object.values(NESTS), m = (x, z) => moorFlock(x, z, 3, 200);
    for (const n of ns) { m(n.x + 120, n.z + 80); m(n.x - 90, n.z - 160); }
    m(riverX(-600) + 250, -600); m(riverX(600) - 250, 600); if (BIOME === 'arctic') { m(riverX(0) + 380, 0); m(riverX(-300) - 300, -300); }
  }
}
// crows live in the woods; you can hunt them
{
  for (const [x, z] of [[VX - 60, VZ + 20], [riverX(-420) + 260, -420], [riverX(150) - 200, 150], [riverX(620) + 180, 620], [EX + 150, EZ + 200]]) addFlock('finch', new V3(x, 0, z), 110, 3 + CANOPY, 16 + CANOPY, 6);
  const home = new V3(riverX(80) + 230, 0, 80);
  let best = null, bd = Infinity; for (const t of TREES) { const d = Math.hypot(t.x - home.x, t.z - home.z); if (d < bd) { bd = d; best = t; } }
  if (best) home.set(best.x, 0, best.z);
  addFlock('crow', home, 160, 12 + CANOPY, 45 + CANOPY, 5);
  addFlock('crow', new V3(riverX(-600) + 200, 0, -600), 200, 12 + CANOPY, 45 + CANOPY, 4);
}
// foxes: roam the fields and pounce on a bird that is on the ground
// a jaguar in the rainforest, an arctic fox on the tundra
const PRED = BIOME === 'rainforest' ? { name: 'jaguar', body: 0xd89a3a, belly: 0xf0e0c0, dark: 0x2a2018, spots: true, scale: 1.25 }
  : BIOME === 'arctic' ? { name: 'arctic fox', body: 0xe8e8e2, belly: 0xffffff, dark: 0x3a3a3a, scale: 0.68 }
  : { name: 'fox', body: 0xc9652a, belly: 0xf3ede2, dark: 0x2a2220, scale: 0.75 };
function makeFox() {
  const g = new THREE.Group(), M = geo => new THREE.Mesh(geo, birdMat);
  const orange = PRED.body, white = PRED.belly, dark = PRED.dark;
  const body = M(facet(new THREE.IcosahedronGeometry(0.5, 0).scale(0.55, 0.55, 1.5), (n, m) => n.y < -0.4 ? white : PRED.spots && Math.sin(m.x * 37 + m.z * 11) * Math.sin(m.z * 23) > 0.35 ? dark : orange)); body.position.y = 0.58; g.add(body);
  const head = new THREE.Group(); head.position.set(0, 0.8, 0.74); g.add(head);
  head.add(M(facet(new THREE.IcosahedronGeometry(0.22, 0).scale(1, 0.9, 1.1), n => n.y < -0.3 ? white : orange)));
  const snout = M(facet(new THREE.ConeGeometry(0.1, 0.32, 4).rotateX(Math.PI / 2), (n, m) => m.z > 0.1 ? dark : orange)); snout.position.set(0, -0.04, 0.27); head.add(snout);
  for (const s of [-1, 1]) {
    const ear = M(facet(new THREE.ConeGeometry(0.08, 0.2, 4), (n, m) => m.y > 0.03 ? dark : orange)); ear.position.set(s * 0.11, 0.2, -0.02); head.add(ear);
    const eye = M(facet(new THREE.OctahedronGeometry(0.03, 0), () => 0x111111)); eye.position.set(s * 0.1, 0.05, 0.17); head.add(eye);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.62, -0.68); tail.rotation.x = -0.35; g.add(tail);
  tail.add(M(facet(new THREE.ConeGeometry(0.17, 0.9, 5).translate(0, 0.45, 0).rotateX(-Math.PI / 2), (n, m) => m.z < -0.62 ? white : orange)));
  const legs = [];
  for (const [x, z] of [[-.15, .42], [.15, .42], [-.15, -.42], [.15, -.42]]) {
    const lg = new THREE.Group(); lg.position.set(x, 0.44, z); g.add(lg);
    lg.add(M(facet(new THREE.BoxGeometry(0.09, 0.44, 0.09).translate(0, -0.22, 0), () => dark)));
    legs.push(lg);
  }
  g.scale.setScalar(PRED.scale);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return { g, legs, tail, head };
}
const foxes = [[riverX(-300) + 200, -300], [riverX(500) + 260, 500], [riverX(-700) + 180, -700], [riverX(120) + 120, 120]].map(([x, z]) => {
  const m = makeFox(); scene.add(m.g);
  return { ...m, home: new V3(x, 0, z), pos: new V3(x, groundAt(x, z), z), yaw: rand() * 6, state: 'wander', target: null, t: 0, cool: 0, lostT: 0, ph: 0 };
});
function updateFox(f, dt) {
  f.cool -= dt; f.t += dt;
  const playing = game.state === 'play';
  const d = Math.hypot(F.pos.x - f.pos.x, F.pos.z - f.pos.z);
  const prey_ = playing && F.mode === 'ground' && !F.hidden;
  let speed = 0, goal = null;
  if (f.state === 'wander') {
    if (!f.target || Math.hypot(f.target.x - f.pos.x, f.target.z - f.pos.z) < 3 || f.t > 20) {
      for (let k = 0; k < 8; k++) {
        const a = rand() * 6.28, r = rand() * 170, x = f.home.x + Math.cos(a) * r, z = f.home.z + Math.sin(a) * r;
        if (heightAt(x, z) > 2) { f.target = new V3(x, 0, z); break; }
      }
      f.t = 0;
    }
    goal = f.target; speed = 1.8;
    if (prey_ && d < 90 && f.cool <= 0) { f.state = 'hunt'; f.lostT = 0; toast(`A ${PRED.name} is stalking you! Take off!`, 'bad', 3500); showFactOnce('fox'); }
  } else if (f.state === 'hunt') {
    goal = F.pos; speed = 9.5;
    if (d < 1.1 && F.mode === 'ground') {
      injure(30, `A ${PRED.name} pounced on you!`);
      if (F.carry) { toast(`The ${PRED.name} stole your prey!`, 'bad'); dropCarry(); }
      if (F.health > 0 && F.mode === 'ground') { F.mode = 'fly'; F.speed = 10; F.pitch = 0.7; F.pos.y += 1.5; F.stunT = 0; F.tuck = 0; }
      f.state = 'retreat'; f.cool = 25; f.t = 0;
    }
    if (F.mode !== 'ground' || F.hidden) { f.lostT += dt; if (f.lostT > 2) { f.state = 'wander'; f.cool = 8; } } else f.lostT = 0;
    if (d > 150 || !playing) f.state = 'wander';
  } else {
    tA.set(f.pos.x * 2 - F.pos.x, 0, f.pos.z * 2 - F.pos.z); goal = tA; speed = 6;
    if (f.t > 6) { f.state = 'wander'; f.t = 0; }
  }
  if (goal && speed > 0) {
    const want = Math.atan2(goal.x - f.pos.x, goal.z - f.pos.z);
    f.yaw += clamp(wrapAngle(want - f.yaw), -4 * dt, 4 * dt);
    const nx = f.pos.x + Math.sin(f.yaw) * speed * dt, nz = f.pos.z + Math.cos(f.yaw) * speed * dt;
    if (heightAt(nx, nz) > 0.6) { f.pos.x = nx; f.pos.z = nz; } else { f.target = null; speed = 0; }
  }
  f.pos.y = groundAt(f.pos.x, f.pos.z);
  f.g.position.copy(f.pos); f.g.rotation.y = f.yaw;
  f.ph += dt * speed * 2.6;
  f.legs.forEach((l, i) => { l.rotation.x = Math.sin(f.ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * Math.min(speed / 4, 0.7); });
  f.tail.rotation.y = Math.sin(f.t * 2) * 0.25; f.head.rotation.x = f.state === 'hunt' ? 0.15 : Math.sin(f.t * 0.7) * 0.2;
}

// ---------- feathers and splashes ----------
const parts = [];
{
  const fg = new THREE.PlaneGeometry(0.24, 0.08), sg = new THREE.SphereGeometry(0.07, 5, 4);
  const blood = toon(0x8c1d1d);
  for (let i = 0; i < 200; i++) {
    const speck = i % 6 === 0;
    const m = new THREE.Mesh(speck ? sg : fg, speck ? blood : toon(0xffffff, { side: THREE.DoubleSide }));
    m.visible = false; scene.add(m);
    parts.push({ m, speck, v: new V3(), spin: new V3(), life: 0 });
  }
}
let partIdx = 0;
function burst(pos, vel, colors, n = 36, specks = 1) {
  for (let i = 0; i < n; i++) {
    let p = parts[partIdx++ % parts.length];
    if (p.speck && !specks) p = parts[partIdx++ % parts.length];
    p.m.position.copy(pos); p.m.visible = true; p.life = p.speck ? 2 : 6 + rand() * 3;
    p.v.set(rand() - .5, rand() - .3, rand() - .5).multiplyScalar(p.speck ? 6 : 10).addScaledVector(vel, 0.25);
    p.spin.set(rand() * 8, rand() * 8, rand() * 8);
    if (!p.speck) p.m.material.color.setHex(colors[i % colors.length]);
    p.m.scale.setScalar(1);
  }
}
// While an owl listens, every animal it can hear shows up as a glowing pulse, coloured by what it is:
// orange for small mammals, yellow for birds, cyan for fish, red for danger. They show through grass and leaves.
const SOUND_COL = { shrew: 0xff9a3c, hare: 0xff9a3c, lemming: 0xff9a3c, monkey: 0xff9a3c, sloth: 0xff9a3c, carrion: 0xb07a50, fish: 0x5fe8ff, eel: 0x5fe8ff, danger: 0xff3b3b };
const sounds = [];
{
  const ring = new THREE.RingGeometry(0.75, 1, 24), dot = new THREE.CircleGeometry(0.45, 16);
  for (let i = 0; i < 48; i++) {
    const g = new THREE.Group();
    const mr = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const md = mr.clone(); md.opacity = 0.9;
    const r = new THREE.Mesh(ring, mr), d = new THREE.Mesh(dot, md); g.add(r, d); g.renderOrder = 10; g.visible = false; scene.add(g);
    sounds.push({ g, r, d });
  }
}
function updateSoundVision(dt) {
  const on = game.state === 'play' && F.listening;
  $('listenFx').hidden = !on;
  let n = 0;
  if (on) {
    const add = (pos, color, size, phase) => {
      if (n >= sounds.length) return;
      const sv = sounds[n++], d = camera.position.distanceTo(pos), k = (0.25 + d * 0.018) * size;
      sv.g.visible = true; sv.g.position.copy(pos); sv.g.quaternion.copy(camera.quaternion);
      const pulse = (game.t * 1.6 + phase) % 1;
      sv.r.scale.setScalar(k * (0.6 + pulse * 1.4)); sv.r.material.opacity = 0.85 * (1 - pulse); sv.r.material.color.setHex(color);
      sv.d.scale.setScalar(k * (0.55 + Math.sin(game.t * 8 + phase * 6) * 0.12)); sv.d.material.color.setHex(color);
    };
    for (const p of prey) {
      if (p.state === 'dead' || p.state === 'carried' || p.state === 'roost') continue;
      if (p.type === 'eel' || p.type === 'fish') { if (p.state !== 'active') continue; }
      const d = p.pos.distanceTo(F.pos); if (d > 150) continue;
      add(tC.copy(p.pos).setY(p.pos.y + 0.15), SOUND_COL[p.type] || 0xffe066, PREY[p.type].critter ? 1 : 0.8, (p.phase || p.t || 0) % 1);
    }
    for (const f of foxes) if (f.pos.distanceTo(F.pos) < 150) add(tC.copy(f.pos).setY(f.pos.y + 0.5), SOUND_COL.danger, 1.6, 0.3);
    if (eagle.b.group.visible && eagle.pos.distanceTo(F.pos) < 300) add(eagle.pos, SOUND_COL.danger, 2, 0.6);
  }
  for (let i = n; i < sounds.length; i++) sounds[i].g.visible = false;
}
function updateParts(dt) {
  for (const p of parts) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.speck) p.v.y -= 9.8 * dt;
    else { p.v.multiplyScalar(Math.exp(-2.4 * dt)); p.v.y -= 1.0 * dt; p.v.y = Math.max(p.v.y, -1.6); p.m.position.x += Math.sin(p.life * 3 + p.spin.x) * dt * 0.8; }
    p.m.position.addScaledVector(p.v, dt);
    p.m.rotation.x += p.spin.x * dt; p.m.rotation.y += p.spin.y * dt;
    if (p.life < 1) p.m.scale.setScalar(Math.max(p.life, 0.01));
    if (p.life <= 0 || p.m.position.y < groundAt(p.m.position.x, p.m.position.z)) { p.life = 0; p.m.visible = false; }
  }
}

// ---------- speed lines ----------
const SL = 70;
const slGeo = new THREE.BufferGeometry(), slPos = new Float32Array(SL * 6), slData = [];
for (let i = 0; i < SL; i++) { const a = rand() * 6.28, r = 1.4 + rand() * 3.5; slData.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * .7, z: -rand() * 40 }); }
slGeo.setAttribute('position', new THREE.BufferAttribute(slPos, 3));
const speedLines = new THREE.LineSegments(slGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false }));
speedLines.frustumCulled = false;
camera.add(speedLines);
function updateSpeedLines(dt) {
  const kmh = F.speed * 3.6, o = game.state === 'play' && F.mode === 'fly' ? clamp((kmh - 140) / 160, 0, 0.55) : 0;
  speedLines.material.opacity = o; speedLines.visible = o > 0.01;
  if (!speedLines.visible) return;
  const len = 1 + F.speed * 0.05;
  slData.forEach((s, i) => {
    s.z += F.speed * 1.4 * dt; if (s.z > -1) s.z -= 40;
    slPos.set([s.x, s.y, s.z, s.x, s.y, s.z - len], i * 6);
  });
  slGeo.attributes.position.needsUpdate = true;
}

// ---------- audio ----------
const audio = { ctx: null };
function initAudio() {
  if (audio.ctx) { audio.ctx.resume?.(); return; }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const master = ctx.createGain(); master.gain.value = settings.muted ? 0 : 1;
    src.connect(lp).connect(gain).connect(master).connect(ctx.destination); src.start();
    const nb = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
    Object.assign(audio, { ctx, lp, gain, master, noise: nb });
  } catch (e) { }
}
function tone(freq, start, dur, { type = 'sine', vol = 0.15, to = null } = {}) {
  const a = audio; if (!a.ctx) return;
  const t = a.ctx.currentTime + start, o = a.ctx.createOscillator(), g = a.ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.master); o.start(t); o.stop(t + dur + 0.05);
}
function whoosh(vol = 0.12, freq = 700) {
  const a = audio; if (!a.ctx) return;
  const s = a.ctx.createBufferSource(), f = a.ctx.createBiquadFilter(), g = a.ctx.createGain();
  s.buffer = a.noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8; g.gain.value = vol;
  s.connect(f).connect(g).connect(a.master); s.start();
}
const sfx = {
  kek() { for (let i = 0; i < 5; i++) tone(2300, i * 0.11, 0.08, { type: 'sawtooth', vol: 0.05, to: 1700 }); },
  chirp() { for (let i = 0; i < 8; i++) tone(3000 + rand() * 900, i * 0.09, 0.07, { vol: 0.07, to: 4200 }); },
  level() { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.35, { type: 'triangle', vol: 0.12 })); },
  quest() { [659, 880].forEach((f, i) => tone(f, i * 0.1, 0.3, { type: 'triangle', vol: 0.1 })); },
  thud() { tone(120, 0, 0.3, { type: 'sine', vol: 0.3, to: 50 }); whoosh(0.3, 300); },
  caw() { tone(520, 0, 0.16, { type: 'sawtooth', vol: 0.08, to: 380 }); tone(500, 0.22, 0.16, { type: 'sawtooth', vol: 0.07, to: 360 }); },
  eagle() { tone(1500, 0, 0.25, { type: 'triangle', vol: 0.1, to: 2100 }); tone(2000, 0.27, 0.45, { type: 'triangle', vol: 0.09, to: 1100 }); },
  splash() { whoosh(0.35, 350); whoosh(0.2, 1400); },
  drink() { [0, 0.35, 0.7].forEach(t => tone(700, t, 0.08, { vol: 0.08, to: 500 })); },
  miss() { whoosh(0.18, 1100); tone(400, 0, 0.18, { type: 'triangle', vol: 0.06, to: 260 }); },
};
function updateAudio() {
  const a = audio; if (!a.ctx) return;
  const flying = game.state === 'play' && !game.paused && F.mode === 'fly';
  const s = F.speed / 110, t = a.ctx.currentTime;
  a.lp.frequency.setTargetAtTime(220 + (flying ? s : 0) * 2400, t, 0.1);
  a.gain.gain.setTargetAtTime(flying ? 0.06 + s * 0.55 : 0.02, t, 0.2);
  a.master.gain.setTargetAtTime(settings.muted ? 0 : 1, t, 0.05);
}

// ---------- input ----------
// inp.y: +1 means nose up (climb) in the air and walk forward on the ground
// Looking around turns your bird's head, up to how far that bird can really turn it (owls much further).
const LOOKER = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, drag: null, padHeld: false };
const headLimit = () => SP.lookLimit ?? 1.6;
const keys = {};
const touch = { x: 0, y: 0, flap: false, dive: false, skill: false, brake: false, id: null, ox: 0, oy: 0 };
let flapHeld = false, skillHeld = false;
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (game.state !== 'play' || e.repeat) return;
  if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
  if (game.paused) return;
  if (F.mode === 'sleep') { wake(); return; }
  if (e.code === 'KeyV' || e.code === 'KeyC') toggleCam();
  if (e.code === 'KeyE') doAction();
  if (e.code === 'KeyZ') trySleep();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
let padPrev = {};
{
  const startDrag = (e, el) => { LOOKER.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: LOOKER.tYaw, pitch: LOOKER.tPitch }; el.setPointerCapture?.(e.pointerId); };
  const moveDrag = e => {
    const d = LOOKER.drag; if (!d || d.id !== e.pointerId) return;
    LOOKER.tYaw = clamp(d.yaw - (e.clientX - d.x) * 0.006, -headLimit(), headLimit());
    LOOKER.tPitch = clamp(d.pitch - (e.clientY - d.y) * 0.004, -0.6, 0.5);
  };
  const endDrag = e => { if (LOOKER.drag && LOOKER.drag.id === e.pointerId) { LOOKER.drag = null; LOOKER.tYaw = 0; LOOKER.tPitch = 0; } };
  for (const el of [$('game'), $('lookZone')]) {
    el.addEventListener('pointerdown', e => { if (game.state === 'play' && !game.paused) startDrag(e, el); });
    el.addEventListener('pointermove', moveDrag);
    for (const ev of ['pointerup', 'pointercancel']) el.addEventListener(ev, endDrag);
  }
  $('game').addEventListener('contextmenu', e => e.preventDefault());
}
function readInput() {
  let x = 0, y = 0, flap = false, tuck = false, skill = !!keys.KeyQ || touch.skill, brake = !!keys.KeyB || touch.brake;
  if (keys.KeyA || keys.ArrowLeft) x -= 1;
  if (keys.KeyD || keys.ArrowRight) x += 1;
  if (keys.KeyW || keys.ArrowUp) y += 1;
  if (keys.KeyS || keys.ArrowDown) y -= 1;
  if (keys.Space) flap = true;
  if (keys.ShiftLeft || keys.ShiftRight) tuck = true;
  x += touch.x; y += touch.y; flap ||= touch.flap; tuck ||= touch.dive;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const dz = v => Math.abs(v) < 0.15 ? 0 : v;
    x += dz(gp.axes[0] || 0); y -= dz(gp.axes[1] || 0);
    const b = i => gp.buttons[i]?.pressed;
    flap ||= b(0); tuck ||= b(1) || b(7); brake ||= b(6); skill ||= b(5) || b(4);
    // right stick or d-pad to look around
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    if (rx || ry) { LOOKER.tYaw = -rx * headLimit(); LOOKER.tPitch = -ry * 0.5; LOOKER.padHeld = true; }
    else if (b(14) || b(15)) { LOOKER.tYaw = clamp(LOOKER.tYaw + (b(14) ? 1 : -1) * 2.5 / 60, -headLimit(), headLimit()); LOOKER.padHeld = true; }
    else if (LOOKER.padHeld) { LOOKER.tYaw = 0; LOOKER.tPitch = 0; LOOKER.padHeld = false; }
    if (b(3) && !padPrev[3]) toggleCam();
    if (b(2) && !padPrev[2]) doAction();
    if (b(9) && !padPrev[9]) togglePause();
    padPrev = { 2: b(2), 3: b(3), 9: b(9) };
    break;
  }
  if (settings.invert && F.mode === 'fly') y = -y;
  const flapPressed = flap && !flapHeld; flapHeld = flap;
  const skillPressed = skill && !skillHeld; skillHeld = skill;
  return { x: clamp(x, -1, 1), y: clamp(y, -1, 1), flap, tuck: tuck && !brake, flapPressed, skill, skillPressed, brake };
}
{
  const zone = $('stickZone'), stick = $('stick'), knob = $('knob');
  const home = () => { stick.style.left = ''; stick.style.top = ''; knob.style.transform = ''; touch.x = touch.y = 0; touch.id = null; };
  zone.addEventListener('pointerdown', e => {
    if (F.mode === 'sleep') { wake(); return; }
    touch.id = e.pointerId; touch.ox = e.clientX; touch.oy = e.clientY; zone.setPointerCapture(e.pointerId);
    stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; e.preventDefault();
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== touch.id) return;
    let dx = e.clientX - touch.ox, dy = e.clientY - touch.oy; const L = Math.hypot(dx, dy), R = 55;
    if (L > R) { dx *= R / L; dy *= R / L; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    touch.x = dx / R; touch.y = -dy / R;
  });
  for (const ev of ['pointerup', 'pointercancel']) zone.addEventListener(ev, e => { if (e.pointerId === touch.id) home(); });
  const hold = (id, key) => {
    const el = $(id);
    el.addEventListener('pointerdown', e => { touch[key] = true; el.classList.add('on'); el.setPointerCapture(e.pointerId); e.preventDefault(); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => { touch[key] = false; el.classList.remove('on'); });
  };
  hold('bFlap', 'flap'); hold('bDive', 'dive'); hold('bSkill', 'skill'); hold('bBrake', 'brake');
  $('bCam').addEventListener('pointerdown', e => { e.preventDefault(); toggleCam(); });
  $('bAct').addEventListener('pointerdown', e => { e.preventDefault(); doAction(); });
  $('sleepScreen').addEventListener('pointerdown', () => wake());
  document.addEventListener('gesturestart', e => e.preventDefault());
}

// ---------- game state and messages ----------
const game = { state: 'menu', paused: false, cam: 'third', t: 0, prevLevel: 0, autoT: 0 };
function toggleCam() { game.cam = game.cam === 'third' ? 'first' : 'third'; $('camBtn').textContent = 'View: ' + (game.cam === 'third' ? 'behind' : 'eyes'); }
const toastsEl = $('toasts');
function toast(msg, cls = '', ms = 2600) {
  if (game.state !== 'play' && game.state !== 'menu') return;
  const el = document.createElement('div'); el.className = 'toast ' + cls; el.textContent = msg;
  toastsEl.appendChild(el); while (toastsEl.children.length > 3) toastsEl.firstChild.remove();
  setTimeout(() => el.remove(), ms);
}
let factTimer = null;
function showFact(key, head = 'Bird fact') {
  $('factHead').textContent = head; $('factText').textContent = FACTS[key]; $('fact').hidden = false;
  clearTimeout(factTimer); factTimer = setTimeout(() => { $('fact').hidden = true; }, 14000);
}
const seenFacts = new Set();
const TIPS = {
  headwind: 'You are flying into a headwind, so you are going slower over the ground. The wind is lighter low down, so fly lower, or turn so the wind arrow points up (wind behind you).',
  energy: 'Energy is getting low. Stop flapping and glide: tip your nose down a little to keep your speed, and circle in a thermal to climb for free.',
  exhausted: 'Out of energy? Land on the ground, in a tree or at your nest to get it back. Eating something you catch also tops it up.',
  landing: 'Coming in to land? Hold ' + KEY.brake + ' to spread your wings and tail like air brakes. Touch down below 60 km/h for a soft landing.',
  slow: 'Going slowly? Point your nose down a little to swap height for speed, or give a few flaps.',
  flapping: 'Real birds of prey glide most of the time and only flap in short bursts. Gliding saves energy for the hunt.',
  climb: 'To climb high without using energy, find a thermal (swirling golden dust) and circle inside it.',
};
const HUNT_TIPS = {
  peregrine: `Peregrines hunt from high up. Climb above your prey, then hold ${KEY.dive} to stoop down onto it from above or behind.`,
  eagle: `Golden eagles hunt low and sneaky: glide just above the hillside, then drop onto hares and grouse before they can run. Come in at a medium speed, and use Keen sight (${KEY.skill}) to spot them. Dead rabbits are an easy meal too.`,
  owl: `Barn owls hunt by sound. Fly slowly and low over the fields while holding ${KEY.skill} to listen, then swoop on whatever you hear rustling.`,
  osprey: `Ospreys fish. Hover (hold ${KEY.skill}) over the river until you see a trout, then let go and dive feet-first into the water.`,
  kite: `Red kites are scavengers. Press ${KEY.skill} to scan for dead rabbits, then glide down slowly to pick one up.`,
  hawk: `Sparrowhawks ambush small birds. Fly low through the woods to stay hidden, then burst (${KEY.skill}) out at a flock of chaffinches.`,
  harpy: `Harpy eagles hunt in the treetops. Press ${KEY.skill} to spot monkeys and sloths, then skim in low over the canopy and grab them. Monkeys see you if you come in high: stay low.`,
  batfalcon: `Bat falcons are fast little hunters. Climb high and stoop on parakeets over the trees. At dusk, bats come out over the river: chase them down!`,
  snowyowl: `Snowy owls hunt by sound and sight. Hold ${KEY.skill} to listen for lemmings, then glide in low and slow to pounce. Ptarmigan sit still until you get close.`,
  gyr: `Gyrfalcons chase prey low over the ground. Fly close to ptarmigan to flush them, then chase hard and strike from behind.`,
};
const tipSeen = {};
let tipCool = 20, slowT = 0, flapT = 0;
function maybeTip(dt) {
  tipCool -= dt;
  const flying = F.mode === 'fly';
  slowT = flying && F.speed * 3.6 < 32 && !F.hovering ? slowT + dt : 0;
  flapT = flying && F.flapping ? flapT + dt : Math.max(0, flapT - dt * 2);
  if (tipCool > 0 || !$('fact').hidden) return;
  const w = F.wind, ws = w.length();
  const pick =
    !tipSeen.hunt && (F.food < 55 || game.t > 90) ? 'hunt' :
    flying && ws > 4 && (w.x * F.fwd.x + w.z * F.fwd.z) < -0.6 * ws ? 'headwind' :
    flying && !F.braking && F.speed * 3.6 > 65 && F.fwd.y < -0.05 && F.pos.y - surfaceAt(F.pos.x, F.pos.z) < 20 ? 'landing' :
    F.exhausted ? 'exhausted' :
    flying && F.energy < energyCap() * 0.35 ? 'energy' :
    slowT > 3 ? 'slow' :
    flapT > 6 ? 'flapping' :
    flying && F.inThermal === false && F.pos.y - groundAt(F.pos.x, F.pos.z) < 15 && F.energy < energyCap() * 0.6 ? 'climb' : null;
  if (!pick || (tipSeen[pick] || 0) >= 2) return;
  tipSeen[pick] = (tipSeen[pick] || 0) + (pick === 'hunt' ? 2 : 1); tipCool = 75;
  $('factHead').textContent = pick === 'hunt' ? 'Hunting tip' : 'Flying tip'; $('factText').textContent = pick === 'hunt' ? HUNT_TIPS[spId] || TIPS.climb : TIPS[pick]; $('fact').hidden = false;
  clearTimeout(factTimer); factTimer = setTimeout(() => { $('fact').hidden = true; }, 12000);
}
function showFactOnce(key) { if (!FACTS[key] || seenFacts.has(key)) return; seenFacts.add(key); showFact(key, 'Wild fact'); }
$('fact').addEventListener('pointerdown', () => { $('fact').hidden = true; });
function flash(color, strength = 0.5) {
  const el = $('flash'); el.style.transition = 'none'; el.style.background = color; el.style.opacity = strength;
  requestAnimationFrame(() => { el.style.transition = 'opacity .6s'; el.style.opacity = 0; });
}
let hurtLevel = 0;
const hurtPulse = v => { hurtLevel = Math.max(hurtLevel, v); };
const warned = {};
function warnOnce(key, on, off, msg) { if (on && !warned[key]) { warned[key] = true; toast(msg, 'bad', 4000); } else if (off) warned[key] = false; }

function gainXP(n) {
  prog.xp += n;
  const l = levelIdx();
  if (l > game.prevLevel) {
    game.prevLevel = l; const L = LEVELS[l];
    noteLevel(l + 1, true);
    setTimeout(() => {
      toast(`Level ${l + 1}: ${L.name}`, 'big', 3500);
      if (L.skill) toast(`New skill: ${SKILLS[L.skill].name}`, 'gold', 4000);
      toast(`You've grown! Wingspan now ${wingspanText()}`, 'gold', 4000);
      sfx.level();
    }, 600);
  }
  applyGrowth(); persist(); renderStatus();
}
function renderStatus() {
  const l = levelIdx(), L = LEVELS[l], N = LEVELS[l + 1];
  $('lvlNum').textContent = 'Lv ' + (l + 1); $('lvlName').textContent = L.name;
  $('xpBar').style.width = N ? ((prog.xp - L.xp) / (N.xp - L.xp) * 100) + '%' : '100%';
}
function renderMission() {
  const m = missions()[prog.mission];
  if (!m) { $('mNum').textContent = 'complete'; $('mTitle').textContent = 'Free flight'; $('mText').textContent = 'Hunt, explore and keep your chicks fed. Fed so far: ' + stats().fed + '.'; return; }
  $('mNum').textContent = `${prog.mission + 1} of ${missions().length}`; $('mTitle').textContent = m.title; $('mText').textContent = m.text();
}
function checkMissions() {
  const m = missions()[prog.mission];
  if (!m || !m.done(stats())) return;
  prog.mission++;
  toast('Quest complete: ' + m.title, 'gold', 3200); sfx.quest();
  showFact(m.fact);
  gainXP(60);
  renderMission();
  if (prog.mission >= missions().length && !prog.done) {
    prog.done = true; persist();
    $('completeTitle').textContent = m.title;
    $('completeText').textContent = `You have finished all the ${SP.name.toLowerCase()} quests in the ${WORLDS[BIOME].name}.`;
    setTimeout(() => { if (game.state === 'play') { game.paused = true; $('complete').hidden = false; } }, 2500);
  }
}

// ---------- injuries ----------
function injure(amount, msg) {
  F.health -= amount; stats().crashes++;
  sfx.thud(); flash('rgba(239,106,85,.8)', 0.55); hurtPulse(1);
  if (F.health <= 0) { collapse(msg); return; }
  toast(msg + (F.health < 40 ? ' You are injured: rest to heal.' : ''), 'bad', 3500);
}
function collapse(msg) {
  dropCarry();
  F.health = 40; F.energy = 50; F.food = Math.max(F.food, 30); F.water = Math.max(F.water, 30); F.rest = Math.max(F.rest, 40);
  perchAt('nest', true); F.exhausted = false; F.stunT = 0;
  TOD.scale = 1; $('sleepScreen').hidden = true;
  TOD.hour = (TOD.hour + 3) % 24;
  flash('rgba(5,9,24,1)', 1);
  toast(msg + ' You passed out and woke up back at your nest.', 'bad', 5500);
  persist();
}

// ---------- catching and carrying ----------
function distToSeg(p, a, b) {
  tB.subVectors(b, a); const L2 = tB.lengthSq();
  const t = L2 ? clamp(tC.subVectors(p, a).dot(tB) / L2, 0, 1) : 0;
  return tC.copy(a).addScaledVector(tB, t).distanceTo(p);
}
// How likely a strike is to hold: speed matters most, then the angle you come in from.
function strikeOdds(p) {
  const kmh = F.speed * 3.6;
  if (PREY[p.type].critter) {
    let c, why;
    if (p.type === 'carrion') {
      c = kmh < 70 ? 0.95 : 0.4; why = 'Too fast to grab it! Slow down and swoop low.';
    } else if (p.type === 'hare') {
      c = kmh < 40 ? 0.45 : kmh < 170 ? 0.88 : 0.5;
      why = kmh >= 170 ? 'Too fast! You overshot the hare.' : kmh < 40 ? 'Too slow! The hare kicked free.' : 'The hare jinked (dodged sharply sideways) and got away!';
      if (p.fleeT > 0) c -= 0.05;
    } else if (p.type === 'monkey') {
      c = kmh < 20 ? 0.5 : kmh < 110 ? 0.86 : 0.4;
      why = kmh >= 110 ? 'Too fast! You overshot the monkey.' : 'The monkey grabbed a branch and swung away!';
      if (p.fleeT > 0) c -= 0.2;
    } else if (p.type === 'sloth') {
      c = kmh < 90 ? 0.93 : 0.5; why = 'Too fast! You overshot. Sloths don\'t run, so take your time.';
    } else if (p.type === 'fish') {
      c = 0.6; why = `The ${PREY.fish.name.toLowerCase()} slipped back into the deep water.`;
    } else if (p.type === 'shrew') {
      c = kmh < 15 ? 0.5 : kmh < 90 ? 0.82 : kmh < 140 ? 0.45 : 0.2;
      why = kmh >= 90 ? `Too fast! You overshot the ${PREY.shrew.name.toLowerCase()}. Swoop in slower.` : `The ${PREY.shrew.name.toLowerCase()} darted into cover!`;
      if (p.fleeT > 0) c -= 0.12;
    } else {
      c = kmh < 90 ? 0.75 : 0.3;
      why = kmh >= 90 ? 'Too fast! The eel slipped away in the splash.' : 'The slippery eel wriggled free!';
    }
    if (has('grip')) c += 0.1;
    if (F.health < 40) c -= 0.1;
    return dietOdds(p, c, why);
  }
  let c = kmh < 50 ? 0.2 : kmh < 100 ? 0.45 : kmh < 170 ? 0.7 : kmh < 220 ? 0.86 : 0.95;
  tA.copy(p.vel).normalize();
  const along = F.fwd.dot(tA), fromAbove = -F.fwd.y;
  let why = '';
  if (along > 0.4) c += 0.1;
  if (along < -0.4) { c -= 0.3; why = 'Bad angle! Come from above or behind, not head-on.'; }
  if (fromAbove > 0.35) c += 0.12;
  if (p.fleeT > 0) c -= 0.08;
  if (p.type === 'teal') c -= 0.05;
  if (p.type === 'crow') { c -= 0.08; if (why === '') why = 'The crow twisted away. Crows are tough and agile!'; }
  if (has('grip')) c += 0.1;
  if (F.health < 40) c -= 0.1;
  if (!why) why = kmh < 100 ? 'Too slow! It dodged. Come in fast, from above or behind.' : 'It jinked away at the last moment!';
  if (p.type === 'finch' && SP.treeSafe) c += 0.2;
  return dietOdds(p, c, why);
}
// what each bird is built to catch
const plural = n => /s$|leftovers|char$|bass$|caribou$/.test(n) ? n : n + 's';
function dietOdds(p, c, why) {
  const diet = SP.diet[p.type] ?? 1;
  if (has('talons')) c += 0.06;
  if (diet < 0.2) why = spId === 'osprey' ? 'Ospreys only really eat fish!' : `${SP.plural} don't really hunt ${plural(PREY[p.type].name.toLowerCase())}. Too ${p.type === 'hare' ? 'big' : 'tricky'} for you!`;
  return { chance: clamp(c * diet, 0.03, 0.97), why };
}
function tryCatch() {
  if (F.carry) return;
  const R = 1.6 + SIZE + (has('grip') ? 0.8 : 0);
  for (const p of prey) {
    const heard = F.listening && p.type === 'shrew' && p.state === 'hidden';
    if ((!catchable(p) && !heard) || p.dodgeT > 0) continue;
    if (distToSeg(p.pos, F.prev, F.pos) < R) {
      const { chance, why } = strikeOdds(p);
      if (rand() < chance) catchPrey(p);
      else if (PREY[p.type].critter) {
        stats().misses++; burst(p.pos, tA.set(0, 3, 0), PREY[p.type].feathers, 4, 0); sfx.miss();
        if (p.type === 'hare') { p.dodgeT = 2; p.fleeT = 4; p.yaw += rand() < .5 ? 1.4 : -1.4; } else hideCritter(p, 6 + rand() * 6, false);
        toast('Missed! ' + why, 'bad', 3000);
      } else {
        p.dodgeT = 3; p.fleeT = 3.5; stats().misses++;
        tA.set(F.fwd.z, 0.4, -F.fwd.x).multiplyScalar(rand() < 0.5 ? 12 : -12); p.vel.add(tA);
        burst(p.pos, p.vel, PREY[p.type].feathers, 5, 0); sfx.miss();
        toast('Missed! ' + why, 'bad', 3000);
      }
      break;
    }
  }
}
function catchPrey(p) {
  const T = PREY[p.type], kmh = F.mode === 'fly' ? F.speed * 3.6 : 0, stoop = !T.critter && kmh >= 200;
  const xp = T.xp * (stoop ? 2 : 1);
  burst(p.pos, p.vel, T.feathers, T.critter ? 12 : 36);
  showFactOnce(p.type);
  p.b.group.visible = true;
  p.state = 'carried'; F.carry = p;
  falcon.group.add(p.b.group);
  p.b.group.rotation.set(0.25, 0, 0); p.b.group.scale.setScalar(p.b.scale / falcon.group.scale.x);
  p.size = null; placeCarry();
  animWings(p.b, { droop: 0.9 });
  stats()[p.type]++; if (stoop) stats().stoops++;
  sfx.kek(); whoosh(0.25, 500);
  flash('rgba(255,255,255,.9)', 0.35);
  if (stoop) toast(`STOOP STRIKE! ${T.name} +${xp} XP`, 'big', 3000);
  else toast(`${T.name} caught! +${xp} XP`, 'gold');
  gainXP(xp);
}
// Carried prey hangs just below the talons in flight and lies in front of your feet on the ground.
// Positions are worked out in metres, then converted into the bird's own (scaled) space.
const carryBox = new THREE.Box3(), carrySize = new V3(), carryQ = new THREE.Quaternion(), carryE = new THREE.Euler();
function placeCarry() {
  const p = F.carry, s = falcon.group.scale.x;
  p.b.group.scale.setScalar(p.b.scale / s);
  if (!p.size) { falcon.group.updateMatrixWorld(true); carryBox.setFromObject(p.b.group, true).getSize(carrySize); p.size = { h: carrySize.y, len: Math.max(carrySize.x, carrySize.z) }; }
  const o = LOOK[SP.look], bodyLen = o.realLen * growth(), belly = o.body[1] * 0.5 * s;
  if (F.mode === 'fly') {
    // hanging from the talons, just below the belly
    p.b.group.position.set(0, -(belly + 0.05 + p.size.h * 0.5) / s, 0.05 * bodyLen / s);
    p.b.group.rotation.set(0.15, 0, 0);
  } else {
    // lying on its side across the ground in front of your feet, resting exactly on the surface
    const ahead = bodyLen * 0.35 + p.size.len * 0.3;
    const gx = F.pos.x + Math.sin(F.yaw) * ahead, gz = F.pos.z + Math.cos(F.yaw) * ahead, gy = surfaceAt(gx, gz);
    falcon.group.updateMatrixWorld(true);
    carryQ.setFromEuler(carryE.set(0, F.yaw + Math.PI / 2, Math.PI / 2, 'YXZ'));
    p.b.group.quaternion.copy(falcon.group.quaternion).invert().multiply(carryQ);
    const wp = falcon.group.worldToLocal(tC.set(gx, gy, gz));
    p.b.group.position.copy(wp); p.b.group.updateMatrixWorld(true);
    const lift = gy - carryBox.setFromObject(p.b.group, true).min.y;
    p.b.group.position.copy(falcon.group.worldToLocal(tC.set(gx, gy + lift, gz)));
  }
}
function dropCarry() {
  const p = F.carry; if (!p) return;
  falcon.group.remove(p.b.group); p.b.group.visible = false;
  p.state = 'dead'; p.respawn = 25 + rand() * 15;
  F.carry = null;
}
function eatCarry() {
  if (!F.carry) return;
  const T = PREY[F.carry.type];
  burst(F.pos, tA.copy(F.fwd).multiplyScalar(F.mode === 'fly' ? F.speed : 0), T.feathers, 24);
  dropCarry();
  F.food = Math.min(100, F.food + T.food); F.energy = Math.min(energyCap(), F.energy + 30);
  if (F.energy >= 25) F.exhausted = false;
  stats().eaten++;
  toast('Gulp! Food and energy restored.', 'gold'); persist();
}
function feedChicks() {
  dropCarry();
  stats().fed++; chickHop = 3;
  sfx.chirp(); toast('Your chicks are fed! +50 XP', 'gold', 3000);
  gainXP(50);
}

// ---------- landing, perching, walking, sleeping ----------
function canDrink() {
  if (F.mode !== 'ground') return false;
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; if (heightAt(F.pos.x + Math.cos(a) * 3, F.pos.z + Math.sin(a) * 3) < 0) return true; }
  return false;
}
function actionLabel() {
  if (F.mode === 'sleep') return 'WAKE';
  if (F.carry && F.mode !== 'sleep') return 'EAT';
  if (shrewInReach()) return 'POUNCE';
  if (canDrink()) return 'DRINK';
  if (F.mode === 'perch') return 'SLEEP';
  return '';
}
function doAction() {
  if (game.state !== 'play' || game.paused) return;
  const a = actionLabel();
  if (a === 'WAKE') wake();
  else if (a === 'EAT') eatCarry();
  else if (a === 'POUNCE') pounce();
  else if (a === 'DRINK') drink();
  else if (a === 'SLEEP') trySleep();
  else if (F.mode === 'ground') toast('Walk to the water\'s edge to drink, or fly to a tree or your nest to sleep.');
}
function shrewInReach() {
  if (F.mode !== 'ground' || F.carry || F.stunT > 0) return null;
  return prey.find(p => p.type === 'shrew' && p.state === 'active' && Math.hypot(p.pos.x - F.pos.x, p.pos.z - F.pos.z) < 1.5) || null;
}
function pounce() {
  const p = shrewInReach(); if (!p) return;
  F.yaw = Math.atan2(p.pos.x - F.pos.x, p.pos.z - F.pos.z); F.pos.x = lerp(F.pos.x, p.pos.x, 0.6); F.pos.z = lerp(F.pos.z, p.pos.z, 0.6);
  if (rand() < (p.fleeT > 0 ? 0.55 : 0.8)) catchPrey(p);
  else { hideCritter(p, 6 + rand() * 6, false); stats().misses++; sfx.miss(); toast(`Missed! The ${PREY.shrew.name.toLowerCase()} escaped into cover.`, 'bad'); }
}
function drink() {
  F.water = 100; F.drinkT = 1.6; stats().drinks++;
  sfx.drink(); toast('Ahh, fresh water.', 'gold'); persist();
}
function trySleep() {
  if (F.mode === 'fly') { toast('Land in a tree or your nest first, then sleep.'); return; }
  if (F.mode === 'ground' && nearNest()) { perchAt('nest', true); }
  else if (F.mode === 'ground') { toast('Too dangerous to sleep on the ground! Find a tree or your nest.', 'bad'); return; }
  if (F.mode !== 'perch') return;
  if (F.rest > 96 && (SP.nocturnal ? nightF > 0.5 : nightF < 0.5)) { toast('You are fully rested. Sleep when your Rest bar is lower, or at night.'); return; }
  if (F.carry) eatCarry();
  F.mode = 'sleep'; TOD.scale = 36; stats().sleeps++;
  $('sleepScreen').hidden = false;
  persist();
}
function wake(msg) {
  if (F.mode !== 'sleep') return;
  F.mode = 'perch'; TOD.scale = 1;
  $('sleepScreen').hidden = true;
  toast(msg || (TOD.hour < 12 && TOD.hour >= 5 ? 'Good morning!' : 'You woke up.'), 'gold');
  persist();
}
function perchAt(type, silent = false, tree = null) {
  F.mode = 'perch'; F.perchType = type; F.tree = tree;
  if (type === 'nest') { const n = NESTS[spId]; F.pos.copy(n.perch).y += LEG; F.yaw = n.yaw; }
  else F.pos.set(tree.x, tree.perchY, tree.z);
  F.speed = 0; F.pitch = 0; F.roll = 0; F.tuck = 1; F.flare = 0;
  if (!silent) {
    stats().landings++;
    toast(type === 'nest' ? 'Home at your nest. Safe from danger.' : 'Perched in a tree. Hidden from danger.', 'gold');
    whoosh(0.15, 600);
  }
  if (type === 'nest' && F.carry) feedChicks();
}
function landGround(soft) {
  F.mode = 'ground'; F.perchType = null; F.tree = null;
  F.pos.y = surfaceAt(F.pos.x, F.pos.z) + LEG;
  F.speed = 0; F.pitch = 0; F.roll = 0; F.tuck = 1; F.flare = 0;
  stats().landings++;
  if (soft) {
    const c = colliderAt(F.pos.x, F.pos.z);
    toast(c ? `Landed on the ${c.name}.` : `Landed. Watch out for ${PRED.name === 'fox' ? 'foxes' : PRED.name + 's'} on the ground!`, 'gold');
    whoosh(0.15, 600);
  }
}
function takeOff() {
  if (F.stunT > 0) return;
  if (F.exhausted || F.energy < 6) { toast('Too tired to take off. Rest a bit longer.', 'bad'); return; }
  const fromPerch = F.mode === 'perch';
  F.mode = 'fly'; F.energy -= 6;
  F.speed = fromPerch ? 13 : 11; F.pitch = fromPerch ? 0.15 : 0.55; F.pos.y += 0.8; F.tuck = 0; F.flapPh = 0;
  if (fromPerch && F.perchType === 'tree') F.pos.y += 2;
  F.noPerchT = 2.5; F.takeoffT = 1.5; F.sink = 0;
  whoosh(0.2, 800);
}
function checkCollisions() {
  const kmh = Math.hypot(F.speed, F.sink || 0) * 3.6;
  // the nest
  if (F.noPerchT <= 0 && Math.hypot(F.pos.x - EX, F.pos.z - EZ) < 12 && F.pos.y < EY + 5 && F.pos.y > EY - 4 && kmh < 80) { perchAt('nest'); return true; }
  // trees: slow means perch and hide, fast means a painful crash
  F.inWoods = false;
  for (const t of treesNear(F.pos.x, F.pos.z)) {
    const d = Math.hypot(F.pos.x - t.x, F.pos.z - t.z);
    if (d < t.r * 0.85 && F.pos.y < t.top && F.pos.y > t.base) {
      if (F.noPerchT > 0) continue;
      if (SP.treeSafe && kmh >= 35 && kmh < 95) { F.inWoods = true; continue; }
      if (kmh < 60) { perchAt('tree', false, t); return true; }
      injure(Math.round(8 + (kmh - 60) * 0.3), `Ouch! You flew into a tree. Slow below ${spd(60)} to land in one.`);
      if (F.mode !== 'fly') return true;
      tA.set(F.pos.x - t.x, 0, F.pos.z - t.z); if (tA.lengthSq() < 0.01) tA.set(1, 0, 0);
      tA.setLength(t.r + 1); F.pos.x = t.x + tA.x; F.pos.z = t.z + tA.z;
      F.speed = 6; F.pitch = 0.1; F.yaw = Math.atan2(tA.x, tA.z);
      return false;
    }
  }
  // buildings
  const c = colliderAt(F.pos.x, F.pos.z);
  if (c && F.pos.y < c.top + 0.3) {
    if (kmh < 60 && F.prev.y >= c.top - 0.8) { landGround(true); return true; }
    injure(Math.round(10 + Math.max(0, kmh - 50) * 0.3), `Smack! You hit the ${c.name}.`);
    if (F.mode !== 'fly') return true;
    tA.set(F.pos.x - c.x, 0, F.pos.z - c.z).setLength(c.r + 1.5); F.pos.x = c.x + tA.x; F.pos.z = c.z + tA.z;
    F.speed = 6; F.pitch = 0.2; F.yaw = Math.atan2(tA.x, tA.z);
    return false;
  }
  // ground and water
  const g = heightAt(F.pos.x, F.pos.z);
  if (F.pos.y < Math.max(g, 0) + 0.6) {
    if (g < 0.15 && spId === 'osprey' && F.pitch < -0.25) { ospreyPlunge(kmh); return false; }
    if (g < 0.15) {
      F.pos.y = 1.4; F.pitch = 0.45; F.speed = Math.max(F.speed * 0.5, 11); F.energy = Math.max(0, F.energy - 10);
      burst(F.pos, tA.set(0, 6, 0), [0xcfe8f5, 0xffffff, 0x9fd0ec], 18, 0); sfx.splash();
      if (kmh > 130) injure(15, 'Splash! You hit the water hard.');
      else if (spId === 'osprey') toast(`Splash! To fish, hover over a fish shadow, then dive steeply, feet first.`, 'bad');
      else toast(`Splash! ${SP.plural} can't swim. Land on the bank.`, 'bad');
      return false;
    }
    const steep = F.pitch < -0.45;
    if (kmh < 65 && !steep) landGround(true);
    else if (kmh < 120 && F.pitch > -0.7) { landGround(false); injure(Math.round((kmh - 65) * 0.5) + 3, `Rough landing! Hold ${KEY.brake} to brake before you touch down.`); }
    else { landGround(false); F.stunT = 3; injure(Math.round(25 + (kmh - 120) * 0.25), 'Crash! Pull out of the dive sooner.'); }
    return true;
  }
  return false;
}

// an osprey hits the water feet-first and grabs any fish close by
function ospreyPlunge(kmh) {
  burst(F.pos, tA.set(0, 7, 0), [0xcfe8f5, 0xffffff, 0x9fd0ec], 26, 0); sfx.splash();
  const fish = F.carry ? null : prey.find(p => (p.type === 'fish' || p.type === 'eel') && p.state === 'active' && Math.hypot(p.pos.x - F.pos.x, p.pos.z - F.pos.z) < 5);
  if (fish) { if (rand() < 0.85 * (SP.diet[fish.type] ?? 1)) catchPrey(fish); else { hideCritter(fish, 6, false); stats().misses++; toast('Splash! The fish got away.', 'bad'); } }
  else toast('Splash! No fish there. Hover over a fish shadow first.', 'bad');
  F.pos.y = 1.4; F.pitch = 0.5; F.speed = 9; F.energy = Math.max(0, F.energy - 6); F.tuck = 0;
  if (kmh > 200) injure(12, 'You hit the water too hard!');
}

// ---------- the falcon each frame ----------
const fwdOf = (yaw, pitch, out) => out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
let target = null;
function updateFlight(dt, inp) {
  F.prev.copy(F.pos);
  F.noPerchT = Math.max(0, (F.noPerchT || 0) - dt);
  const injured = F.health < 40;
  const canFlap = !F.exhausted && F.energy > 0;
  F.tuck = damp(F.tuck, inp.tuck ? 1 : 0, 6, dt);
  const wobble = injured ? Math.sin(game.t * 2.3) * 0.1 : 0;
  F.roll = damp(F.roll, inp.x * (0.95 - F.tuck * 0.35) * (injured ? 0.8 : 1) + wobble, 4, dt);
  F.yaw -= Math.sin(F.roll) * SP.turn * (1 - F.tuck * 0.45) * dt;
  F.pitch += inp.y * (1.1 + F.speed / 90) * dt;
  if (F.tuck > 0.4 && inp.y <= 0) F.pitch = damp(F.pitch, -1.25, 1.4 * F.tuck, dt);
  if (settings.autoLevel && Math.abs(inp.y) < 0.1 && F.tuck < 0.3) F.pitch = damp(F.pitch, -0.05, 0.45, dt);
  // Sparrowhawks (and other forest hunters) weave: when flying low among trees, the bird swerves round trunks ahead.
  F.weaving = false;
  if (SP.treeSafe && F.speed > 8) {
    let push = 0;
    for (const t of treesNear(F.pos.x, F.pos.z)) {
      if (F.pos.y > t.top - 2.5) continue;   // skimming over the top of a tree: no need to swerve
      const dx = t.x - F.pos.x, dz = t.z - F.pos.z, ahead = dx * Math.sin(F.yaw) + dz * Math.cos(F.yaw), side = dx * Math.cos(F.yaw) - dz * Math.sin(F.yaw);
      const clear = (F.pos.y < t.base ? 1.2 : t.r * 0.9) + 0.8;
      if (ahead > 0 && ahead < 14 + F.speed * 0.6 && Math.abs(side) < clear) push += Math.sign(side || 1) * (1 - ahead / (14 + F.speed * 0.6)) * (clear - Math.abs(side) + 0.5);
    }
    if (push) {
      F.weaving = true; F.weaveT = 0.6;
      F.yaw -= clamp(push * 1.2, -3, 3) * dt;                      // swerve away from the trunk
      F.roll = damp(F.roll, clamp(push * 0.6, -1.1, 1.1), 7, dt);   // and bank hard into the swerve
    }
    F.weaveT = Math.max(0, (F.weaveT || 0) - dt);
  }
  // gentle aim assist toward the marked prey
  if (target && !F.carry) {
    tA.subVectors(target.pos, F.pos); const d = tA.length(); tA.normalize();
    if (d < 90 && tA.dot(F.fwd) > 0.86) {
      const wantYaw = Math.atan2(tA.x, tA.z), wantPitch = Math.asin(clamp(tA.y, -1, 1));
      F.yaw += clamp(wrapAngle(wantYaw - F.yaw), -0.9 * dt, 0.9 * dt); F.pitch += clamp(wantPitch - F.pitch, -0.9 * dt, 0.9 * dt);
    }
  }
  F.pitch = clamp(F.pitch, -1.5, 0.85);

  const sp = Math.sin(F.pitch), agl = F.pos.y - surfaceAt(F.pos.x, F.pos.z);
  // braking: spread wings and tail wide like air brakes and swing the feet forward
  F.braking = !!inp.brake && F.tuck < 0.5;
  F.flare = damp(F.flare, F.braking || (inp.y > 0.3 && agl < 25 && F.tuck < 0.3 && F.speed < 30) ? 1 : 0, 6, dt);
  const openDrag = SP.drag * (has('glide') ? 0.9 : 1) + 0.004 * Math.max(0, -sp) + F.flare * 0.008 + (F.braking ? 0.014 : 0);
  const drag = lerp(openDrag, has('arrow') ? SP.arrowDrag : SP.tuckDrag, F.tuck);
  let acc = -9.8 * sp - drag * F.speed * F.speed;
  const flapping = inp.flap && canFlap && F.tuck < 0.5;
  if (inp.flapPressed && !canFlap) toast('Too tired to flap! Glide down, land and rest, or eat.', 'bad');
  const power = (has('wings') ? 1.3 : 1) * (injured ? 0.6 : 1);
  let lift = F.flare * 1.5;
  if (flapping) { acc += SP.thrust * power; lift += SP.lift * power; F.energy -= SP.flapCost * dt; }
  useSkill(dt, inp);
  if (F.carry) acc -= 0.5;
  // No stalling: a slow glide without flapping just drifts gently downward. Flapping holds you up.
  F.takeoffT = Math.max(0, (F.takeoffT || 0) - dt);
  F.sink = damp(F.sink || 0, flapping || F.takeoffT > 0 ? 0 : clamp((12 - F.speed) * 0.25, 0, 1.5), 2, dt);
  F.inThermal = false;
  for (const t of THERMALS) {
    const lean = thermalLean(t, F.pos.y);
    if (Math.hypot(F.pos.x - lean.x, F.pos.z - lean.z) < t.r && F.pos.y < t.top) { F.inThermal = true; lift += t.lift * SP.thermal * (1 - F.tuck); }
  }
  F.thin = F.pos.y > THIN_AIR;
  if (F.thin) F.energy -= 7 * dt;
  F.energy = clamp(F.energy, 0, energyCap());
  if (F.energy <= 0 && !F.exhausted) { F.exhausted = true; toast('Out of energy! You can only glide now. Land to rest, or eat your prey.', 'bad', 4500); }
  if (F.hovering) {
    // hovering: wings beat hard, you hang in one spot facing the wind and can look straight down
    F.speed = damp(F.speed, 0.5, 3, dt); F.pitch = damp(F.pitch, 0, 3, dt); F.roll = damp(F.roll, 0, 3, dt);
    lift = 0; F.sink = 0;
  } else F.speed = clamp(F.speed + acc * dt, F.braking ? 5 : 7, injured ? Math.min(75, SP.maxSpeed) : SP.maxSpeed);

  fwdOf(F.yaw, F.pitch, F.fwd);
  F.pos.addScaledVector(F.fwd, F.speed * dt);
  F.pos.y += (lift - F.sink) * dt;
  // at the slowest gliding speed you can't keep climbing without flapping (no stall, the nose stays put)
  if (!flapping && !F.hovering && F.fwd.y > 0 && F.speed < 9) F.pos.y -= F.fwd.y * F.speed * dt * (1 - (F.speed - 7) / 2);
  // the air itself moves you: wind changes speed and direction with height
  // Wind drifts you along, but a headwind can never slow you to a crawl: it takes off at most a quarter of your speed.
  windAt(F.pos.y, F.wind);
  const drift = tA.copy(F.wind).multiplyScalar(F.hovering ? 0.15 : 0.55);
  const fx = Math.sin(F.yaw), fz = Math.cos(F.yaw), along = drift.x * fx + drift.z * fz, limit = -0.25 * F.speed * Math.cos(F.pitch);
  if (along < limit) { drift.x += (limit - along) * fx; drift.z += (limit - along) * fz; }
  F.pos.addScaledVector(drift, dt);
  F.groundSpeed = Math.hypot((F.pos.x - F.prev.x) / Math.max(dt, 1e-3), (F.pos.z - F.prev.z) / Math.max(dt, 1e-3));

  tryCatch();
  if (checkCollisions()) return;
  if (F.pos.y > 640) { F.pos.y = 640; F.pitch = Math.min(F.pitch, 0); }
  const r = Math.hypot(F.pos.x, F.pos.z);
  if (r > LIMIT) {
    F.yaw += clamp(wrapAngle(Math.atan2(-F.pos.x, -F.pos.z) - F.yaw), -1.2 * dt, 1.2 * dt);
    if (!F.edgeWarned) { toast(`This is the edge of the ${WORLDS[BIOME].name}. Turn back!`, 'bad'); F.edgeWarned = true; }
  } else if (r < LIMIT - 80) F.edgeWarned = false;

  const kmh = F.speed * 3.6;
  if (kmh > stats().topSpeed) stats().topSpeed = kmh;
  if (F.inThermal) stats().thermalTime += dt;
  if ((F.inWoods || F.weaveT > 0) && kmh > 50) stats().woodsTime += dt;
  F.flapping = flapping;
  if (F.carry && Math.hypot(F.pos.x - EX, F.pos.z - EZ) < 20 && Math.abs(F.pos.y - EY) < 30) feedChicks();
}
function updateGround(dt, inp) {
  F.prev.copy(F.pos);
  F.stunT = Math.max(0, F.stunT - dt); F.drinkT = Math.max(0, F.drinkT - dt);
  F.moving = false;
  if (F.stunT <= 0) {
    F.yaw -= inp.x * 1.8 * dt;
    if (Math.abs(inp.y) > 0.1 && F.drinkT <= 0) {
      const sp = inp.y * 1.4;
      const nx = F.pos.x + Math.sin(F.yaw) * sp * dt, nz = F.pos.z + Math.cos(F.yaw) * sp * dt;
      if (heightAt(nx, nz) > 0.1) { F.pos.x = nx; F.pos.z = nz; F.moving = true; }
    }
    if (inp.flapPressed) takeOff();
  }
  if (F.mode === 'ground' && nearNest() && F.stunT <= 0) { perchAt('nest', true); toast('You hop into your nest.', 'gold'); return; }
  if (F.mode === 'ground') F.pos.y = surfaceAt(F.pos.x, F.pos.z) + LEG + (F.moving ? Math.abs(Math.sin(game.t * 9)) * 0.06 : 0);
}
// each bird's special skill
function useSkill(dt, inp) {
  F.scanT = Math.max(0, (F.scanT || 0) - dt); F.skillCool = Math.max(0, (F.skillCool || 0) - dt);
  const ab = SP.ability, flying = F.mode === 'fly';
  F.listening = ab === 'listen' && inp.skill && F.mode !== 'sleep';
  if (F.listening) stats().listenTime += dt;
  const wasHover = F.hovering;
  F.hovering = ab === 'hover' && inp.skill && flying && !F.exhausted && F.energy > 0 && F.tuck < 0.3;
  if (F.hovering) { F.energy -= 9 * dt; stats().hoverTime += dt; }
  if (wasHover && !F.hovering && flying) F.speed = Math.max(F.speed, 8);
  if (!inp.skillPressed) return;
  if (ab === 'sight' || ab === 'scan') {
    if (F.skillCool > 0) { toast(`Wait ${Math.ceil(F.skillCool)}s before using ${ABILITY[ab].name.toLowerCase()} again.`); return; }
    F.scanT = 12; F.skillCool = 20; stats().scans++;
    toast(ab === 'sight' ? 'Keen sight! Hares show up from far away.' : 'Scanning the fields for food…', 'gold');
  } else if (ab === 'burst' && flying) {
    if (F.skillCool > 0 || F.energy < 15 || F.exhausted) { toast('Too tired for a burst right now.', 'bad'); return; }
    F.speed += 14; F.energy -= 15; F.skillCool = 5; stats().bursts++; whoosh(0.3, 1000);
  }
}
const nearNest = () => Math.hypot(F.pos.x - EX, F.pos.z - EZ) < 18;
function updatePerch(dt, inp) {
  F.yaw -= inp.x * 1.8 * dt;
  if (inp.flapPressed) takeOff();
}
function updateSleep() {
  if (F.rest >= 100 && (SP.nocturnal ? nightF > 0.7 : nightF < 0.3)) wake(SP.nocturnal ? 'Good evening! Time to hunt.' : 'Good morning! You slept well.');
  else if (F.food <= 5) wake('Your hunger woke you up.');
  else if (F.water <= 5) wake('Your thirst woke you up.');
}
function updateNeeds(dt) {
  const dh = dt * TOD.scale / HOUR, sleeping = F.mode === 'sleep', resting = F.mode !== 'fly';
  const thrift = has('stamina') ? 0.75 : 1;
  F.food = Math.max(0, F.food - dh * (sleeping ? 2 : 4) * thrift);
  F.water = Math.max(0, F.water - dh * (sleeping ? 3 : 6.5) * thrift);
  if (sleeping) F.rest = Math.min(100, F.rest + dh * 22);
  else F.rest = Math.max(0, F.rest - dh * ((nightF > 0.5) !== !!SP.nocturnal ? 7 : 4.5) * thrift);
  let heal = sleeping ? 30 : resting ? (F.moving ? 8 : 16) : 2;
  if (F.food < 20 || F.water < 20) heal *= 0.3;
  const hurt = (F.food <= 0 ? 8 : 0) + (F.water <= 0 ? 12 : 0);
  F.health = Math.min(100, F.health + dh * (heal - hurt));
  if (F.health <= 0) { collapse('You grew too weak from hunger and thirst.'); return; }
  if (resting) {
    const rate = F.mode === 'ground' ? (F.moving ? 4 : 8) : F.perchType === 'nest' ? 15 : 11;
    F.energy += rate * dt * (sleeping ? TOD.scale / 6 : 1);
  }
  F.energy = clamp(F.energy, 0, energyCap());
  if (F.exhausted && F.energy >= 25) { F.exhausted = false; if (resting) toast('Rested enough to fly again.', 'gold'); }
  warnOnce('food', F.food < 15, F.food > 30, 'You are hungry. Catch something and eat it.');
  warnOnce('water', F.water < 15, F.water > 30, 'You are thirsty. Land by the river and drink.');
  warnOnce('rest', F.rest < 12, F.rest > 30, 'You are exhausted. Sleep in a tree or your nest.');
  warnOnce('thin', F.thin && F.mode === 'fly', !F.thin, 'The air is too thin up here! Your energy is draining. Fly lower.');
}

// falcon body language for each situation
function poseFalcon(dt, inp) {
  const b = falcon, g = b.group;
  const flying = F.mode === 'fly';
  const agl = F.pos.y - surfaceAt(F.pos.x, F.pos.z);
  if (flying) {
    g.position.copy(F.pos);
    g.rotation.set(-F.pitch, F.yaw, F.roll);
    if (F.flapping) F.flapPh += dt * 13;
    const glideFlex = Math.sin(game.t * 1.7) * 0.04;
    if (F.hovering) { F.flapPh += dt * 16; animWings(b, { ph: F.flapPh, amp: 0.8, flare: 0.5 }); }
    else animWings(b, { ph: F.flapPh, amp: F.flapping ? 0.9 : 0, tuck: F.tuck, dihedral: F.flapping ? 0 : 0.06 + glideFlex, flare: F.flare });
    b.legs.visible = !!F.carry || (agl < 14 && F.speed < 22) || F.flare > 0.3;
    b.legs.rotation.x = F.carry ? 0.2 : -0.9 * F.flare;
    b.tail.scale.x = 1 + Math.max(F.flare, Math.abs(F.roll) * 0.6, F.speed < 14 ? 0.5 : 0) * 0.9 - F.tuck * 0.35;
    b.tail.rotation.z = -F.roll * 0.35; b.tail.rotation.x = -F.flare * 0.45 + inp.y * 0.12;
    let look = -inp.x * 0.4;
    if (target && !F.carry) {
      tA.subVectors(target.pos, F.pos).normalize();
      const rel = wrapAngle(Math.atan2(tA.x, tA.z) - F.yaw);
      if (Math.abs(rel) < 1.2) look = clamp(rel, -0.7, 0.7);
    }
    if (Math.abs(LOOKER.tYaw) > 0.02 || Math.abs(LOOKER.yaw) > 0.02) look = LOOKER.yaw;
    b.head.rotation.y = damp(b.head.rotation.y, look, 5, dt); b.head.rotation.x = damp(b.head.rotation.x, F.tuck * 0.2 - LOOKER.pitch * 0.8, 5, dt);
    if (F.flapping && Math.sin(F.flapPh) > 0.95 && F.flapSnd <= 0) { whoosh(0.07, 900); F.flapSnd = 0.2; }
    F.flapSnd -= dt;
  } else {
    // standing upright with wings folded along the back
    const sleeping = F.mode === 'sleep', stunned = F.stunT > 0;
    g.position.copy(F.pos);
    if (sleeping) g.position.y -= 0.15;
    g.rotation.set(-0.6, F.yaw, stunned ? 1.25 : 0);
    animWings(b, { tuck: 1, fold: 1, droop: stunned ? -0.3 : 0 });
    b.legs.visible = !sleeping; b.legs.rotation.x = 0.6;
    b.tail.scale.x = 1; b.tail.rotation.z = 0; b.tail.rotation.x = -0.25;
    let ly = 0, lx = 0.45;
    if (sleeping) { ly = 2.5; lx = 0.6; }
    else if (F.drinkT > 0) { lx = 1.3; }
    else if (!F.moving) { ly = Math.sin(game.t * 0.6) * 0.8 + Math.sin(game.t * 1.9) * 0.25; lx = 0.45 + Math.sin(game.t * 0.9) * 0.15; }
    else lx = 0.45 + Math.sin(game.t * 18) * 0.12;
    if (!sleeping && (Math.abs(LOOKER.tYaw) > 0.02 || Math.abs(LOOKER.yaw) > 0.02)) { ly = LOOKER.yaw; lx = 0.45 - LOOKER.pitch * 0.8; }
    b.head.rotation.y = damp(b.head.rotation.y, ly, 6, dt); b.head.rotation.x = damp(b.head.rotation.x, lx, 6, dt);
  }
  if (F.carry) placeCarry();
}

// menu: the falcon circles over the valley
function updateMenuFlight(dt) {
  const t = game.t * 0.12;
  F.pos.set(riverX(-60) + Math.cos(t) * 160, 130 + Math.sin(t * 2) * 12, -60 + Math.sin(t) * 160);
  F.yaw = Math.atan2(-Math.sin(t), Math.cos(t)); F.pitch = Math.cos(t * 2) * 0.05; F.roll = 0.35; F.speed = 20;
  fwdOf(F.yaw, F.pitch, F.fwd);
  falcon.group.position.copy(F.pos); falcon.group.rotation.set(-F.pitch, F.yaw, F.roll);
  const flapping = Math.sin(game.t * 0.7) > 0.5;
  F.flapPh += dt * 13;
  animWings(falcon, flapping ? { ph: F.flapPh, amp: 0.85 } : { dihedral: 0.06 });
  falcon.legs.visible = false;
}

// ---------- camera ----------
const camTarget = new V3(), camLook = new V3();
let camInit = false;
function updateCamera(dt) {
  const kmh = F.speed * 3.6;
  LOOKER.tYaw = clamp(LOOKER.tYaw, -headLimit(), headLimit());
  LOOKER.yaw = damp(LOOKER.yaw, LOOKER.tYaw, 8, dt); LOOKER.pitch = damp(LOOKER.pitch, LOOKER.tPitch, 8, dt);
  const lookY = game.state === 'play' ? LOOKER.yaw : 0, lookP = game.state === 'play' ? LOOKER.pitch : 0;
  const flying = F.mode === 'fly' || game.state === 'menu';
  if (game.cam === 'first' && game.state === 'play') {
    falcon.group.visible = false;
    if (flying) {
      camera.position.copy(F.pos).addScaledVector(F.fwd, 0.3 * SIZE); camera.position.y += 0.1 * SIZE;
      camera.quaternion.copy(falcon.group.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), Math.PI + lookY));
      camera.rotateX(lookP);
    } else {
      camera.position.copy(F.pos); camera.position.y += 0.35;
      camLook.set(F.pos.x + Math.sin(F.yaw + falcon.head.rotation.y) * 10, F.pos.y + 0.2 + lookP * 8, F.pos.z + Math.cos(F.yaw + falcon.head.rotation.y) * 10);
      camera.lookAt(camLook);
    }
  } else {
    falcon.group.visible = true;
    if (flying) {
      const back = game.state === 'menu' ? 2.5 + SIZE * 3 : 1.6 + SIZE * 2.2 + F.tuck * 0.8;
      // the camera swings round behind your bird's head as it looks to the side
      const lookDir = tB.copy(F.fwd).applyAxisAngle(tC.set(0, 1, 0), lookY);
      camTarget.copy(F.pos).addScaledVector(lookDir, -back); camTarget.y += (game.state === 'menu' ? 0.8 + SIZE * 0.8 : 0.5 + SIZE * 0.6) - lookP * back * 0.6;
      if (game.state === 'menu') camTarget.addScaledVector(tA.set(F.fwd.z, 0, -F.fwd.x), 1.5 + SIZE);
      camLook.copy(F.pos).addScaledVector(lookDir, 2 + SIZE * 3); camLook.y += lookP * (2 + SIZE * 3);
    } else {
      const orbit = F.mode === 'sleep' ? game.t * 0.15 : 0;
      const a = F.yaw + Math.PI + orbit + lookY;
      const dist = 0.55 + SIZE * (F.mode === 'ground' ? 0.9 : 1.2);
      camTarget.set(F.pos.x + Math.sin(a) * dist, F.pos.y + 0.2 + SIZE * (F.mode === 'ground' ? 0.3 : 0.5), F.pos.z + Math.cos(a) * dist);
      camLook.set(F.pos.x + Math.sin(F.yaw + lookY) * SIZE * 0.6, F.pos.y + 0.1 + lookP * SIZE, F.pos.z + Math.cos(F.yaw + lookY) * SIZE * 0.6);
    }
    if (!camInit) { camera.position.copy(camTarget); camInit = true; }
    const k = flying ? 6 : 4;
    // lead the target by the distance the smoothing would lag behind, so fast birds stay close to the camera
    if (flying && game.state === 'play') camTarget.addScaledVector(F.fwd, F.speed / k);
    camera.position.x = damp(camera.position.x, camTarget.x, k, dt);
    camera.position.y = damp(camera.position.y, camTarget.y, k, dt);
    camera.position.z = damp(camera.position.z, camTarget.z, k, dt);
    let cg = surfaceAt(camera.position.x, camera.position.z) + 0.4;
    // keep the camera above the leaves (and any neighbouring trees) when you're up in a tree
    if (!flying && F.tree) cg = Math.max(cg, F.tree.top + 0.8, ...treesNear(camera.position.x, camera.position.z).filter(t => Math.hypot(t.x - camera.position.x, t.z - camera.position.z) < t.r).map(t => t.top + 0.5));
    if (!flying && atNest() && NESTS[spId].camMin) cg = Math.max(cg, NESTS[spId].camMin);
    if (camera.position.y < cg) camera.position.y = cg;
    camera.lookAt(camLook);
    if (flying) camera.rotateZ(-F.roll * 0.28);
    if (kmh > 240 && game.state === 'play' && flying) { camera.position.x += (Math.random() - .5) * 0.06; camera.position.y += (Math.random() - .5) * 0.06; }
  }
  const fov = flying ? 62 + clamp(F.speed / 110, 0, 1) * 26 : 60;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = damp(camera.fov, fov, 3, dt); camera.updateProjectionMatrix(); }
  sky.position.copy(camera.position); stars.position.copy(camera.position);
  sun.position.copy(F.pos).addScaledVector(LIGHT_DIR, 300); sun.target.position.copy(F.pos);
}

// ---------- HUD ----------
const mini = $('mini'), mctx = mini.getContext('2d');
const MAP_R = 1150;
const mapImg = document.createElement('canvas'); mapImg.width = mapImg.height = 150;
{
  const ctx = mapImg.getContext('2d'), img = ctx.createImageData(150, 150), c = new THREE.Color();
  for (let j = 0; j < 150; j++) for (let i = 0; i < 150; i++) {
    const x = (i / 149 * 2 - 1) * MAP_R, z = (j / 149 * 2 - 1) * MAP_R, h = heightAt(x, z);
    terrainColor(x, z, h, slopeAt(x, z), c); if (h < 0) c.setHex(0x3d9cc6);
    c.convertLinearToSRGB(); img.data.set([c.r * 255, c.g * 255, c.b * 255, 255], (j * 150 + i) * 4);
  }
  ctx.putImageData(img, 0, 0);
}
const toMap = (x, z) => [(x / MAP_R * .5 + .5) * 150, (z / MAP_R * .5 + .5) * 150];
function drawMini() {
  mctx.drawImage(mapImg, 0, 0);
  mctx.fillStyle = `rgba(8,14,30,${0.2 + nightF * 0.45})`; mctx.fillRect(0, 0, 150, 150);
  mctx.setLineDash([2, 2]); mctx.strokeStyle = 'rgba(255,234,176,.9)';
  for (const t of THERMALS) { const [x, y] = toMap(t.x, t.z); mctx.beginPath(); mctx.arc(x, y, 4, 0, 7); mctx.stroke(); }
  mctx.setLineDash([]);
  for (const l of LANDMARKS) {
    const [x, y] = toMap(l.x, l.z); mctx.fillStyle = prog.found.includes(l.id) ? '#f0c02a' : 'rgba(255,255,255,.85)';
    mctx.beginPath(); mctx.moveTo(x, y - 4); mctx.lineTo(x + 3.5, y + 2.5); mctx.lineTo(x - 3.5, y + 2.5); mctx.closePath(); mctx.fill();
  }
  const dotCol = { pigeon: '#ffffff', teal: '#5fe0b0', crow: '#1b1b1b', eel: '#c9b98a', finch: '#f0a088', hare: '#c08a50', fish: '#9fd0ec', carrion: '#d04030', shrew: '#e8d0a0', grouse: '#b07050', monkey: '#c08a50', sloth: '#9a9a6a', bat: '#3a2a24' };
  for (const p of prey) {
    if (!(catchable(p) || p.state === 'swim') || !dotCol[p.type]) continue;
    const diet = SP.diet[p.type] ?? 1;
    if (p.type === 'shrew' && !F.listening) continue;
    if ((PREY[p.type].critter || p.type === 'finch') && diet < 1 && F.scanT <= 0) continue;
    const [x, y] = toMap(p.pos.x, p.pos.z); mctx.fillStyle = dotCol[p.type]; mctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  mctx.fillStyle = '#ef6a55';
  if (eagle.b.group.visible) { const [x, y] = toMap(eagle.pos.x, eagle.pos.z); mctx.fillRect(x - 2.5, y - 2.5, 5, 5); }
  const [ex, ey] = toMap(EX, EZ); mctx.fillStyle = '#f0c02a'; mctx.save(); mctx.translate(ex, ey); mctx.rotate(Math.PI / 4); mctx.fillRect(-4, -4, 8, 8); mctx.restore();
  const [fx, fy] = toMap(F.pos.x, F.pos.z);
  mctx.save(); mctx.translate(fx, fy); mctx.rotate(-F.yaw + Math.PI);
  mctx.fillStyle = '#ffffff'; mctx.strokeStyle = '#000'; mctx.lineWidth = 1;
  mctx.beginPath(); mctx.moveTo(0, -7); mctx.lineTo(5, 5); mctx.lineTo(0, 2); mctx.lineTo(-5, 5); mctx.closePath(); mctx.fill(); mctx.stroke(); mctx.restore();
}
function project(pos) { pv.copy(pos).project(camera); return { x: (pv.x * .5 + .5) * innerWidth, y: (-pv.y * .5 + .5) * innerHeight, behind: pv.z > 1, nx: pv.x, ny: pv.y }; }
function placeMarker(el, pos) {
  pv.copy(pos).project(camera);
  let x = pv.x, y = pv.y; const behind = pv.z > 1;
  if (behind) { x = -x; y = -y; }
  const m = 0.86; let edge = false;
  if (behind || Math.abs(x) > m || Math.abs(y) > m) {
    const mx = Math.max(Math.abs(x), Math.abs(y));
    if (mx < 1e-3) { x = 0; y = -m; } else { x *= m / mx; y *= m / mx; }
    edge = true;
  }
  el.style.transform = `translate(${(x * .5 + .5) * innerWidth}px,${(-y * .5 + .5) * innerHeight}px)`;
  el.classList.toggle('edge', edge);
}
let frame = 0, lastTags = '', lastPrompt = '', lastAct = '';
const setBar = (id, v, max = 100) => { const el = $(id); el.querySelector('i').style.width = clamp(v / max * 100, 0, 100) + '%'; el.classList.toggle('low', v / max < 0.2); };
function updateHUD() {
  frame++;
  const flying = F.mode === 'fly';
  const kmh = flying ? Math.round(F.speed * 3.6) : 0, g = surfaceAt(F.pos.x, F.pos.z);
  const gk = flying ? Math.round((F.groundSpeed ?? F.speed) * 3.6) : 0;
  $('spd').textContent = Math.round(settings.mph ? gk * 0.621 : gk); $('spdUnit').textContent = spdUnit(); $('alt').textContent = Math.max(0, Math.round(F.pos.y - g - (flying ? 0 : LEG)));
  setBar('nHealth', F.health); setBar('nEnergy', F.energy, maxEnergy()); setBar('nFood', F.food); setBar('nWater', F.water); setBar('nRest', F.rest);
  $('clockTime').textContent = `Day ${TOD.day} · ${fmtTime(TOD.hour)}`; $('clockPart').textContent = partOfDay(TOD.hour);
  $('gauges').classList.toggle('stoop', flying && F.tuck > 0.5);
  windAt(F.pos.y, F.wind);
  const wk = Math.round(F.wind.length() * 3.6), wrel = wrapAngle(Math.atan2(F.wind.x, F.wind.z) - F.yaw);
  $('windSpd').textContent = Math.round(settings.mph ? wk * 0.621 : wk); $('windUnit').textContent = 'wind ' + spdUnit(); $('windArrow').style.transform = `rotate(${-wrel}rad)`;
  if (wk > 28 && flying) showFactOnce('wind');
  $('vignette').style.opacity = flying ? clamp((kmh - 150) / 200, 0, 0.9) : 0;
  hurtLevel = Math.max(hurtLevel * 0.95, F.health < 30 ? 0.35 + Math.sin(game.t * 4) * 0.1 : 0);
  $('hurt').style.opacity = hurtLevel;

  // status tags
  const tags = [];
  if (flying && F.tuck > 0.5) tags.push(['STOOP', 'gold']);
  if (flying && F.thin) tags.push(['THIN AIR', 'bad']);
  if (F.inThermal && flying) tags.push(['THERMAL', 'good']);
  if (flying && F.braking) tags.push(['BRAKING', 'gold']);
  if (F.hovering) tags.push(['HOVERING', 'gold']);
  if (F.listening) tags.push(['LISTENING', 'gold']);
  if (F.scanT > 0) tags.push([SP.ability === 'sight' ? 'KEEN SIGHT' : 'SCANNING', 'gold']);
  if (F.inWoods || F.weaveT > 0) tags.push(['WEAVING THROUGH TREES', 'good']);
  if (F.exhausted) tags.push(['EXHAUSTED', 'bad']);
  if (F.health < 40) tags.push(['INJURED', 'bad']);
  if (F.stunT > 0) tags.push(['STUNNED', 'bad']);
  if (F.hidden) tags.push(['HIDDEN', 'good']);
  if (atNest()) tags.push(['SAFE AT NEST', 'good']);
  const tagKey = tags.map(t => t[0]).join();
  if (tagKey !== lastTags) { lastTags = tagKey; $('tags').innerHTML = tags.map(([t, c]) => `<span class="tag ${c}">${t}</span>`).join(''); }

  // context prompt
  let pr = '';
  const act = actionLabel();
  if (F.mode === 'ground') pr = F.stunT > 0 ? 'Stunned…' : `Walk slowly with <b>${isTouch ? 'the stick' : 'W A S D'}</b>. <b>${KEY.fly}</b> to take off.` + (act === 'DRINK' ? ` <b>${KEY.act}</b> to drink.` : act === 'POUNCE' ? ` <b>${KEY.act}</b> to pounce on the shrew!` : '');
  else if (F.mode === 'perch') pr = `<b>${KEY.fly}</b> to take off. <b>${KEY.sleep}</b> to sleep.`;
  if (F.carry && F.mode !== 'sleep') pr = `Carrying a <b>${PREY[F.carry.type].name.toLowerCase()}</b>. Take it to your nest, or <b>${KEY.act}</b> to eat it.` + (flying ? '' : ` <b>${KEY.fly}</b> to take off.`);
  if (pr !== lastPrompt) { lastPrompt = pr; $('prompt').innerHTML = pr; $('prompt').hidden = !pr; }
  if (act !== lastAct) { lastAct = act; $('bAct').textContent = act; $('bAct').hidden = !act; }
  const fl = flying ? 'FLAP' : 'TAKE OFF';
  if ($('bFlap').textContent !== fl) $('bFlap').textContent = fl;
  $('bDive').hidden = !flying; $('bBrake').hidden = !flying;

  // flight path marker and horizon line, so you can see where the nose is pointing
  const fpm = $('fpm'), hz = $('horizon');
  fpm.hidden = !flying; hz.hidden = !flying || !settings.horizon;
  if (flying) {
    const p = project(tA.copy(F.pos).addScaledVector(F.fwd, 80));
    if (!p.behind) fpm.style.transform = `translate(${p.x}px,${p.y}px)`;
    const deg = Math.round(F.pitch * 57.3);
    fpm.querySelector('b').textContent = (deg > 0 ? '+' : '') + deg + '°';
    fpm.classList.toggle('down', deg < -5); fpm.classList.toggle('up', deg > 5);
    const yawC = Math.atan2(F.fwd.x, F.fwd.z);
    const h0 = project(tA.set(camera.position.x + Math.sin(yawC) * 1500, camera.position.y, camera.position.z + Math.cos(yawC) * 1500));
    const h1 = project(tB.set(camera.position.x + Math.sin(yawC) * 1500 + Math.cos(yawC) * 400, camera.position.y, camera.position.z + Math.cos(yawC) * 1500 - Math.sin(yawC) * 400));
    if (!h0.behind && !h1.behind && settings.horizon) { hz.hidden = false; hz.style.transform = `translate(${h0.x}px,${h0.y}px) rotate(${Math.atan2(h1.y - h0.y, h1.x - h0.x)}rad)`; }
    else hz.hidden = true;
  }

  // prey marker with strike odds when close
  const range = (has('keen') ? 450 : 250) * (SP.nocturnal ? 1 + nightF * 0.2 : 1 - nightF * 0.5);
  target = null; let best = Infinity;
  if (!F.carry && flying) for (const p of prey) {
    const heard = F.listening && p.type === 'shrew' && p.state === 'hidden';
    if (!catchable(p) && p.state !== 'swim' && !heard) continue;
    const diet = SP.diet[p.type] ?? 1;
    if (F.scanT > 0 && diet < 1) continue;
    if (F.listening && p.type !== 'shrew') continue;
    tA.subVectors(p.pos, F.pos); const d = tA.length();
    if (d > (PREY[p.type].range || range) * (F.scanT > 0 ? 3 : 1) * (F.listening ? 0.8 : 1)) continue;
    const dot = tA.dot(F.fwd) / d; if (dot < (F.scanT > 0 || F.listening ? -1 : 0.35)) continue;
    const score = d * (1.6 - dot) / Math.max(diet, 0.15); if (score < best) { best = score; target = p; }
  }
  const mk = $('mkPrey');
  mk.hidden = !target;
  if (target) {
    placeMarker(mk, target.pos);
    const d = Math.round(target.pos.distanceTo(F.pos));
    let label = `${PREY[target.type].name} · ${d} m`;
    if (target.state === 'hidden') label = `${PREY[target.type].name} · rustling in the grass · ${d} m`;
    else if (target.state === 'swim') label = `${PREY[target.type].name} · on the ${target.flock.restOn === 'ground' ? 'ground' : 'water'} · ${d} m`;
    else if (d < 70) label += ` · ${Math.round(strikeOdds(target).chance * 100)}% strike`;
    if (target.dodgeT > 0) label = `${PREY[target.type].name} · escaping`;
    mk.firstChild.textContent = label;
    mk.classList.toggle('close', d < 70);
  }
  const nk = $('mkNest'); nk.hidden = !F.carry && !(F.rest < 30 || nightF > 0.5) || atNest();
  if (!nk.hidden) { placeMarker(nk, tB.set(EX, EY + 4, EZ)); nk.firstChild.textContent = 'Nest · ' + Math.round(F.pos.distanceTo(EYRIE)) + ' m'; }
  const tk = $('mkTherm'); const showT = flying && (prog.mission === 0 || (F.energy < 30 && !F.exhausted));
  tk.hidden = !showT || F.inThermal;
  if (!tk.hidden) {
    let nt = THERMALS[0], nd = Infinity; for (const t of THERMALS) { const d = Math.hypot(F.pos.x - t.x, F.pos.z - t.z); if (d < nd) { nd = d; nt = t; } }
    const ty = Math.max(F.pos.y, nt.base + 20), tl = thermalLean(nt, ty);
    placeMarker(tk, tB.set(tl.x, ty, tl.z)); tk.firstChild.textContent = 'Thermal · ' + Math.round(nd) + ' m';
  }
  // threat markers
  const threats = [];
  if (eagle.b.group.visible) { const d = eagle.pos.distanceTo(F.pos); if (d < 450) threats.push({ pos: eagle.pos, label: (eagle.state === 'hunt' ? 'EAGLE HUNTING · ' : THREAT.name[0].toUpperCase() + THREAT.name.slice(1) + ' · ') + Math.round(d) + ' m' }); }
  for (const f of foxes) { const d = f.pos.distanceTo(F.pos); if ((f.state === 'hunt' || (F.mode === 'ground' && d < 120))) threats.push({ pos: tC.copy(f.pos).setY(f.pos.y + 1), label: (f.state === 'hunt' ? PRED.name.toUpperCase() + ' CHARGING · ' : PRED.name[0].toUpperCase() + PRED.name.slice(1) + ' · ') + Math.round(d) + ' m' }); }
  for (let i = 0; i < 3; i++) {
    const el = $('mkT' + i), t = threats[i];
    el.hidden = !t;
    if (t) { placeMarker(el, t.pos); el.firstChild.textContent = t.label; }
  }
  if (frame % 3 === 0) drawMini();
}

function updateChicks(dt) {
  chickHop = Math.max(0, chickHop - dt);
  chicks.forEach(c => {
    c.ph += dt * (chickHop > 0 ? 14 : 3);
    c.hd.position.y = 0.5 + Math.sin(c.ph) * (chickHop > 0 ? 0.12 : 0.03) + (chickHop > 0 ? 0.1 : 0);
    c.hd.rotation.x = chickHop > 0 ? -0.6 : Math.sin(c.ph * 0.5) * 0.15;
  });
}

// ---------- landmarks and challenges ----------
const LANDMARKS = (() => {
  const L = [], add = (name, x, z, fact, y) => L.push({ id: name.toLowerCase().replace(/\W+/g, '-'), name, x, z, y: y ?? surfaceAt(x, z), fact });
  let px = 0, pz = 0, ph = -1, lx = 0, lz = 0, lh = 99;
  for (let x = -1000; x < 1000; x += 20) for (let z = -1000; z < 1000; z += 20) {
    if (Math.hypot(x, z) > 1000) continue;
    const h = heightAt(x, z);
    if (h > ph && h < THIN_AIR - 20) { ph = h; px = x; pz = z; }
    if (h < lh && Math.abs(x - riverX(z)) > 150) { lh = h; lx = x; lz = z; }
  }
  if (BIOME === 'valley') {
    add('Village church', VX, VZ, 'lmChurch'); add('Old barn', NESTS.owl.x, NESTS.owl.z, 'oBarn'); add('Western cliffs', NESTS.peregrine.x, NESTS.peregrine.z, 'ddt');
    add('Eagle crag', NESTS.eagle.x, NESTS.eagle.z, 'eNest'); add('Osprey tree', NESTS.osprey.x, NESTS.osprey.z, 'pBack'); add('Highest summit', px, pz, 'lmSummit');
  } else if (BIOME === 'rainforest') {
    add('Jungle temple', VX, VZ, 'lmTemple'); add('Great waterfall', waterfall.x, waterfall.z, 'lmFalls', (waterfall.top + waterfall.bottom) / 2); add('Tepui summit', TEPUI.x, TEPUI.z, 'lmTepui');
    add('Oxbow lake', riverX(-650) + 190, -650, 'lmOxbow'); add('Giant kapok', NESTS.harpy.x, NESTS.harpy.z, 'lmKapok', NESTS.harpy.y); add('Highest summit', px, pz, 'lmSummit');
  } else {
    add('Research hut', VX, VZ, 'lmHut'); add('Inukshuk', 320, -520, 'lmInuk'); add('Gyrfalcon crag', NESTS.gyr.x, NESTS.gyr.z, 'gyNest');
    add('Snowy owl hill', NESTS.snowyowl.x, NESTS.snowyowl.z, 'soNest'); add('Frozen lake', lx, lz, 'lmLake', 0); add('Glacier top', px, pz, 'lmGlacier');
  }
  return L;
})();
function checkLandmarks() {
  for (const l of LANDMARKS) {
    if (prog.found.includes(l.id) || Math.hypot(F.pos.x - l.x, F.pos.z - l.z) > 70 || Math.abs(F.pos.y - l.y) > 120) continue;
    prog.found.push(l.id);
    if (Math.hypot(l.x - EX, l.z - EZ) < 100) continue;   // your own home counts, but it is no surprise
    toast(`Landmark discovered: ${l.name}! +40 XP`, 'gold', 3500); sfx.quest(); gainXP(40);
    if (FACTS[l.fact]) showFact(l.fact, l.name);
  }
}
const preyKinds = () => Object.keys(PREY).filter(k => prey.some(p => p.type === k));
const kindsCaught = s => preyKinds().filter(k => (s[k] || 0) > 0).length;
const totalCaught = s => preyKinds().reduce((a, k) => a + (s[k] || 0), 0);
const CHALLENGES = [
  { id: 'explore', name: 'Explorer', desc: () => `Discover all ${LANDMARKS.length} landmarks (white triangles on the map). Found ${prog.found.length}.`, done: () => LANDMARKS.every(l => prog.found.includes(l.id)) },
  { id: 'variety', name: 'Varied diet', desc: s => `Catch 5 different kinds of animal. So far: ${kindsCaught(s)}.`, done: s => kindsCaught(s) >= 5 },
  { id: 'hunter', name: 'Top predator', desc: s => `Catch 25 animals. So far: ${totalCaught(s)}.`, done: s => totalCaught(s) >= 25 },
  { id: 'distance', name: 'Long haul', desc: s => `Fly 15 km. So far: ${(s.distance / 1000).toFixed(1)} km.`, done: s => s.distance >= 15000 },
  { id: 'parent', name: 'Devoted parent', desc: s => `Feed your chicks 10 times. So far: ${s.fed}.`, done: s => s.fed >= 10 },
  { id: 'survivor', name: 'Survivor', desc: () => `Survive until day 3. Now: day ${TOD.day}.`, done: () => TOD.day >= 3 },
];
let chalT = 0;
function checkChallenges(dt) {
  chalT += dt; if (chalT < 1) return; chalT = 0;
  for (const c of CHALLENGES) if (!prog.chal.includes(c.id) && c.done(stats())) { prog.chal.push(c.id); toast(`Challenge complete: ${c.name}! +100 XP`, 'big', 3500); sfx.level(); gainXP(100); }
}
// new worlds open up as you level up, with any bird
const UNLOCK_KEY = 'talon-unlocks', PENDING_KEY = 'talon-pending';
const bestLevel = () => Math.max(1, (store.get(UNLOCK_KEY) || {}).level || 0);
function noteLevel(n, loud) {
  const before = bestLevel(); if (n <= before) return;
  store.set(UNLOCK_KEY, { level: n });
  if (loud) for (const w of Object.values(WORLDS)) if (w.unlock > before && w.unlock <= n) setTimeout(() => toast(`New world unlocked: ${w.name}! Choose it on the title screen.`, 'big', 5000), 2500);
}

// ---------- saving and loading ----------
function snapshot() {
  return {
    v: 2, savedAt: Date.now(), world: BIOME, species: spId, xp: prog.xp, mission: prog.mission, stats: { ...prog.stats }, done: prog.done, facts: [...seenFacts], found: [...prog.found], chal: [...prog.chal],
    hour: TOD.hour, day: TOD.day,
    bird: { x: F.pos.x, y: F.pos.y, z: F.pos.z, yaw: F.yaw, mode: F.mode === 'sleep' ? 'perch' : F.mode, perchType: F.perchType,
      tree: F.tree ? TREES.indexOf(F.tree) : -1, health: F.health, energy: F.energy, food: F.food, water: F.water, rest: F.rest },
  };
}
function applySnapshot(s) {
  if (!s || s.v !== 2) return false;
  const w = WORLDS[s.world] ? s.world : 'valley';
  if (w !== BIOME) { store.set(PENDING_KEY, s); game.travelling = true; switchWorld(w); return true; }
  if (F.carry) dropCarry();
  setSpecies(s.species || 'peregrine');
  prog = { xp: s.xp || 0, mission: s.mission || 0, stats: { ...blankStats(), ...(s.stats || {}) }, done: !!s.done, found: [...(s.found || [])], chal: [...(s.chal || [])] };
  noteLevel(levelIdx() + 1, false);
  seenFacts.clear(); (s.facts || []).forEach(k => seenFacts.add(k));
  game.prevLevel = levelIdx(); applyGrowth();
  TOD.hour = s.hour ?? 7; TOD.day = s.day ?? 1; TOD.scale = 1;
  const b = s.bird || {};
  Object.assign(F, { health: b.health ?? 100, energy: b.energy ?? 100, food: b.food ?? 75, water: b.water ?? 75, rest: b.rest ?? 85,
    exhausted: false, stunT: 0, tuck: 0, flare: 0, roll: 0, pitch: 0, yaw: b.yaw ?? Math.PI / 2, drinkT: 0,
    scanT: 0, skillCool: 0, hovering: false, listening: false, inWoods: false, sink: 0, weaveT: 0, weaving: false });
  if (b.mode === 'perch' && b.perchType === 'tree' && TREES[b.tree]) perchAt('tree', true, TREES[b.tree]);
  else if (b.mode === 'ground') { F.pos.set(b.x, 0, b.z); landGround(false); stats().landings--; }
  else if (b.mode === 'fly') { F.mode = 'fly'; F.pos.set(b.x, b.y, b.z); F.speed = 20; }
  else perchAt('nest', true);
  if (!(F.mode === 'perch' && F.perchType === 'nest')) F.yaw = b.yaw ?? F.yaw;
  F.prev.copy(F.pos);
  $('sleepScreen').hidden = true;
  eagle.state = 'patrol'; eagle.cool = 30;
  foxes.forEach(f => { f.state = 'wander'; f.cool = 10; });
  camInit = false;
  return true;
}
function persist() { if (game.state === 'play') store.set(AUTO_KEY, snapshot()); }
function newGameState(species) {
  applySnapshot({ v: 2, world: BIOME, species, xp: 0, mission: 0, stats: blankStats(), hour: SPECIES[species].start, day: 1, bird: { mode: 'perch', perchType: 'nest', yaw: Math.PI / 2, health: 100, energy: 100, food: 75, water: 75, rest: 85 } });
}
const encodeSave = s => 'TALON2:' + btoa(unescape(encodeURIComponent(JSON.stringify(s))));
// Be forgiving: messaging apps add line breaks, spaces, quote marks or words around a pasted code.
// Find the code part (it always starts "eyJ" once the TALON2: label is removed) and ignore everything else.
function decodeSave(code) {
  const text = String(code || '').replace(/\s+/g, '');
  const m = text.match(/(?:TALON2:)?(eyJ[A-Za-z0-9+/_-]+=*)/);
  if (!m) return null;
  const raw = m[1].replace(/-/g, '+').replace(/_/g, '/');
  // if words were typed straight after the code, trim from the end until it reads as a save
  for (let end = raw.length; end > Math.max(8, raw.length - 80); end--) {
    try { const s = JSON.parse(decodeURIComponent(escape(atob(raw.slice(0, end))))); if (s && s.v) return s; } catch (e) { }
  }
  return null;
}
function describeSave(s) {
  let l = 0; LEVELS.forEach((L, i) => { if ((s.xp || 0) >= L.xp) l = i; });
  const when = new Date(s.savedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const sp = SPECIES[s.species] ? s.species : 'peregrine', n = MISSION_SETS[sp].length;
  return { title: `${SPECIES[sp].name} · Level ${l + 1} · Day ${s.day} ${fmtTime(s.hour)}`, sub: `${WORLDS[s.world || 'valley'].name} · Quest ${Math.min((s.mission || 0) + 1, n)} of ${n} · saved ${when}` };
}
const SLOTS = 8;
function renderSlots(el, inPause) {
  el.innerHTML = [...Array(SLOTS)].map((_, i) => i + 1).map(n => {
    const s = store.get(SLOT_KEY(n)), d = s && describeSave(s);
    return `<div class="slot panel"><div class="info"><b>Slot ${n}${d ? ': ' + d.title : ''}</b>${d ? d.sub : 'Empty'}</div>
      ${inPause ? `<button class="ghost" data-save="${n}">Save here</button>` : ''}
      <button class="ghost" data-load="${n}" ${s ? '' : 'disabled'}>Load</button></div>`;
  }).join('');
}
function onSlotClick(e, inPause) {
  const sv = e.target.closest('[data-save]'), ld = e.target.closest('[data-load]');
  if (sv) {
    const n = +sv.dataset.save;
    if (store.get(SLOT_KEY(n)) && !sv.dataset.armed) { sv.dataset.armed = '1'; sv.textContent = 'Tap again to overwrite'; sv.classList.add('warn'); return; }
    const ok = store.set(SLOT_KEY(n), snapshot());
    renderSlots(e.currentTarget, inPause);
    flashNote(ok ? `Saved to slot ${n}.` : 'Could not save. This browser may be blocking storage.');
  }
  if (ld) {
    const s = store.get(SLOT_KEY(+ld.dataset.load));
    if (!s) return;
    if (inPause) { applySnapshot(s); togglePause(false); afterLoad(`Loaded slot ${ld.dataset.load}.`); }
    else { applySnapshot(s); startPlay(); afterLoad(`Loaded slot ${ld.dataset.load}.`); }
  }
}
function flashNote(msg) { const b = $('resumeBtn'); const old = 'Resume'; b.textContent = msg; setTimeout(() => { b.textContent = old; }, 1800); }
function afterLoad(msg) { renderMission(); renderStatus(); toast(msg, 'gold'); persist(); }
$('pauseSlots').addEventListener('click', e => onSlotClick(e, true));
$('menuSlots').addEventListener('click', e => onSlotClick(e, false));
$('copyCodeBtn').addEventListener('click', () => {
  const code = encodeSave(snapshot()), box = $('pauseCode');
  box.value = code;
  const fallback = () => { box.focus(); box.select(); $('copyCodeBtn').textContent = 'Select and copy the code below'; };
  try { navigator.clipboard.writeText(code).then(() => { $('copyCodeBtn').textContent = 'Copied!'; }, fallback); } catch (e) { fallback(); }
  setTimeout(() => { $('copyCodeBtn').textContent = 'Copy save code'; }, 2500);
});
function loadCode(box, inPause) {
  const msg = $(inPause ? 'pauseCodeMsg' : 'menuCodeMsg');
  if (!box.value.trim()) { msg.textContent = 'Paste a save code into the box first.'; msg.className = 'codemsg bad'; return; }
  const s = decodeSave(box.value);
  if (!s || s.v !== 2) { msg.textContent = 'That code didn\'t work. It may have been cut short: copy the whole code again (it starts with TALON2:) and paste it in.'; msg.className = 'codemsg bad'; return; }
  msg.textContent = ''; msg.className = 'codemsg';
  applySnapshot(s);
  if (inPause) togglePause(false); else startPlay();
  afterLoad('Loaded your save code.');
}
$('pauseCodeBtn').addEventListener('click', () => loadCode($('pauseCode'), true));
$('menuCodeBtn').addEventListener('click', () => loadCode($('menuCode'), false));

// ---------- menus ----------
const BIRDS = [
  { id: 'peregrine', name: 'Peregrine Falcon', hab: 'Home: an eyrie on the western cliffs', blurb: 'The fastest animal alive. Climb high, fold your wings and stoop onto birds in mid-air.', skill: 'Stoop (Shift / DIVE)', s: [5, 3, 2] },
  { id: 'eagle', name: 'Golden Eagle', hab: 'Home: a crag high in the mountains', blurb: 'Huge and powerful. Soar on thermals and hunt mountain hares on the moors.', skill: 'Keen sight: spot hares from far away', s: [3, 5, 2] },
  { id: 'owl', name: 'Barn Owl', hab: 'Home: an old barn in the fields', blurb: 'Hunts at night. Silent wings, and ears so good it can find shrews hidden in the grass.', skill: 'Listen: hear hidden prey', s: [2, 2, 5] },
  { id: 'osprey', name: 'Osprey', hab: 'Home: a dead tree by the river', blurb: 'The fish hawk. Hover over the river, then plunge feet-first to grab a trout.', skill: 'Hover: hang in one spot', s: [3, 4, 2] },
  { id: 'kite', name: 'Red Kite', hab: 'Home: a big oak in the woods', blurb: 'The best glider in the valley. A scavenger that sails for ages, looking for an easy meal.', skill: 'Scan: find food to scavenge', s: [3, 2, 3] },
  { id: 'hawk', name: 'Sparrowhawk', hab: 'Home: a tree in the woods', blurb: 'An ambush expert. Weaves between trees at speed to surprise small birds.', skill: 'Burst: a sudden sprint', s: [4, 2, 4] },
  { id: 'harpy', name: 'Harpy Eagle', hab: 'Home: on top of a giant kapok tree', blurb: 'One of the most powerful eagles on Earth. Twist through the canopy and snatch monkeys and sloths.', skill: 'Keen sight: spot animals in the treetops', s: [2, 5, 3] },
  { id: 'batfalcon', name: 'Bat Falcon', hab: 'Home: a dead tree by the river', blurb: 'A tiny, lightning-fast falcon. Chase parakeets by day and bats at dusk.', skill: 'Stoop (Shift / DIVE)', s: [5, 2, 3] },
  { id: 'snowyowl', name: 'Snowy Owl', hab: 'Home: a mound on the open tundra', blurb: 'A big white owl that hunts by day. Listen for lemmings and catch ptarmigan.', skill: 'Listen: hear hidden prey', s: [2, 3, 5] },
  { id: 'gyr', name: 'Gyrfalcon', hab: 'Home: a ledge on the northern crag', blurb: 'The biggest falcon in the world. Chase ptarmigan and ducks low over the tundra.', skill: 'Stoop (Shift / DIVE)', s: [5, 4, 2] },
];
BIRDS.forEach(b => { b.world = SPECIES[b.id].world; });
let chosen = BIRDS.find(b => b.world === BIOME).id;
function renderWorlds() {
  const best = bestLevel();
  $('worlds').innerHTML = Object.entries(WORLDS).map(([id, w]) => {
    const here = id === BIOME, open = here || best >= w.unlock;
    return `<button class="card world ${here ? 'sel' : ''} ${open ? '' : 'locked'}" data-world="${id}" ${open ? '' : 'disabled'}>
      <span class="lock">${here ? 'You are here' : open ? 'Tap to travel here' : 'Locked: reach level ' + w.unlock}</span>
      <h3>${w.name}</h3><p class="blurb">${w.blurb}</p><p class="hab">Birds: ${BIRDS.filter(b => b.world === id).map(b => b.name).join(', ')}</p></button>`;
  }).join('');
}
$('worlds').addEventListener('click', e => {
  const c = e.target.closest('[data-world]'); if (!c || c.disabled || c.dataset.world === BIOME) return;
  c.querySelector('.lock').textContent = 'Travelling...'; switchWorld(c.dataset.world);
});
const pips = n => '<span class="pips">' + [1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'f' : ''}"></i>`).join('') + '</span>';
function renderCards() {
  $('cards').innerHTML = BIRDS.filter(b => b.world === BIOME).map(b => `
  <button class="card ${b.id === chosen ? 'sel' : ''}" data-id="${b.id}" aria-pressed="${b.id === chosen}">
    <span class="lock">${b.id === chosen ? 'Selected' : 'Tap to choose'}</span>
    <h3>${b.name}</h3><p class="hab">${b.hab}</p><p class="blurb">${b.blurb}</p><p class="hab">Skill: ${b.skill}</p>
    <span class="stats"><span>Speed</span>${pips(b.s[0])}<span>Power</span>${pips(b.s[1])}<span>Stealth</span>${pips(b.s[2])}</span>
  </button>`).join('');
  $('newBtn').textContent = 'New game as ' + SPECIES[chosen].name; delete $('newBtn').dataset.armed;
}
$('cards').addEventListener('click', e => { const c = e.target.closest('.card'); if (!c) return; chosen = c.dataset.id; renderCards(); });
const HOWTO = isTouch
  ? [['SKILL', 'Use your bird\'s special skill'], ['Left thumb', 'Steer. Push up to climb, pull down to dive. Walk on the ground'], ['FLAP', 'Flap (uses energy), or take off'], ['DIVE', 'Fold your wings and stoop'], ['BRAKE', 'Spread your wings and tail to slow down for landing'], ['ACT', 'Eat, drink, sleep, or pounce on a shrew'], ['VIEW', 'Switch camera'], ['Landing', 'Hold BRAKE until below 60 km/h, then touch down gently']]
  : [['Q', 'Use your bird\'s special skill'], ['A D', 'Turn left and right'], ['W S', 'Climb (nose up) and dive (nose down)'], ['Space', 'Flap (uses energy), or take off'], ['Shift', 'Fold your wings and stoop'], ['B', 'Brake: spread your wings and tail to slow down'], ['E', 'Eat, drink, sleep, or pounce on a shrew'], ['Z', 'Sleep when perched'], ['V', 'Switch camera'], ['Esc', 'Pause, save and load'], ['Landing', 'Hold B until below 60 km/h, then touch down gently']];
const howtoHTML = HOWTO.map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`).join('') + (isTouch ? '' : '<div><kbd>Gamepad</kbd><span>Supported too</span></div>');
$('howto').innerHTML = howtoHTML; $('howto2').innerHTML = howtoHTML;

function renderPause() {
  const s = stats();
  const next = LEVELS[levelIdx() + 1];
  $('statgrid').innerHTML = [['Level', `${levelIdx() + 1} · ${LEVELS[levelIdx()].name}`], ['XP', prog.xp + (next ? ` (level ${levelIdx() + 2} at ${next.xp})` : '')], ['Wingspan', `${wingspanText()} (adult ${falcon.span.toFixed(2)} m)`], ['World', WORLDS[BIOME].name],
    ['Distance flown', (s.distance / 1000).toFixed(1) + ' km'], ['Missed strikes', s.misses], ['Stoop strikes', s.stoops], ['Chicks fed', s.fed], ['Top speed', spd(s.topSpeed)]]
    .map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('');
  $('journal').innerHTML = preyKinds().map(k => `<span>${PREY[k].name} <b>${s[k] || 0}</b></span>`).join('');
  $('landmarks').innerHTML = LANDMARKS.map(l => `<span>${prog.found.includes(l.id) ? '<b>' + l.name + '</b>' : '??? (not found yet)'}</span>`).join('');
  $('challenges').innerHTML = CHALLENGES.map(c => {
    const got = prog.chal.includes(c.id);
    return `<div class="skill ${got ? 'got' : ''}"><small>${got ? 'Complete' : '+100 XP'}</small><b>${c.name}</b><span>${c.desc(s)}</span></div>`;
  }).join('');
  $('skills').innerHTML = LEVELS.filter(L => L.skill).map(L => {
    const got = has(L.skill), S = SKILLS[L.skill];
    return `<div class="skill ${got ? 'got' : ''}"><small>${got ? 'Learned' : 'Unlocks at level ' + (LEVELS.indexOf(L) + 1)}</small><b>${S.name}</b><span>${S.desc}</span></div>`;
  }).join('');
  const tog = (id, label, on) => { $(id).textContent = `${label}: ${on ? 'on' : 'off'}`; $(id).classList.toggle('on', on); };
  tog('invertBtn', 'Invert up/down', settings.invert); tog('levelBtn', 'Auto-level', settings.autoLevel); tog('soundBtn', 'Sound', !settings.muted); $('unitsBtn').textContent = 'Speed: ' + spdUnit(); tog('horizonBtn', 'Horizon line', settings.horizon);
  renderSlots($('pauseSlots'), true);
  $('tipsList').innerHTML = Object.values(TIPS).map(t => `<div class="skill"><span>${t}</span></div>`).join('');
}
function togglePause(force) {
  if (game.state !== 'play') return;
  game.paused = force ?? !game.paused;
  $('pause').hidden = !game.paused;
  if (game.paused) { renderPause(); persist(); }
}
function startPlay() {
  if (game.travelling) { $('menu').hidden = true; $('loading').hidden = false; return; }
  initAudio();
  document.activeElement?.blur?.();
  $('menu').hidden = true; $('hud').hidden = false; $('touch').hidden = !isTouch; $('complete').hidden = true;
  game.state = 'play'; game.paused = false; camInit = false; game.autoT = 0;
  renderMission(); renderStatus();
}
function renderMenu() {
  const auto = store.get(AUTO_KEY);
  $('continueBtn').hidden = !auto || auto.v !== 2;
  // levels already reached in any saved game count towards unlocking worlds
  for (const sv of [auto, ...[...Array(SLOTS)].map((_, i) => store.get(SLOT_KEY(i + 1)))]) if (sv && sv.xp) { let l = 0; LEVELS.forEach((L, i) => { if (sv.xp >= L.xp) l = i; }); noteLevel(l + 1, false); }
  if (auto) $('continueBtn').textContent = 'Continue as ' + (SPECIES[auto.species] || SPECIES.peregrine).name + ((auto.world || 'valley') !== BIOME ? ' (' + WORLDS[auto.world || 'valley'].name + ')' : '');
  renderWorlds();
  $('newBtn').className = auto ? 'ghost' : 'cta';
  renderCards();
  renderSlots($('menuSlots'), false);
}
function toMenu() {
  persist();
  game.state = 'menu'; game.paused = false; game.cam = 'third';
  if (F.carry) dropCarry();
  $('pause').hidden = true; $('hud').hidden = true; $('touch').hidden = true; $('sleepScreen').hidden = true; $('menu').hidden = false;
  TOD.scale = 1; renderMenu();
}
$('continueBtn').addEventListener('click', () => { if (applySnapshot(store.get(AUTO_KEY))) { startPlay(); toast('Welcome back!', 'gold'); } });
$('newBtn').addEventListener('click', e => {
  const b = e.currentTarget;
  if (store.get(AUTO_KEY) && !b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again: this replaces your autosave'; return; }
  newGameState(chosen); startPlay();
  const intro = {
    peregrine: `You are a young peregrine at your nest. Press ${KEY.fly} to take off!`,
    eagle: `You are a young golden eagle on your mountain crag. Press ${KEY.fly} to take off!`,
    owl: `You are a barn owl in your barn. Night is coming: time to hunt. Hold ${KEY.skill} to listen.`,
    osprey: `You are an osprey on your nest by the river. Hold ${KEY.skill} to hover over fish.`,
    kite: `You are a red kite in your oak. Ride the thermals and press ${KEY.skill} to scan for food.`,
    hawk: `You are a sparrowhawk in the woods. Weave through the trees and press ${KEY.skill} to burst.`,
    harpy: `You are a young harpy eagle on your giant tree. Press ${KEY.skill} to spot monkeys and sloths in the treetops.`,
    batfalcon: `You are a bat falcon on your dead tree by the river. Hunt parakeets now, and bats when the sun sets.`,
    snowyowl: `You are a snowy owl on the tundra. Hold ${KEY.skill} to listen for lemmings.`,
    gyr: `You are a young gyrfalcon on your crag. Press ${KEY.fly} to take off and hunt ptarmigan!`,
  };
  setTimeout(() => toast(intro[chosen], 'gold', 5500), 400);
});
$('loadMenuBtn').addEventListener('click', () => { $('loadPanel').hidden = !$('loadPanel').hidden; renderSlots($('menuSlots'), false); });
$('pauseBtn').addEventListener('click', () => togglePause());
$('resumeBtn').addEventListener('click', () => togglePause(false));
$('invertBtn').addEventListener('click', () => { settings.invert = !settings.invert; saveSettings(); renderPause(); });
$('levelBtn').addEventListener('click', () => { settings.autoLevel = !settings.autoLevel; saveSettings(); renderPause(); });
$('soundBtn').addEventListener('click', () => { settings.muted = !settings.muted; saveSettings(); renderPause(); });
$('unitsBtn').addEventListener('click', () => { settings.mph = !settings.mph; saveSettings(); renderPause(); renderMission(); });
$('horizonBtn').addEventListener('click', () => { settings.horizon = !settings.horizon; saveSettings(); renderPause(); });
$('camBtn').addEventListener('click', toggleCam);
$('menuBtn').addEventListener('click', toMenu);
$('keepBtn').addEventListener('click', () => { $('complete').hidden = true; game.paused = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'play' && !game.paused) togglePause(true); });
addEventListener('beforeunload', persist);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// ---------- loop ----------
const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  game.t += dt;
  const live = game.state === 'play' && !game.paused;
  if (game.state === 'menu') updateMenuFlight(dt);
  else if (live) {
    const inp = readInput();
    if (F.mode !== 'fly') useSkill(dt, inp);
    if (F.mode === 'fly') updateFlight(dt, inp);
    else if (F.mode === 'ground') updateGround(dt, inp);
    else if (F.mode === 'perch') updatePerch(dt, inp);
    else if (F.mode === 'sleep') updateSleep();
    F.hidden = (F.mode === 'perch' || F.mode === 'sleep') && F.perchType === 'tree';
    fwdOf(F.yaw, F.mode === 'fly' ? F.pitch : 0, F.fwd);
    updateNeeds(dt);
    maybeTip(dt);
    poseFalcon(dt, inp);
    beacon.visible = !!F.carry;
    checkMissions();
    if (F.mode === 'fly') stats().distance += F.speed * dt;
    checkLandmarks(); checkChallenges(dt);
    game.autoT += dt; if (game.autoT > 10) { game.autoT = 0; persist(); }
  }
  if (game.state === 'menu' || live) {
    updateTime(dt);
    updatePrey(dt, live); updateParts(dt); updateChicks(dt); updateThermals(dt);
    updateEagle(dt); updateWind(dt); foxes.forEach(f => updateFox(f, dt)); updateSoundVision(dt);
    windAt(560, tC);
    for (const c of clouds) { c.position.x += tC.x * dt; c.position.z += tC.z * dt; for (const k of ['x', 'z']) { if (c.position[k] > 1400) c.position[k] = -1400; if (c.position[k] < -1400) c.position[k] = 1400; } }
  }
  updateCamera(dt);
  updateSpeedLines(dt);
  if (game.state === 'play') updateHUD();
  updateAudio();
  renderer.render(scene, camera);
}
setSpecies('peregrine');
updateTime(0);
$('loading').hidden = true;
$('menu').hidden = false;
renderMenu();
{
  const pending = store.get(PENDING_KEY);
  try { localStorage.removeItem(PENDING_KEY); } catch (e) { }
  if (pending && (pending.world || 'valley') === BIOME && applySnapshot(pending)) { startPlay(); afterLoad(`Welcome to the ${WORLDS[BIOME].name}!`); }
}
window.__talon = { F, game, prey, setSpecies, NESTS, SPECIES, get spId() { return spId; }, TREES, foxes, eagle, TOD, wind: W, windAt, heightAt, EYRIE, camera, applySnapshot, snapshot, takeOff, perchAt, landGround, doAction, settings };
tick();
