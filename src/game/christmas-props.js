import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  TABLE_RADIUS,
  CUP_TOP_RADIUS,
  CUP_ROWS,
  PLAYER_ANGLES,
  PLAYER_DISTANCE,
} from '../shared/constants.js';
import { getBallMaterial } from './physics.js';

// ─── Detail levels (same as gore-props for parity) ───
const SPHERE_SEG = 18;
const CYL_SEG = 10;
const TUBE_SEG = 40;
const TUBE_RAD = 8;

// ─── Color palette ───
const C = {
  RED: 0xCC2222,
  GREEN: 0x228833,
  GOLD: 0xDDAA22,
  SILVER: 0xAABBCC,
  WHITE: 0xF5F5FF,
  BROWN: 0x6B4226,
  ICING: 0xFFF8E8,
  CANDY_RED: 0xEE1111,
  CANDY_WHITE: 0xFFFFFF,
  PINE: 0x1a4a1a,
  BERRY: 0xCC1111,
  RIBBON: 0xDD2222,
  WARM_LIGHT: 0xFFDD66,
};

const ORNAMENT_COLORS = [C.RED, C.GREEN, C.GOLD, C.SILVER, 0x4444CC];
const PRESENT_COLORS = [C.RED, C.GREEN, C.GOLD, 0x4444CC];

// ─── Cup exclusion zones ───
// Pre-compute all cup world positions so Christmas props don't overlap them.
const CUP_ZONE_RADIUS = 1.1;
const rowSpacing = CUP_TOP_RADIUS * 2 + 0.01;

const allCupPositions = [];
for (let pi = 0; pi < 3; pi++) {
  const angle = PLAYER_ANGLES[pi];
  const baseX = Math.cos(angle) * PLAYER_DISTANCE;
  const baseZ = -Math.sin(angle) * PLAYER_DISTANCE;
  const towardCenterX = -Math.cos(angle);
  const towardCenterZ = Math.sin(angle);
  const perpX = -towardCenterZ;
  const perpZ = towardCenterX;
  const totalDepth = (CUP_ROWS.length - 1) * rowSpacing;

  for (let row = 0; row < CUP_ROWS.length; row++) {
    const cupsInRow = CUP_ROWS[row];
    const rowWidth = (cupsInRow - 1) * rowSpacing;
    const depthOffset = totalDepth - row * rowSpacing;
    for (let col = 0; col < cupsInRow; col++) {
      const lateralOffset = -rowWidth / 2 + col * rowSpacing;
      allCupPositions.push({
        x: baseX + towardCenterX * depthOffset + perpX * lateralOffset,
        z: baseZ + towardCenterZ * depthOffset + perpZ * lateralOffset,
      });
    }
  }
}

function insideCupZone(x, z) {
  for (const cup of allCupPositions) {
    const dx = x - cup.x;
    const dz = z - cup.z;
    if (dx * dx + dz * dz < CUP_ZONE_RADIUS * CUP_ZONE_RADIUS) return true;
  }
  return false;
}

function safePos(x, z) {
  if (!insideCupZone(x, z)) return { x, z };

  let nearestDist = Infinity, nearestCup = null;
  for (const cup of allCupPositions) {
    const dx = x - cup.x;
    const dz = z - cup.z;
    const d = dx * dx + dz * dz;
    if (d < nearestDist) { nearestDist = d; nearestCup = cup; }
  }
  const dx = x - nearestCup.x;
  const dz = z - nearestCup.z;
  const dist = Math.sqrt(dx * dx + dz * dz) || 0.01;
  const pushDist = CUP_ZONE_RADIUS + 0.05;
  let nx = nearestCup.x + (dx / dist) * pushDist;
  let nz = nearestCup.z + (dz / dist) * pushDist;

  const maxR = TABLE_RADIUS * 0.85;
  const r = Math.sqrt(nx * nx + nz * nz);
  if (r > maxR) { nx *= maxR / r; nz *= maxR / r; }

  if (insideCupZone(nx, nz)) {
    for (let ang = 0; ang < Math.PI * 2; ang += 0.3) {
      for (let rd = pushDist; rd < pushDist + 1.5; rd += 0.2) {
        const tx = nearestCup.x + Math.cos(ang) * rd;
        const tz = nearestCup.z + Math.sin(ang) * rd;
        const tr = Math.sqrt(tx * tx + tz * tz);
        if (tr < maxR && !insideCupZone(tx, tz)) return { x: tx, z: tz };
      }
    }
  }

  return { x: nx, z: nz };
}

// ─── Physics helper ───

let propMaterial = null;
function createPropBody(world, position, shape, mass = 0.5) {
  if (!propMaterial) {
    propMaterial = new CANNON.Material({ friction: 0.2, restitution: 0.05 });
    const bm = getBallMaterial();
    if (bm) {
      world.addContactMaterial(new CANNON.ContactMaterial(bm, propMaterial, {
        friction: 0.1, restitution: 0.05,
      }));
    }
  }
  const body = new CANNON.Body({
    mass: mass * 0.15,
    shape,
    material: propMaterial,
    position: new CANNON.Vec3(position.x, position.y, position.z),
    linearDamping: 0.5,
    angularDamping: 0.5,
    allowSleep: true,
    sleepSpeedLimit: 0.1,
    sleepTimeLimit: 1,
  });
  world.addBody(body);
  return body;
}

// ─── Material factories ───

function ornamentMat(color) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.05,
    metalness: 0.3,
    clearcoat: 0.9,
    clearcoatRoughness: 0.05,
  });
}

function fabricMat(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.0,
  });
}

function cookieMat() {
  return new THREE.MeshStandardMaterial({
    color: C.BROWN,
    roughness: 0.75,
    metalness: 0.0,
  });
}

function icingMat() {
  return new THREE.MeshPhysicalMaterial({
    color: C.ICING,
    roughness: 0.35,
    metalness: 0.0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.2,
  });
}

function candyMat(color) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.1,
    metalness: 0.05,
    clearcoat: 0.6,
    clearcoatRoughness: 0.1,
  });
}

// ─── Create functions ───

function createOrnament(scene, x, z, color) {
  const group = new THREE.Group();

  const radius = 0.12 + Math.random() * 0.06;
  const col = color || ORNAMENT_COLORS[Math.floor(Math.random() * ORNAMENT_COLORS.length)];

  // Main glossy sphere
  const sphereGeo = new THREE.SphereGeometry(radius, SPHERE_SEG, SPHERE_SEG);
  const sphere = new THREE.Mesh(sphereGeo, ornamentMat(col));
  sphere.position.y = radius;
  group.add(sphere);

  // Gold cap on top
  const capHeight = 0.03;
  const capRadius = radius * 0.25;
  const capGeo = new THREE.CylinderGeometry(capRadius * 0.7, capRadius, capHeight, CYL_SEG);
  const capMat = new THREE.MeshStandardMaterial({ color: C.GOLD, roughness: 0.3, metalness: 0.7 });
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.position.y = radius * 2 + capHeight * 0.5;
  group.add(cap);

  // Tiny ring on top of cap
  const ringGeo = new THREE.TorusGeometry(capRadius * 0.5, 0.005, 6, 8);
  const ring = new THREE.Mesh(ringGeo, capMat);
  ring.position.y = radius * 2 + capHeight + 0.005;
  group.add(ring);

  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function createSnowmanPart(scene, x, z) {
  const group = new THREE.Group();
  const snowMat = new THREE.MeshStandardMaterial({ color: C.WHITE, roughness: 0.6, metalness: 0.0 });

  // Body — lower, larger sphere
  const bodyRadius = 0.2;
  const bodyGeo = new THREE.SphereGeometry(bodyRadius, SPHERE_SEG, SPHERE_SEG);
  const body = new THREE.Mesh(bodyGeo, snowMat);
  body.position.y = bodyRadius;
  group.add(body);

  // Head — smaller sphere on top
  const headRadius = 0.15;
  const headGeo = new THREE.SphereGeometry(headRadius, SPHERE_SEG, SPHERE_SEG);
  const head = new THREE.Mesh(headGeo, snowMat);
  head.position.y = bodyRadius * 2 + headRadius * 0.75;
  group.add(head);

  // Coal eyes — tiny black spheres
  const coalMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const headCenterY = bodyRadius * 2 + headRadius * 0.75;
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), coalMat);
    eye.position.set(side * 0.05, headCenterY + 0.04, headRadius * 0.9);
    group.add(eye);
  }

  // Carrot nose — orange cone
  const noseMat = new THREE.MeshStandardMaterial({ color: 0xFF8C00, roughness: 0.6 });
  const noseGeo = new THREE.ConeGeometry(0.025, 0.12, CYL_SEG);
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.set(0, headCenterY, headRadius * 0.85);
  nose.rotation.x = Math.PI / 2;
  group.add(nose);

  // Stick arms — brown thin cylinders
  const stickMat = new THREE.MeshStandardMaterial({ color: C.BROWN, roughness: 0.9 });
  for (const side of [-1, 1]) {
    const armGeo = new THREE.CylinderGeometry(0.01, 0.012, 0.25, CYL_SEG);
    const arm = new THREE.Mesh(armGeo, stickMat);
    arm.position.set(side * (bodyRadius + 0.1), bodyRadius + 0.05, 0);
    arm.rotation.z = side * -0.6;
    group.add(arm);
  }

  // Red scarf (torus around neck)
  const scarfGeo = new THREE.TorusGeometry(headRadius * 0.7, 0.025, 6, CYL_SEG);
  const scarf = new THREE.Mesh(scarfGeo, fabricMat(C.RED));
  scarf.position.y = bodyRadius * 2 - 0.02;
  scarf.rotation.x = Math.PI / 2;
  group.add(scarf);

  // Coal buttons on body
  for (let i = 0; i < 3; i++) {
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), coalMat);
    button.position.set(0, bodyRadius + 0.08 - i * 0.08, bodyRadius * 0.95);
    group.add(button);
  }

  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function createPresentBox(scene, x, z) {
  const group = new THREE.Group();

  const w = 0.15 + Math.random() * 0.1;
  const h = 0.15 + Math.random() * 0.1;
  const d = 0.15 + Math.random() * 0.1;

  const boxColor = PRESENT_COLORS[Math.floor(Math.random() * PRESENT_COLORS.length)];
  // Pick a contrasting ribbon color
  const ribbonColor = boxColor === C.RED ? C.GOLD : C.RIBBON;

  // Main box
  const boxGeo = new THREE.BoxGeometry(w, h, d);
  const boxMat = new THREE.MeshStandardMaterial({ color: boxColor, roughness: 0.5, metalness: 0.1 });
  const box = new THREE.Mesh(boxGeo, boxMat);
  box.position.y = h / 2;
  group.add(box);

  // Ribbon cross — two thin strips
  const ribbonMat = new THREE.MeshStandardMaterial({ color: ribbonColor, roughness: 0.4, metalness: 0.2 });
  const ribbonThick = 0.012;

  // Ribbon along X
  const ribbonX = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.005, ribbonThick, 0.03),
    ribbonMat
  );
  ribbonX.position.y = h + ribbonThick * 0.5;
  group.add(ribbonX);

  // Ribbon along Z
  const ribbonZ = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, ribbonThick, d + 0.005),
    ribbonMat
  );
  ribbonZ.position.y = h + ribbonThick * 0.5;
  group.add(ribbonZ);

  // Bow on top — two small spheres
  const bowMat = new THREE.MeshStandardMaterial({ color: ribbonColor, roughness: 0.35, metalness: 0.2 });
  for (const side of [-1, 1]) {
    const bow = new THREE.Mesh(new THREE.SphereGeometry(0.025, SPHERE_SEG, SPHERE_SEG), bowMat);
    bow.position.set(side * 0.02, h + ribbonThick + 0.02, 0);
    bow.scale.set(1.2, 0.7, 0.8);
    group.add(bow);
  }

  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function createGingerbreadMan(scene, x, z, rotY) {
  const group = new THREE.Group();
  const cMat = cookieMat();
  const iMat = icingMat();

  const thick = 0.03;

  // Body — flat-ish box
  const bodyGeo = new THREE.BoxGeometry(0.12, thick, 0.18);
  const body = new THREE.Mesh(bodyGeo, cMat);
  body.position.y = thick / 2 + 0.002;
  group.add(body);

  // Head — flattened sphere
  const headGeo = new THREE.SphereGeometry(0.06, SPHERE_SEG, SPHERE_SEG);
  const head = new THREE.Mesh(headGeo, cMat);
  head.position.set(0, thick / 2 + 0.002, 0.12);
  head.scale.y = 0.5;
  group.add(head);

  // Arms — two flat boxes angled out
  for (const side of [-1, 1]) {
    const armGeo = new THREE.BoxGeometry(0.14, thick * 0.8, 0.04);
    const arm = new THREE.Mesh(armGeo, cMat);
    arm.position.set(side * 0.1, thick / 2 + 0.002, 0.06);
    arm.rotation.y = side * 0.4;
    group.add(arm);
  }

  // Legs — two flat boxes
  for (const side of [-1, 1]) {
    const legGeo = new THREE.BoxGeometry(0.04, thick * 0.8, 0.14);
    const leg = new THREE.Mesh(legGeo, cMat);
    leg.position.set(side * 0.035, thick / 2 + 0.002, -0.12);
    leg.rotation.y = side * -0.15;
    group.add(leg);
  }

  // Icing eyes — two small dots on head
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 6), iMat);
    eye.position.set(side * 0.025, thick + 0.005, 0.15);
    group.add(eye);
  }

  // Icing mouth — small curved line (tiny torus segment)
  const mouthGeo = new THREE.TorusGeometry(0.02, 0.005, 4, 6, Math.PI);
  const mouth = new THREE.Mesh(mouthGeo, iMat);
  mouth.position.set(0, thick + 0.005, 0.1);
  mouth.rotation.x = Math.PI / 2;
  group.add(mouth);

  // Icing buttons — 3 dots down chest
  for (let i = 0; i < 3; i++) {
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 6), iMat);
    btn.position.set(0, thick + 0.005, 0.06 - i * 0.05);
    group.add(btn);
  }

  // Icing squiggly lines on limbs — small cylinders
  for (const side of [-1, 1]) {
    // Arm squiggles
    for (let i = 0; i < 2; i++) {
      const sq = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, 0.025, 4),
        iMat
      );
      sq.position.set(side * (0.08 + i * 0.03), thick + 0.003, 0.06);
      sq.rotation.z = Math.PI / 2;
      group.add(sq);
    }
    // Leg squiggles
    for (let i = 0; i < 2; i++) {
      const sq = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, 0.025, 4),
        iMat
      );
      sq.position.set(side * 0.035, thick + 0.003, -0.08 - i * 0.03);
      sq.rotation.x = Math.PI / 2;
      group.add(sq);
    }
  }

  group.position.set(x, 0, z);
  group.rotation.y = rotY || 0;
  scene.add(group);
  return group;
}

function createCandyCane(scene, x, z, rotY) {
  const group = new THREE.Group();

  // Build a hook-shaped path
  const points = [];
  const segments = 20;
  const straightHeight = 0.2;
  const hookRadius = 0.06;

  // Straight section
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    points.push(new THREE.Vector3(0, t * straightHeight, 0));
  }

  // Hook curve
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    const angle = t * Math.PI;
    points.push(new THREE.Vector3(
      -hookRadius + Math.cos(angle) * hookRadius,
      straightHeight + Math.sin(angle) * hookRadius,
      0
    ));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const tubeGeo = new THREE.TubeGeometry(curve, segments, 0.015, TUBE_RAD, false);

  // Apply red/white stripes via vertex colors
  const pos = tubeGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const red = new THREE.Color(C.CANDY_RED);
  const white = new THREE.Color(C.CANDY_WHITE);

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const x2 = pos.getX(i);
    // Stripe based on position along the curve
    const stripeVal = Math.sin((y + x2) * 40);
    const col = stripeVal > 0 ? red : white;
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  tubeGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = candyMat(C.CANDY_WHITE);
  mat.vertexColors = true;
  const cane = new THREE.Mesh(tubeGeo, mat);
  group.add(cane);

  group.position.set(x, 0, z);
  group.rotation.y = rotY || 0;
  scene.add(group);
  return group;
}

function createPineBranch(scene, x, z, rotY) {
  const group = new THREE.Group();

  const stickMat = new THREE.MeshStandardMaterial({ color: C.BROWN, roughness: 0.85 });
  const needleMat = new THREE.MeshStandardMaterial({ color: C.PINE, roughness: 0.7 });

  // Brown stem
  const stemLen = 0.25;
  const stemGeo = new THREE.CylinderGeometry(0.008, 0.012, stemLen, CYL_SEG);
  const stem = new THREE.Mesh(stemGeo, stickMat);
  stem.rotation.z = Math.PI / 2;
  stem.position.y = 0.015;
  group.add(stem);

  // Small green cone "needles" clustered along stem
  for (let i = 0; i < 8; i++) {
    const t = (i / 7) - 0.5; // -0.5 to 0.5
    const needleGeo = new THREE.ConeGeometry(0.02, 0.06, 4);
    const needle = new THREE.Mesh(needleGeo, needleMat);
    const side = i % 2 === 0 ? 1 : -1;
    needle.position.set(
      t * stemLen,
      0.015 + 0.01,
      side * (0.015 + Math.random() * 0.01)
    );
    needle.rotation.z = side * 0.5;
    needle.rotation.x = (Math.random() - 0.5) * 0.3;
    group.add(needle);
  }

  group.position.set(x, 0, z);
  group.rotation.y = rotY || 0;
  scene.add(group);
  return group;
}

function createHollyCluster(scene, x, z) {
  const group = new THREE.Group();

  const berryMat = new THREE.MeshStandardMaterial({ color: C.BERRY, roughness: 0.3, metalness: 0.1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: C.GREEN, roughness: 0.5 });

  // 3 small red berry spheres
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const berry = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), berryMat);
    berry.position.set(
      Math.cos(angle) * 0.012,
      0.015,
      Math.sin(angle) * 0.012
    );
    group.add(berry);
  }

  // 2 small green leaves (scaled spheres)
  for (let i = 0; i < 2; i++) {
    const angle = (i / 2) * Math.PI + Math.PI * 0.25;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), leafMat);
    leaf.position.set(
      Math.cos(angle) * 0.025,
      0.01,
      Math.sin(angle) * 0.025
    );
    leaf.scale.set(1.5, 0.4, 0.8);
    group.add(leaf);
  }

  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function createSnowflakeDecal(scene, x, z, scale) {
  const group = new THREE.Group();
  const s = scale || 0.08 + Math.random() * 0.06;

  const mat = new THREE.MeshStandardMaterial({
    color: C.WHITE,
    roughness: 0.5,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  });

  // 6 thin rectangles in a star pattern
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI;
    const arm = new THREE.Mesh(new THREE.PlaneGeometry(s * 2, s * 0.15), mat);
    arm.rotation.x = -Math.PI / 2;
    arm.rotation.z = angle;
    arm.position.y = 0.002;
    group.add(arm);
  }

  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

// ─── Main export ───

export function addChristmasProps(scene, world, onOrnamentHit) {
  const R = TABLE_RADIUS;
  const propPairs = []; // { mesh, body }

  function addProp(mesh, position, shape, mass) {
    const body = createPropBody(world, position, shape, mass);
    // Match initial rotation
    body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
    propPairs.push({ mesh, body });
    return body;
  }

  // Helper to add an ornament with hit reaction
  function addOrnamentWithHit(x, z, color) {
    const mesh = createOrnament(scene, x, z, color);
    const radius = 0.14; // average ornament radius for physics
    const body = addProp(mesh, { x, y: radius, z }, new CANNON.Sphere(radius), 0.05);
    body.addEventListener('collide', (event) => {
      if (event.body && event.body.isBall && onOrnamentHit) onOrnamentHit();
    });
    return { mesh, body };
  }

  // Helper: create prop at a safe position (avoiding cup zones)
  function sp(rawX, rawZ) { return safePos(rawX, rawZ); }

  // Deterministic pseudo-random for reproducible placement
  let _seed = 42;
  function rand() { _seed = (_seed * 16807 + 0) % 2147483647; return _seed / 2147483647; }
  function randRange(lo, hi) { return lo + rand() * (hi - lo); }
  function randPos() { const a = rand() * Math.PI * 2, r = (0.2 + rand() * 0.65) * R; return sp(Math.cos(a) * r, Math.sin(a) * r); }
  function randRot() { return rand() * Math.PI * 2; }

  // ─── Snowflake decals (30) — like blood puddles ───
  for (let i = 0; i < 30; i++) {
    const s = randPos();
    createSnowflakeDecal(scene, s.x, s.z, 0.06 + rand() * 0.08);
  }

  // ─── Ornaments (12) — physics-enabled, glossy spheres that roll ───
  for (let i = 0; i < 12; i++) {
    const s = randPos();
    const col = ORNAMENT_COLORS[Math.floor(rand() * ORNAMENT_COLORS.length)];
    addOrnamentWithHit(s.x, s.z, col);
  }

  // ─── Snowman parts (6) — physics-enabled ───
  for (let i = 0; i < 6; i++) {
    const s = randPos();
    const mesh = createSnowmanPart(scene, s.x, s.z);
    addProp(mesh, { x: s.x, y: 0.2, z: s.z }, new CANNON.Sphere(0.2), 0.8);
  }

  // ─── Present boxes (9) — physics-enabled ───
  for (let i = 0; i < 9; i++) {
    const s = randPos();
    const mesh = createPresentBox(scene, s.x, s.z);
    const halfW = 0.1 + rand() * 0.03;
    addProp(mesh, { x: s.x, y: halfW, z: s.z }, new CANNON.Box(new CANNON.Vec3(halfW, halfW, halfW)), 0.3);
  }

  // ─── Gingerbread men (9) — physics-enabled ───
  for (let i = 0; i < 9; i++) {
    const s = randPos();
    const mesh = createGingerbreadMan(scene, s.x, s.z, randRot());
    addProp(mesh, { x: s.x, y: 0.02, z: s.z }, new CANNON.Box(new CANNON.Vec3(0.12, 0.02, 0.18)), 0.1);
  }

  // ─── Candy canes (18) — static, scattered ───
  for (let i = 0; i < 18; i++) {
    const s = randPos();
    createCandyCane(scene, s.x, s.z, randRot());
  }

  // ─── Pine branches (12) — static ───
  for (let i = 0; i < 12; i++) {
    const s = randPos();
    createPineBranch(scene, s.x, s.z, randRot());
  }

  // ─── Holly clusters (24) — static, small ───
  for (let i = 0; i < 24; i++) {
    const s = randPos();
    createHollyCluster(scene, s.x, s.z);
  }

  // ─── Physics-visual sync ───
  function update() {
    for (const { mesh, body } of propPairs) {
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    }
  }

  return {
    props: propPairs,
    update,
  };
}
