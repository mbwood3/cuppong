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

// ─── Detail levels (optimized for iPhone) ───
const SPHERE_SEG = 18;
const CYL_SEG = 10;
const TUBE_SEG = 40;
const TUBE_RAD = 8;

// ─── Color palette ───
const C = {
  BLOOD_RED:    0x8b0000,
  DARK_BLOOD:   0x4a0000,
  FRESH_BLOOD:  0xaa1515,
  FLESH:        0xd4a574,
  FLESH_PALE:   0xe0c8a8,
  FLESH_DARK:   0xb08050,
  BRUISE:       0x553366,
  BONE:         0xe8dcc8,
  ORGAN_RED:    0x8b2020,
  ORGAN_PINK:   0xcc7777,
  MUSCLE:       0x993333,
  FAT:          0xe8d090,
  VEIN_BLUE:    0x4455aa,
  TENDON:       0xd8d0c0,
  NAIL:         0xf0e0d0,
};

// ─── Cup exclusion zones ───
// Pre-compute all cup world positions so gore props don't overlap them.
const CUP_ZONE_RADIUS = 1.1; // clearance: largest prop (head r=0.5) + cup (r=0.13) + ball margin
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

// Check if (x, z) is too close to any cup. Returns true if inside a cup zone.
function insideCupZone(x, z) {
  for (const cup of allCupPositions) {
    const dx = x - cup.x;
    const dz = z - cup.z;
    if (dx * dx + dz * dz < CUP_ZONE_RADIUS * CUP_ZONE_RADIUS) return true;
  }
  return false;
}

// Nudge a position outward from the nearest cup center until it clears all zones.
// Returns { x, z } that is guaranteed outside all cup zones (and inside table).
function safePos(x, z) {
  if (!insideCupZone(x, z)) return { x, z };

  // Find the nearest cup and push away from it
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

  // Clamp inside table (with small margin)
  const maxR = TABLE_RADIUS * 0.85;
  const r = Math.sqrt(nx * nx + nz * nz);
  if (r > maxR) { nx *= maxR / r; nz *= maxR / r; }

  // If still inside a cup zone after push (rare, near overlapping zones), try harder
  if (insideCupZone(nx, nz)) {
    // Spiral outward in small steps
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

// ─── Procedural texture generators (lazy-cached) ───

let _fleshNormalMap = null;
function getFleshNormalMap() {
  if (_fleshNormalMap) return _fleshNormalMap;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Neutral normal base (pointing straight out)
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, size, size);

  // Pores — small dark dots scattered across surface
  for (let i = 0; i < 600; i++) {
    const px = Math.random() * size;
    const py = Math.random() * size;
    const r = 0.5 + Math.random() * 1.2;
    const offset = Math.floor(Math.random() * 20 - 10);
    ctx.fillStyle = `rgb(${128 + offset},${128 + offset},${240 + Math.floor(Math.random() * 15)})`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Wrinkle lines — thin slightly-offset strokes
  ctx.strokeStyle = 'rgba(118,118,245,0.4)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 25; i++) {
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    for (let j = 0; j < 4; j++) {
      ctx.lineTo(sx + (Math.random() - 0.5) * 30, sy + (Math.random() - 0.5) * 30);
    }
    ctx.stroke();
  }

  // Bumpy patches — larger subtle blobs
  for (let i = 0; i < 40; i++) {
    const px = Math.random() * size;
    const py = Math.random() * size;
    const r = 3 + Math.random() * 5;
    const nx = Math.floor(128 + (Math.random() - 0.5) * 30);
    const ny = Math.floor(128 + (Math.random() - 0.5) * 30);
    ctx.fillStyle = `rgba(${nx},${ny},250,0.3)`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  _fleshNormalMap = new THREE.CanvasTexture(canvas);
  _fleshNormalMap.wrapS = THREE.RepeatWrapping;
  _fleshNormalMap.wrapT = THREE.RepeatWrapping;
  return _fleshNormalMap;
}

let _organNormalMap = null;
function getOrganNormalMap() {
  if (_organNormalMap) return _organNormalMap;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Neutral normal base
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, size, size);

  // Larger undulating bumps — organs are smoother/wetter than skin
  for (let i = 0; i < 20; i++) {
    const px = Math.random() * size;
    const py = Math.random() * size;
    const r = 8 + Math.random() * 15;
    const nx = Math.floor(128 + (Math.random() - 0.5) * 20);
    const ny = Math.floor(128 + (Math.random() - 0.5) * 20);
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, r);
    gradient.addColorStop(0, `rgba(${nx},${ny},252,0.5)`);
    gradient.addColorStop(1, 'rgba(128,128,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // A few subtle ridges
  ctx.strokeStyle = 'rgba(120,120,248,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(
      sx + (Math.random() - 0.5) * 60, sy + (Math.random() - 0.5) * 60,
      sx + (Math.random() - 0.5) * 80, sy + (Math.random() - 0.5) * 80
    );
    ctx.stroke();
  }

  _organNormalMap = new THREE.CanvasTexture(canvas);
  _organNormalMap.wrapS = THREE.RepeatWrapping;
  _organNormalMap.wrapT = THREE.RepeatWrapping;
  return _organNormalMap;
}

let _fleshRoughnessMap = null;
function getFleshRoughnessMap() {
  if (_fleshRoughnessMap) return _fleshRoughnessMap;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Base gray (~160 = moderately rough)
  ctx.fillStyle = 'rgb(160,160,160)';
  ctx.fillRect(0, 0, size, size);

  // Wet patches (dark = smooth/wet)
  for (let i = 0; i < 30; i++) {
    const px = Math.random() * size;
    const py = Math.random() * size;
    const r = 4 + Math.random() * 12;
    const v = Math.floor(60 + Math.random() * 50); // dark = wet/smooth
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, r);
    gradient.addColorStop(0, `rgba(${v},${v},${v},0.6)`);
    gradient.addColorStop(1, 'rgba(160,160,160,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dry patches (light = rough)
  for (let i = 0; i < 20; i++) {
    const px = Math.random() * size;
    const py = Math.random() * size;
    const r = 3 + Math.random() * 8;
    const v = Math.floor(190 + Math.random() * 50); // light = dry/rough
    ctx.fillStyle = `rgba(${v},${v},${v},0.4)`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  _fleshRoughnessMap = new THREE.CanvasTexture(canvas);
  _fleshRoughnessMap.wrapS = THREE.RepeatWrapping;
  _fleshRoughnessMap.wrapT = THREE.RepeatWrapping;
  return _fleshRoughnessMap;
}

// ─── Material factories ───

function fleshMat(color = C.FLESH, wetness = 0.5) {
  return new THREE.MeshPhysicalMaterial({
    color,
    vertexColors: false, // enabled per-mesh when vertex colors are added
    roughness: 0.65 - wetness * 0.35,
    roughnessMap: getFleshRoughnessMap(),
    metalness: 0.0,
    clearcoat: wetness * 0.4,
    clearcoatRoughness: 0.3,
    sheen: 0.4,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(0xff5533),
    normalMap: getFleshNormalMap(),
    normalScale: new THREE.Vector2(0.8, 0.8),
  });
}

// Create flesh material with vertex colors for mottled/bruised look
function fleshMatVC(color = C.FLESH, wetness = 0.5) {
  const m = fleshMat(color, wetness);
  m.vertexColors = true;
  return m;
}

function organMat(color = C.ORGAN_RED, wetness = 0.8) {
  return new THREE.MeshPhysicalMaterial({
    color,
    vertexColors: false,
    roughness: 0.15,
    metalness: 0.0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08,
    sheen: 0.6,
    sheenRoughness: 0.25,
    sheenColor: new THREE.Color(0xff3311),
    normalMap: getOrganNormalMap(),
    normalScale: new THREE.Vector2(0.5, 0.5),
  });
}

function organMatVC(color = C.ORGAN_RED, wetness = 0.8) {
  const m = organMat(color, wetness);
  m.vertexColors = true;
  return m;
}

function bloodMat(pooled = true) {
  return new THREE.MeshStandardMaterial({
    color: pooled ? C.DARK_BLOOD : C.FRESH_BLOOD,
    roughness: pooled ? 0.25 : 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: pooled ? 0.88 : 0.92,
    emissive: pooled ? 0x000000 : 0x220000,
    emissiveIntensity: pooled ? 0 : 0.15,
  });
}

function boneMat() {
  return new THREE.MeshStandardMaterial({ color: C.BONE, roughness: 0.55, metalness: 0.02 });
}

// ─── Geometry helpers ───

// Multi-octave organic noise displacement — looks fleshy, not geometric
function displaceVertices(geo, amount = 0.02, freq = 3.0) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // 3 octaves of sine-based noise at different frequencies
    const n1 = Math.sin(x * freq) * Math.cos(y * freq * 1.3) * Math.sin(z * freq * 0.7);
    const n2 = Math.sin(x * freq * 2.3 + 1.7) * Math.cos(y * freq * 1.9 + 0.5) * Math.sin(z * freq * 2.1 + 2.3);
    const n3 = Math.sin(x * freq * 4.7 + 3.1) * Math.cos(y * freq * 3.7 + 1.2) * Math.sin(z * freq * 5.3 + 0.9);
    const noise = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    const d = noise * amount;
    pos.setXYZ(i, x + (x / len) * d, y + (y / len) * d, z + (z / len) * d);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

// Add per-vertex color variation to make surfaces look mottled/bruised
// Add per-vertex color variation: bruises, veins, and blood pooling
function addVertexColors(geo, baseColor, variation = 0.15) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(baseColor);
  const bruise = new THREE.Color(C.BRUISE);
  const vein = new THREE.Color(C.VEIN_BLUE);
  const blood = new THREE.Color(C.DARK_BLOOD);

  // Find Y range for blood pooling
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const yRange = maxY - minY || 1;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);

    // Base noise variation
    const n = Math.sin(x * 7.3 + y * 5.1) * Math.cos(z * 6.7 + x * 3.2) * variation;

    // Bruise patches — purple/yellow discoloration
    const bruiseNoise = Math.sin(x * 3.1 + z * 2.7) * Math.cos(y * 4.3 + x * 1.9);
    const bruiseStrength = bruiseNoise > 0.4 ? (bruiseNoise - 0.4) * 1.5 : 0;

    // Vein lines — blue streaks along surface
    const veinLine = Math.sin(x * 15 + y * 8) * Math.sin(z * 12 + y * 6);
    const veinStrength = veinLine > 0.75 ? (veinLine - 0.75) * 3.0 : 0;

    // Blood pooling — darker red in lower areas
    const yNorm = (y - minY) / yRange; // 0=bottom, 1=top
    const poolStrength = Math.max(0, (1 - yNorm) * 0.5 - 0.15);

    // Dark spots
    const darkSpot = Math.sin(x * 13 + z * 11) > 0.7 ? -variation * 0.5 : 0;

    // Blend: base + noise + bruise + vein + blood pool
    let r = base.r + n + darkSpot;
    let g = base.g + n * 0.5 + darkSpot;
    let b = base.b + n * 0.3 + darkSpot;

    // Mix in bruise color
    r = r * (1 - bruiseStrength) + bruise.r * bruiseStrength;
    g = g * (1 - bruiseStrength) + bruise.g * bruiseStrength;
    b = b * (1 - bruiseStrength) + bruise.b * bruiseStrength;

    // Mix in vein color
    r = r * (1 - veinStrength) + vein.r * veinStrength;
    g = g * (1 - veinStrength) + vein.g * veinStrength;
    b = b * (1 - veinStrength) + vein.b * veinStrength;

    // Mix in blood pooling
    r = r * (1 - poolStrength) + blood.r * poolStrength;
    g = g * (1 - poolStrength) + blood.g * poolStrength;
    b = b * (1 - poolStrength) + blood.b * poolStrength;

    colors[i * 3] = Math.max(0, Math.min(1, r));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, g));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, b));
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function makeTube(points, radius = 0.015, mat = null) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, Math.min(points.length * 4, TUBE_SEG), radius, TUBE_RAD, false);
  return new THREE.Mesh(geo, mat || fleshMat(C.FRESH_BLOOD, 0.7));
}

function addStump(group, pos, radius, boneRadius, rotation = null) {
  const rot = rotation || new THREE.Euler(-Math.PI / 2, 0, 0);
  const segments = 16;

  // Jagged outer flesh ring — irregular radius per vertex
  const outerShape = new THREE.Shape();
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const jag = radius * (0.85 + Math.random() * 0.3); // 0.85-1.15 of radius
    const px = Math.cos(angle) * jag;
    const py = Math.sin(angle) * jag;
    if (i === 0) outerShape.moveTo(px, py);
    else outerShape.lineTo(px, py);
  }
  // Cut hole for inner layers
  const holePath = new THREE.Path();
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const px = Math.cos(angle) * radius * 0.7;
    const py = Math.sin(angle) * radius * 0.7;
    if (i === 0) holePath.moveTo(px, py);
    else holePath.lineTo(px, py);
  }
  outerShape.holes.push(holePath);
  const fleshRing = new THREE.Mesh(new THREE.ShapeGeometry(outerShape), fleshMat(C.FLESH, 0.6));
  fleshRing.position.copy(pos);
  fleshRing.rotation.copy(rot);
  group.add(fleshRing);

  // Fat layer — yellowish ring
  const fatShape = new THREE.Shape();
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const px = Math.cos(angle) * radius * 0.7;
    const py = Math.sin(angle) * radius * 0.7;
    if (i === 0) fatShape.moveTo(px, py);
    else fatShape.lineTo(px, py);
  }
  const fatHole = new THREE.Path();
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const px = Math.cos(angle) * radius * 0.55;
    const py = Math.sin(angle) * radius * 0.55;
    if (i === 0) fatHole.moveTo(px, py);
    else fatHole.lineTo(px, py);
  }
  fatShape.holes.push(fatHole);
  const fatRing = new THREE.Mesh(new THREE.ShapeGeometry(fatShape), fleshMat(C.FAT, 0.2));
  fatRing.position.copy(pos);
  fatRing.position.y += 0.001;
  fatRing.rotation.copy(rot);
  group.add(fatRing);

  // Muscle core
  const muscle = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.55, segments),
    organMat(C.MUSCLE, 0.9)
  );
  muscle.position.copy(pos);
  muscle.position.y += 0.002;
  muscle.rotation.copy(rot);
  group.add(muscle);

  // Bone center
  const bone = new THREE.Mesh(new THREE.CircleGeometry(boneRadius, 8), boneMat());
  bone.position.copy(pos);
  bone.position.y += 0.003;
  bone.rotation.copy(rot);
  group.add(bone);

  // Dangling flesh strips — hanging down from the edge
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.8;
    const r = radius * (0.8 + Math.random() * 0.2);
    const hangLen = 0.04 + Math.random() * 0.08;
    const pts = [
      new THREE.Vector3(pos.x + Math.cos(angle) * r * 0.6, pos.y, pos.z + Math.sin(angle) * r * 0.6),
      new THREE.Vector3(pos.x + Math.cos(angle) * r * 0.7, pos.y - hangLen * 0.4, pos.z + Math.sin(angle) * r * 0.7),
      new THREE.Vector3(pos.x + Math.cos(angle) * r * 0.65, pos.y - hangLen, pos.z + Math.sin(angle) * r * 0.65),
    ];
    group.add(makeTube(pts, 0.006 + Math.random() * 0.006, fleshMat(C.FLESH, 0.7)));
  }

  // Blood drips
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + Math.random();
    const dripPoints = [
      new THREE.Vector3(pos.x + Math.cos(angle) * radius * 0.4, pos.y, pos.z + Math.sin(angle) * radius * 0.4),
      new THREE.Vector3(pos.x + Math.cos(angle) * radius * 0.5, pos.y - 0.05, pos.z + Math.sin(angle) * radius * 0.5),
      new THREE.Vector3(pos.x + Math.cos(angle) * radius * 0.45, pos.y - 0.1, pos.z + Math.sin(angle) * radius * 0.45),
    ];
    group.add(makeTube(dripPoints, 0.008, bloodMat(false)));
  }
}

// ─── Physics helper ───

let propMaterial = null;
function createPropBody(world, position, shape, mass = 0.5) {
  if (!propMaterial) {
    propMaterial = new CANNON.Material({ friction: 0.2, restitution: 0.05 });
    const bm = getBallMaterial();
    if (bm) {
      world.addContactMaterial(new CANNON.ContactMaterial(bm, propMaterial, {
        friction: 0.1, restitution: 0.05, // ball plows through gore, barely slowed
      }));
    }
  }
  const body = new CANNON.Body({
    mass: mass * 0.15, // very light so ball knocks them aside easily
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

// ─── Blood puddles & smears (no physics) ───

function createBloodPuddle(scene, x, z, scale = 1) {
  const shape = new THREE.Shape();
  const pts = 12;
  for (let i = 0; i < pts; i++) {
    const angle = (i / pts) * Math.PI * 2;
    const r = (0.3 + Math.random() * 0.25) * scale;
    const px = Math.cos(angle) * r, py = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
  }
  shape.closePath();
  const puddle = new THREE.Mesh(new THREE.ShapeGeometry(shape), bloodMat(true));
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(x, 0.003, z);
  scene.add(puddle);
  return puddle;
}

function createBloodSmear(scene, x, z, angle, length = 0.8) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.06);
  shape.quadraticCurveTo(length * 0.3, -0.1, length * 0.6, -0.04);
  shape.lineTo(length, 0);
  shape.lineTo(length * 0.6, 0.04);
  shape.quadraticCurveTo(length * 0.3, 0.1, 0, 0.06);
  shape.closePath();
  const smear = new THREE.Mesh(new THREE.ShapeGeometry(shape), bloodMat(true));
  smear.material.opacity = 0.7;
  smear.rotation.x = -Math.PI / 2;
  smear.rotation.z = angle;
  smear.position.set(x, 0.002, z);
  scene.add(smear);
  return smear;
}

// ─── Body parts ───

function createSeveredFinger(scene, x, z, rotY = 0) {
  const group = new THREE.Group();
  const fm = fleshMat();

  const fingerGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.45, CYL_SEG + 4, 6);
  displaceVertices(fingerGeo, 0.012, 6);
  addVertexColors(fingerGeo, C.FLESH, 0.08);
  const finger = new THREE.Mesh(fingerGeo, fleshMatVC());
  finger.rotation.z = Math.PI / 2;
  finger.position.y = 0.06;
  group.add(finger);

  const nail = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.02, 0.08),
    new THREE.MeshStandardMaterial({ color: C.NAIL, roughness: 0.4, metalness: 0.1 })
  );
  nail.position.set(0.2, 0.1, 0);
  group.add(nail);

  addStump(group, new THREE.Vector3(-0.225, 0.06, 0), 0.08, 0.025,
    new THREE.Euler(0, 0, Math.PI / 2));

  createBloodPuddle(scene, x + 0.1, z, 0.4);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

function createBoneFragment(scene, x, z, rotY = 0) {
  const group = new THREE.Group();
  const bm = boneMat();

  const shaftGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.5, CYL_SEG + 4, 6);
  displaceVertices(shaftGeo, 0.008, 5);
  const shaft = new THREE.Mesh(shaftGeo, bm);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.y = 0.04;
  group.add(shaft);

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, CYL_SEG, CYL_SEG), bm);
  knob.position.set(0.25, 0.04, 0);
  knob.scale.set(1, 0.7, 0.8);
  group.add(knob);

  const spikeMat = new THREE.MeshStandardMaterial({ color: 0xd8c8b0, roughness: 0.7 });
  for (let i = 0; i < 3; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), spikeMat);
    const a = (i / 3) * Math.PI * 2;
    spike.position.set(-0.25, 0.04 + Math.sin(a) * 0.02, Math.cos(a) * 0.02);
    spike.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
    group.add(spike);
  }

  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

function createEyeball(scene, x, z) {
  const group = new THREE.Group();

  const eyeGeo = new THREE.SphereGeometry(0.12, SPHERE_SEG + 4, SPHERE_SEG + 4);
  displaceVertices(eyeGeo, 0.004, 6); // very subtle organic wobble
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: 0xf5f0e0, roughness: 0.12, metalness: 0.05,
    clearcoat: 0.9, clearcoatRoughness: 0.05,
  });
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  eye.position.y = 0.12;
  group.add(eye);

  const iris = new THREE.Mesh(
    new THREE.CircleGeometry(0.06, 16),
    new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.3 })
  );
  iris.position.set(0, 0.16, 0.11);
  iris.rotation.x = -0.3;
  group.add(iris);

  const pupil = new THREE.Mesh(
    new THREE.CircleGeometry(0.03, 16),
    new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.2 })
  );
  pupil.position.set(0, 0.165, 0.115);
  pupil.rotation.x = -0.3;
  group.add(pupil);

  // Blood veins
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    const veinPts = [];
    for (let j = 0; j < 4; j++) {
      const t = j / 3;
      veinPts.push(new THREE.Vector3(
        Math.cos(a + t * 0.3) * (0.06 + t * 0.04),
        0.12 + Math.sin(a * 2 + t) * 0.04,
        Math.sin(a + t * 0.3) * (0.06 + t * 0.04)
      ));
    }
    group.add(makeTube(veinPts, 0.003, new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.6 })));
  }

  // Optic nerve
  const nervePoints = [];
  for (let i = 0; i < 6; i++) {
    nervePoints.push(new THREE.Vector3(
      Math.sin(i * 0.5) * 0.03, 0.12 - i * 0.03, -0.12 - i * 0.04
    ));
  }
  group.add(makeTube(nervePoints, 0.015, organMat(0xcc4444)));

  createBloodPuddle(scene, x, z + 0.15, 0.3);
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function createSeveredHand(scene, x, z, rotY = 0) {
  const group = new THREE.Group();
  const fm = fleshMat();

  const palmGeo = new THREE.BoxGeometry(0.4, 0.1, 0.35, 8, 4, 8);
  displaceVertices(palmGeo, 0.015, 5);
  addVertexColors(palmGeo, C.FLESH, 0.08);
  const palm = new THREE.Mesh(palmGeo, fleshMatVC());
  palm.position.y = 0.05;
  group.add(palm);

  for (let i = 0; i < 4; i++) {
    const len = 0.25 + Math.random() * 0.1;
    const fGeo = new THREE.CylinderGeometry(0.03, 0.035, len, CYL_SEG);
    displaceVertices(fGeo, 0.005, 6);
    const f = new THREE.Mesh(fGeo, fm);
    const spread = (i - 1.5) * 0.08;
    f.position.set(0.2 + len / 2 * 0.9, 0.05, spread);
    f.rotation.z = Math.PI / 2 + (i - 1.5) * 0.08;
    f.rotation.x = (i - 1.5) * 0.1;
    group.add(f);
  }

  const thumbGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.2, CYL_SEG);
  displaceVertices(thumbGeo, 0.005, 6);
  const thumb = new THREE.Mesh(thumbGeo, fm);
  thumb.position.set(0.05, 0.05, -0.22);
  thumb.rotation.z = Math.PI / 2 - 0.6;
  thumb.rotation.x = -0.3;
  group.add(thumb);

  addStump(group, new THREE.Vector3(-0.22, 0.05, 0), 0.15, 0.035,
    new THREE.Euler(0, 0, Math.PI / 2));

  createBloodPuddle(scene, x, z, 0.8);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

// ─── New body parts ───

function createSeveredHead(scene, x, z) {
  const group = new THREE.Group();
  const fm = fleshMat(C.FLESH, 0.6);

  // Cranium — higher subdivision for organic look
  const craniumGeo = new THREE.SphereGeometry(0.5, SPHERE_SEG + 8, SPHERE_SEG + 4);
  displaceVertices(craniumGeo, 0.04, 3.5); // stronger displacement
  addVertexColors(craniumGeo, C.FLESH, 0.12);
  const cranium = new THREE.Mesh(craniumGeo, fleshMatVC(C.FLESH, 0.6));
  cranium.scale.y = 0.85;
  cranium.position.y = 0.5;
  group.add(cranium);

  // Jaw — lower half-sphere, slightly open
  const jawGeo = new THREE.SphereGeometry(0.38, SPHERE_SEG + 4, SPHERE_SEG + 2, 0, Math.PI * 2, 0, Math.PI * 0.5);
  displaceVertices(jawGeo, 0.025, 4);
  addVertexColors(jawGeo, C.FLESH, 0.1);
  const jaw = new THREE.Mesh(jawGeo, fleshMatVC(C.FLESH, 0.6));
  jaw.position.set(0, 0.25, 0.05);
  jaw.rotation.x = 0.15; // slightly open
  group.add(jaw);

  // Eye sockets — dark recesses
  const socketMat = new THREE.MeshStandardMaterial({ color: C.DARK_BLOOD, roughness: 0.8 });
  for (const side of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), socketMat);
    socket.position.set(side * 0.17, 0.55, 0.35);
    socket.scale.z = 0.6;
    group.add(socket);

    // Small eyeball in socket
    const miniEye = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.3 })
    );
    miniEye.position.set(side * 0.17, 0.55, 0.38);
    group.add(miniEye);

    const miniIris = new THREE.Mesh(
      new THREE.CircleGeometry(0.025, 8),
      new THREE.MeshStandardMaterial({ color: 0x2d5a27 })
    );
    miniIris.position.set(side * 0.17, 0.55, 0.44);
    group.add(miniIris);
  }

  // Nose
  const noseGeo = new THREE.ConeGeometry(0.06, 0.12, CYL_SEG);
  const nose = new THREE.Mesh(noseGeo, fm);
  nose.position.set(0, 0.48, 0.42);
  nose.rotation.x = -0.3;
  nose.scale.z = 0.6;
  group.add(nose);

  // Nostrils
  for (const side of [-1, 1]) {
    const nostril = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 6, 6),
      new THREE.MeshStandardMaterial({ color: C.DARK_BLOOD, roughness: 0.8 })
    );
    nostril.position.set(side * 0.03, 0.44, 0.44);
    group.add(nostril);
  }

  // Exposed skull section — bone visible on one side
  const skullGeo = new THREE.SphereGeometry(0.48, SPHERE_SEG, SPHERE_SEG, Math.PI * 0.8, Math.PI * 0.5, 0, Math.PI * 0.6);
  const skull = new THREE.Mesh(skullGeo, boneMat());
  skull.position.y = 0.51;
  group.add(skull);

  // Blood at skull/flesh boundary
  const boundaryGeo = new THREE.TorusGeometry(0.35, 0.03, 6, 12, Math.PI * 0.5);
  const boundary = new THREE.Mesh(boundaryGeo, bloodMat(false));
  boundary.position.set(-0.15, 0.6, 0);
  boundary.rotation.y = Math.PI * 0.8;
  group.add(boundary);

  // Neck stump with layered cross-section
  const neckGeo = new THREE.CylinderGeometry(0.25, 0.2, 0.15, CYL_SEG + 6, 4);
  displaceVertices(neckGeo, 0.015, 5);
  addVertexColors(neckGeo, C.MUSCLE, 0.2);
  const neckStump = new THREE.Mesh(neckGeo, organMatVC(C.MUSCLE, 0.9));
  neckStump.position.y = 0.08;
  group.add(neckStump);

  addStump(group, new THREE.Vector3(0, 0.01, 0), 0.25, 0.06);

  // Spine bone poking out
  const spine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.12, CYL_SEG),
    boneMat()
  );
  spine.position.set(0, 0.02, -0.08);
  group.add(spine);

  // Dangling tendons
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
    const r = 0.12 + Math.random() * 0.08;
    const pts = [
      new THREE.Vector3(Math.cos(angle) * r, 0.05, Math.sin(angle) * r),
      new THREE.Vector3(Math.cos(angle) * r * 1.1, -0.03, Math.sin(angle) * r * 1.1),
      new THREE.Vector3(Math.cos(angle) * r * 0.9, -0.08, Math.sin(angle) * r * 1.2),
    ];
    group.add(makeTube(pts, 0.01, organMat(C.MUSCLE, 0.7)));
  }

  // Ears on the head
  for (const side of [-1, 1]) {
    const earGeo = new THREE.SphereGeometry(0.06, 6, 6);
    const ear = new THREE.Mesh(earGeo, fm);
    ear.position.set(side * 0.48, 0.45, 0);
    ear.scale.set(0.4, 1, 0.8);
    group.add(ear);
  }

  createBloodPuddle(scene, x, z, 1.5);
  createBloodSmear(scene, x + 0.3, z + 0.2, 0.5, 0.6);

  group.position.set(x, 0, z);
  group.rotation.z = 0.15; // slightly tilted like it rolled
  scene.add(group);
  return group;
}

function createHeart(scene, x, z) {
  const group = new THREE.Group();

  // Heart body via LatheGeometry
  const profile = [
    new THREE.Vector2(0, -0.2),
    new THREE.Vector2(0.08, -0.15),
    new THREE.Vector2(0.15, -0.05),
    new THREE.Vector2(0.18, 0.05),
    new THREE.Vector2(0.16, 0.12),
    new THREE.Vector2(0.12, 0.18),
    new THREE.Vector2(0.06, 0.2),
    new THREE.Vector2(0, 0.17),
  ];
  const heartGeo = new THREE.LatheGeometry(profile, SPHERE_SEG + 6);
  displaceVertices(heartGeo, 0.025, 5);
  addVertexColors(heartGeo, C.ORGAN_RED, 0.18);
  const heart = new THREE.Mesh(heartGeo, organMatVC(C.ORGAN_RED, 0.9));
  heart.scale.set(1, 1, 0.7);
  heart.position.y = 0.2;
  group.add(heart);

  // Severed arteries at top
  const arteryColors = [C.FRESH_BLOOD, C.FRESH_BLOOD, C.VEIN_BLUE];
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const pts = [
      new THREE.Vector3(Math.cos(angle) * 0.04, 0.37, Math.sin(angle) * 0.04),
      new THREE.Vector3(Math.cos(angle) * 0.06, 0.42, Math.sin(angle) * 0.06),
      new THREE.Vector3(Math.cos(angle) * 0.05, 0.46, Math.sin(angle) * 0.07 + 0.02),
    ];
    const mat = i < 2 ? bloodMat(false) : new THREE.MeshStandardMaterial({ color: arteryColors[i], roughness: 0.4 });
    group.add(makeTube(pts, 0.012, mat));
  }

  createBloodPuddle(scene, x, z, 0.5);
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function createIntestines(scene, x, z) {
  const group = new THREE.Group();

  // Winding tube pile
  const points = [];
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    const angle = t * Math.PI * 6;
    const r = 0.15 + Math.sin(t * Math.PI) * 0.2;
    points.push(new THREE.Vector3(
      Math.cos(angle) * r + (Math.random() - 0.5) * 0.08,
      t * 0.12,
      Math.sin(angle) * r + (Math.random() - 0.5) * 0.08
    ));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const tubeGeo = new THREE.TubeGeometry(curve, TUBE_SEG + 16, 0.035, TUBE_RAD + 2, false);
  addVertexColors(tubeGeo, C.ORGAN_PINK, 0.15);
  const intestine = new THREE.Mesh(tubeGeo, organMatVC(C.ORGAN_PINK, 0.9));
  group.add(intestine);

  // Second overlapping tube for tangled look
  const points2 = [];
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const angle = t * Math.PI * 4 + 1.5;
    const r = 0.1 + Math.sin(t * Math.PI) * 0.15;
    points2.push(new THREE.Vector3(
      Math.cos(angle) * r + (Math.random() - 0.5) * 0.06,
      t * 0.08 + 0.03,
      Math.sin(angle) * r + (Math.random() - 0.5) * 0.06
    ));
  }
  const curve2 = new THREE.CatmullRomCurve3(points2);
  const tubeGeo2 = new THREE.TubeGeometry(curve2, TUBE_SEG, 0.03, TUBE_RAD + 2, false);
  addVertexColors(tubeGeo2, C.ORGAN_PINK, 0.12);
  const intestine2 = new THREE.Mesh(tubeGeo2, organMatVC(C.ORGAN_PINK, 0.85));
  group.add(intestine2);

  createBloodPuddle(scene, x, z, 0.7);
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function createBrain(scene, x, z) {
  const group = new THREE.Group();

  // Brain base sphere — more wrinkly and organic
  const brainGeo = new THREE.SphereGeometry(0.15, SPHERE_SEG + 6, SPHERE_SEG + 4);
  displaceVertices(brainGeo, 0.02, 8); // high frequency for wrinkly look
  addVertexColors(brainGeo, C.ORGAN_PINK, 0.2);
  const brain = new THREE.Mesh(brainGeo, organMatVC(C.ORGAN_PINK, 0.7));
  brain.scale.set(1, 0.75, 0.85);
  brain.position.y = 0.12;
  group.add(brain);

  // Wrinkle ribbons (sulci)
  for (let i = 0; i < 7; i++) {
    const ribbonPts = [];
    const startAngle = (i / 7) * Math.PI;
    for (let j = 0; j < 8; j++) {
      const t = j / 7;
      const theta = startAngle + (Math.random() - 0.5) * 0.3;
      const phi = t * Math.PI;
      const r = 0.155;
      ribbonPts.push(new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi) * 0.75 + 0.12,
        r * Math.sin(phi) * Math.sin(theta) * 0.85
      ));
    }
    group.add(makeTube(ribbonPts, 0.008, organMat(0xbb6666, 0.6)));
  }

  // Hemisphere fissure
  const fissure = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28, 0.22),
    new THREE.MeshStandardMaterial({ color: C.DARK_BLOOD, roughness: 0.8, side: THREE.DoubleSide })
  );
  fissure.position.set(0, 0.14, 0);
  fissure.rotation.y = Math.PI / 2;
  group.add(fissure);

  // Brain stem
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.04, 0.08, CYL_SEG),
    organMat(C.ORGAN_PINK, 0.5)
  );
  stem.position.set(0, 0.02, -0.05);
  group.add(stem);

  createBloodPuddle(scene, x, z, 0.4);
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function createLiver(scene, x, z) {
  const group = new THREE.Group();

  const profile = [
    new THREE.Vector2(0, -0.05),
    new THREE.Vector2(0.12, -0.03),
    new THREE.Vector2(0.2, 0.0),
    new THREE.Vector2(0.18, 0.03),
    new THREE.Vector2(0.1, 0.04),
    new THREE.Vector2(0, 0.03),
  ];
  const liverGeo = new THREE.LatheGeometry(profile, SPHERE_SEG + 4);
  liverGeo.scale(1.3, 1, 0.8);
  displaceVertices(liverGeo, 0.025, 4);
  addVertexColors(liverGeo, 0x6b2020, 0.2);
  const liver = new THREE.Mesh(liverGeo, organMatVC(0x6b2020, 0.9));
  liver.position.y = 0.05;
  group.add(liver);

  createBloodPuddle(scene, x, z, 0.5);
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function createForearm(scene, x, z, rotY = 0) {
  const group = new THREE.Group();

  // Arm shaft — more segments for organic deformation
  const armGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.8, CYL_SEG + 6, 8);
  displaceVertices(armGeo, 0.02, 4);
  addVertexColors(armGeo, C.FLESH, 0.1);
  const arm = new THREE.Mesh(armGeo, fleshMatVC(C.FLESH, 0.5));
  arm.rotation.z = Math.PI / 2;
  arm.position.y = 0.12;
  group.add(arm);

  // Hand at wrist end
  const palmGeo2 = new THREE.BoxGeometry(0.2, 0.08, 0.18, 6, 4, 6);
  displaceVertices(palmGeo2, 0.01, 6);
  addVertexColors(palmGeo2, C.FLESH_PALE, 0.06);
  const palm = new THREE.Mesh(palmGeo2, fleshMatVC(C.FLESH_PALE, 0.4));
  palm.position.set(0.5, 0.12, 0);
  group.add(palm);

  const handFm = fleshMatVC(C.FLESH_PALE, 0.4);
  for (let i = 0; i < 4; i++) {
    const len = 0.15 + Math.random() * 0.06;
    const fGeo = new THREE.CylinderGeometry(0.02, 0.025, len, CYL_SEG);
    addVertexColors(fGeo, C.FLESH_PALE, 0.05);
    const f = new THREE.Mesh(fGeo, handFm);
    f.position.set(0.6 + len / 2 * 0.85, 0.12, (i - 1.5) * 0.04);
    f.rotation.z = Math.PI / 2 + (i - 1.5) * 0.06;
    group.add(f);
  }

  // Thumb
  const thumbGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.12, CYL_SEG);
  addVertexColors(thumbGeo, C.FLESH_PALE, 0.05);
  const thumb = new THREE.Mesh(thumbGeo, handFm);
  thumb.position.set(0.45, 0.12, -0.12);
  thumb.rotation.z = Math.PI / 2 - 0.5;
  group.add(thumb);

  // Elbow stump
  addStump(group, new THREE.Vector3(-0.4, 0.12, 0), 0.12, 0.03,
    new THREE.Euler(0, 0, Math.PI / 2));

  // Dual bones at stump (radius and ulna)
  for (const offset of [-0.025, 0.025]) {
    const bone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.08, CYL_SEG),
      boneMat()
    );
    bone.position.set(-0.44, 0.12, offset);
    bone.rotation.z = Math.PI / 2;
    group.add(bone);
  }

  // Veins along surface
  for (let i = 0; i < 3; i++) {
    const zOff = (i - 1) * 0.06;
    const pts = [
      new THREE.Vector3(-0.2, 0.17, zOff),
      new THREE.Vector3(0.0, 0.18, zOff + 0.02),
      new THREE.Vector3(0.2, 0.17, zOff - 0.01),
      new THREE.Vector3(0.35, 0.16, zOff + 0.01),
    ];
    group.add(makeTube(pts, 0.004, new THREE.MeshStandardMaterial({ color: C.VEIN_BLUE, roughness: 0.5 })));
  }

  createBloodPuddle(scene, x, z, 0.9);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

function createFoot(scene, x, z, rotY = 0) {
  const group = new THREE.Group();
  const fm = fleshMat(C.FLESH, 0.4);

  // Foot body — more subdivisions for organic shape
  const footGeo = new THREE.BoxGeometry(0.18, 0.1, 0.4, 8, 4, 10);
  displaceVertices(footGeo, 0.018, 4);
  addVertexColors(footGeo, C.FLESH, 0.1);
  const foot = new THREE.Mesh(footGeo, fleshMatVC(C.FLESH, 0.4));
  foot.position.y = 0.05;
  group.add(foot);

  // Sole (lighter underside)
  const sole = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.35),
    fleshMat(C.FLESH_PALE, 0.2)
  );
  sole.rotation.x = -Math.PI / 2;
  sole.position.set(0, 0.001, 0);
  group.add(sole);

  // Toes
  for (let i = 0; i < 5; i++) {
    const size = i === 0 ? 0.03 : 0.025 - i * 0.002;
    const len = i === 0 ? 0.08 : 0.06 - i * 0.005;
    const toeGeo = new THREE.CylinderGeometry(size * 0.8, size, len, CYL_SEG);
    displaceVertices(toeGeo, 0.003, 8);
    const toe = new THREE.Mesh(toeGeo, fm);
    toe.position.set((i - 2) * 0.035, 0.04, 0.22 + (i === 0 ? 0 : -Math.abs(i - 1) * 0.015));
    toe.rotation.x = Math.PI / 2;
    group.add(toe);
  }

  // Ankle stump
  addStump(group, new THREE.Vector3(0, 0.06, -0.2), 0.08, 0.03,
    new THREE.Euler(Math.PI / 2, 0, 0));

  // Tibia bone
  const tibia = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.08, CYL_SEG),
    boneMat()
  );
  tibia.position.set(0, 0.06, -0.24);
  group.add(tibia);

  createBloodPuddle(scene, x, z, 0.6);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

function createEar(scene, x, z, rotY = 0) {
  const group = new THREE.Group();

  const earShape = new THREE.Shape();
  earShape.moveTo(0, -0.12);
  earShape.quadraticCurveTo(0.08, -0.1, 0.1, 0);
  earShape.quadraticCurveTo(0.11, 0.08, 0.06, 0.12);
  earShape.quadraticCurveTo(0.02, 0.1, 0.03, 0.05);
  earShape.quadraticCurveTo(0.04, 0, 0.02, -0.05);
  earShape.lineTo(0, -0.12);

  const earGeo = new THREE.ExtrudeGeometry(earShape, {
    depth: 0.025, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3,
    curveSegments: 12,
  });
  displaceVertices(earGeo, 0.004, 8);
  const ear = new THREE.Mesh(earGeo, fleshMat(C.FLESH, 0.4));
  ear.rotation.x = -Math.PI / 2;
  ear.position.y = 0.02;
  group.add(ear);

  // Inner ear fold
  const innerShape = new THREE.Shape();
  innerShape.moveTo(0.02, -0.06);
  innerShape.quadraticCurveTo(0.05, -0.04, 0.06, 0.02);
  innerShape.quadraticCurveTo(0.05, 0.06, 0.03, 0.04);
  innerShape.quadraticCurveTo(0.03, 0, 0.02, -0.06);

  const innerGeo = new THREE.ExtrudeGeometry(innerShape, {
    depth: 0.015, bevelEnabled: false,
  });
  const inner = new THREE.Mesh(innerGeo, fleshMat(C.FLESH_DARK, 0.3));
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.025;
  group.add(inner);

  // Bloody attachment point
  const stumpBlood = new THREE.Mesh(
    new THREE.CircleGeometry(0.03, 8),
    bloodMat(false)
  );
  stumpBlood.rotation.x = -Math.PI / 2;
  stumpBlood.position.set(0, 0.015, -0.12);
  group.add(stumpBlood);

  createBloodPuddle(scene, x, z, 0.25);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

function createTongue(scene, x, z, rotY = 0) {
  const group = new THREE.Group();

  const tongueGeo = new THREE.BoxGeometry(0.08, 0.03, 0.25, 8, 4, 12);
  // Manual bend — curve the tongue tip downward
  const pos = tongueGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = (z + 0.125) / 0.25; // 0 at back, 1 at tip
    // Narrow toward tip
    pos.setX(i, pos.getX(i) * (1 - t * 0.3));
    // Curve downward at tip
    if (t > 0.6) {
      pos.setY(i, pos.getY(i) - (t - 0.6) * 0.04);
    }
  }
  pos.needsUpdate = true;
  displaceVertices(tongueGeo, 0.008, 7);
  tongueGeo.computeVertexNormals();
  addVertexColors(tongueGeo, 0xcc6666, 0.12);

  const tongue = new THREE.Mesh(tongueGeo, organMatVC(0xcc6666, 0.8));
  tongue.position.y = 0.02;
  group.add(tongue);

  // Center line
  const lineGeo = new THREE.PlaneGeometry(0.002, 0.2);
  const line = new THREE.Mesh(lineGeo, new THREE.MeshStandardMaterial({ color: C.DARK_BLOOD, roughness: 0.5 }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, 0.04, 0.02);
  group.add(line);

  // Severed root
  const root = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, 0.03, CYL_SEG),
    organMat(C.MUSCLE, 0.8)
  );
  root.position.set(0, 0.015, -0.12);
  group.add(root);

  // Tendon roots
  for (let i = 0; i < 2; i++) {
    const pts = [
      new THREE.Vector3((i - 0.5) * 0.02, 0.015, -0.12),
      new THREE.Vector3((i - 0.5) * 0.03, -0.01, -0.15),
      new THREE.Vector3((i - 0.5) * 0.025, -0.03, -0.16),
    ];
    group.add(makeTube(pts, 0.006, organMat(C.TENDON, 0.4)));
  }

  createBloodPuddle(scene, x, z, 0.3);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

// ─── Main export ───

export function addGoreProps(scene, world, onEyeballHit) {
  const R = TABLE_RADIUS;
  const propPairs = []; // { mesh, body }

  function addProp(mesh, position, shape, mass) {
    const body = createPropBody(world, position, shape, mass);
    // Match initial rotation
    body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
    propPairs.push({ mesh, body });
    return body;
  }

  // Helper to add an eyeball with hit reaction
  function addEyeball(x, z) {
    const mesh = createEyeball(scene, x, z);
    const body = addProp(mesh, { x, y: 0.12, z }, new CANNON.Sphere(0.12), 0.05);
    body.addEventListener('collide', (event) => {
      if (event.body && event.body.isBall && onEyeballHit) onEyeballHit();
    });
    return { mesh, body };
  }

  // Helper: create gore at a safe position (avoiding cup zones)
  function sp(rawX, rawZ) { return safePos(rawX, rawZ); }

  // Deterministic pseudo-random for reproducible placement
  let _seed = 42;
  function rand() { _seed = (_seed * 16807 + 0) % 2147483647; return _seed / 2147483647; }
  function randRange(lo, hi) { return lo + rand() * (hi - lo); }
  function randPos() { const a = rand() * Math.PI * 2, r = (0.2 + rand() * 0.65) * R; return sp(Math.cos(a) * r, Math.sin(a) * r); }
  function randRot() { return rand() * Math.PI * 2; }

  // ─── Blood puddles (36) ───
  for (let i = 0; i < 36; i++) {
    const s = randPos();
    createBloodPuddle(scene, s.x, s.z, 0.4 + rand() * 0.9);
  }

  // ─── Blood smears (27) ───
  for (let i = 0; i < 27; i++) {
    const s = randPos();
    createBloodSmear(scene, s.x, s.z, randRot(), 0.5 + rand() * 0.7);
  }

  // ─── Severed heads (9) ───
  for (let i = 0; i < 9; i++) {
    const s = randPos();
    const h = createSeveredHead(scene, s.x, s.z);
    addProp(h, { x: s.x, y: 0.5, z: s.z }, new CANNON.Sphere(0.5), 2.0);
  }

  // ─── EYEBALLS (24) — scattered everywhere, all trigger hit reaction ───
  for (let i = 0; i < 24; i++) {
    const s = randPos();
    addEyeball(s.x, s.z);
  }

  // ─── Hearts (9) ───
  for (let i = 0; i < 9; i++) {
    const s = randPos();
    addProp(createHeart(scene, s.x, s.z), { x: s.x, y: 0.15, z: s.z }, new CANNON.Sphere(0.15), 0.3);
  }

  // ─── Intestines (9) ───
  for (let i = 0; i < 9; i++) {
    const s = randPos();
    addProp(createIntestines(scene, s.x, s.z), { x: s.x, y: 0.06, z: s.z }, new CANNON.Box(new CANNON.Vec3(0.3, 0.1, 0.3)), 0.8);
  }

  // ─── Brains (9) ───
  for (let i = 0; i < 9; i++) {
    const s = randPos();
    addProp(createBrain(scene, s.x, s.z), { x: s.x, y: 0.12, z: s.z }, new CANNON.Sphere(0.13), 0.4);
  }

  // ─── Livers (6) ───
  for (let i = 0; i < 6; i++) {
    const s = randPos();
    addProp(createLiver(scene, s.x, s.z), { x: s.x, y: 0.05, z: s.z }, new CANNON.Box(new CANNON.Vec3(0.2, 0.05, 0.15)), 0.5);
  }

  // ─── Forearms (9) ───
  for (let i = 0; i < 9; i++) {
    const s = randPos();
    addProp(createForearm(scene, s.x, s.z, randRot()), { x: s.x, y: 0.12, z: s.z }, new CANNON.Cylinder(0.12, 0.12, 0.8, 8), 1.5);
  }

  // ─── Feet (9) ───
  for (let i = 0; i < 9; i++) {
    const s = randPos();
    addProp(createFoot(scene, s.x, s.z, randRot()), { x: s.x, y: 0.05, z: s.z }, new CANNON.Box(new CANNON.Vec3(0.15, 0.06, 0.25)), 1.0);
  }

  // ─── Ears (9) ───
  for (let i = 0; i < 9; i++) {
    const s = randPos();
    addProp(createEar(scene, s.x, s.z, randRot()), { x: s.x, y: 0.02, z: s.z }, new CANNON.Box(new CANNON.Vec3(0.06, 0.07, 0.015)), 0.05);
  }

  // ─── Tongues (9) ───
  for (let i = 0; i < 9; i++) {
    const s = randPos();
    addProp(createTongue(scene, s.x, s.z, randRot()), { x: s.x, y: 0.02, z: s.z }, new CANNON.Box(new CANNON.Vec3(0.04, 0.02, 0.12)), 0.1);
  }

  // ─── Severed hands (9) ───
  for (let i = 0; i < 9; i++) {
    const s = randPos();
    addProp(createSeveredHand(scene, s.x, s.z, randRot()), { x: s.x, y: 0.05, z: s.z }, new CANNON.Box(new CANNON.Vec3(0.2, 0.05, 0.18)), 0.3);
  }

  // ─── Severed fingers (27) ───
  for (let i = 0; i < 27; i++) {
    const s = randPos();
    const f = createSeveredFinger(scene, s.x, s.z, randRot());
    addProp(f, { x: s.x, y: 0.06, z: s.z }, new CANNON.Cylinder(0.04, 0.04, 0.45, 6), 0.05);
  }

  // ─── Bone fragments (18) ───
  for (let i = 0; i < 18; i++) {
    const s = randPos();
    const b = createBoneFragment(scene, s.x, s.z, randRot());
    addProp(b, { x: s.x, y: 0.04, z: s.z }, new CANNON.Cylinder(0.04, 0.04, 0.5, 6), 0.1);
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
