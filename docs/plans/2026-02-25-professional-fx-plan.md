# Professional FX Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add realistic gore textures, atmospheric horror lighting, and grimy environment to make the game look professionally polished.

**Architecture:** Canvas-generated normal/roughness maps applied to gore materials, enhanced vertex coloring for bruises/veins/blood pooling, ragged stump geometry, flickering lights with ambient color shift, floating dust particles, wet grimy table with pulsing blood veins.

**Tech Stack:** Three.js (MeshPhysicalMaterial normal/roughness maps, SpriteMaterial, CanvasTexture), CANNON.js (existing physics)

---

### Task 1: Procedural Gore Texture Maps

**Files:**
- Modify: `src/game/gore-props.js` (insert after line 117, before material factories)

**Step 1: Add texture generator functions**

Insert two canvas-based texture generators before the material factories (before line 118 `// ─── Material factories ───`):

```javascript
// ─── Procedural texture maps ───

// Flesh normal map — pores, wrinkles, bumpy skin surface
let _fleshNormalMap = null;
function getFleshNormalMap() {
  if (_fleshNormalMap) return _fleshNormalMap;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  // Base neutral normal (128,128,255)
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, size, size);
  // Pores — tiny dark dots scattered randomly
  for (let i = 0; i < 300; i++) {
    const px = Math.random() * size, py = Math.random() * size;
    const r = 0.5 + Math.random() * 1.5;
    const offset = Math.floor(Math.random() * 30 - 15);
    ctx.fillStyle = `rgb(${128 + offset},${128 + offset * 0.7},${240 + Math.floor(Math.random() * 15)})`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Wrinkle lines — thin wavy strokes
  for (let i = 0; i < 15; i++) {
    const y = Math.random() * size;
    const offset = Math.floor(20 + Math.random() * 20);
    ctx.strokeStyle = `rgb(${128 - offset},${128 - offset * 0.5},${245})`;
    ctx.lineWidth = 0.5 + Math.random();
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x < size; x += 8) {
      ctx.lineTo(x, y + (Math.random() - 0.5) * 6);
    }
    ctx.stroke();
  }
  // Bumpy patches — larger irregular regions
  for (let i = 0; i < 20; i++) {
    const px = Math.random() * size, py = Math.random() * size;
    const r = 3 + Math.random() * 8;
    const offset = Math.floor(Math.random() * 25 - 12);
    const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, `rgb(${128 + offset},${128 + offset},${250})`);
    grad.addColorStop(1, 'rgb(128,128,255)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  _fleshNormalMap = tex;
  return tex;
}

// Organ normal map — smoother, wetter bumps
let _organNormalMap = null;
function getOrganNormalMap() {
  if (_organNormalMap) return _organNormalMap;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, size, size);
  // Smooth undulating bumps
  for (let i = 0; i < 40; i++) {
    const px = Math.random() * size, py = Math.random() * size;
    const r = 5 + Math.random() * 15;
    const offset = Math.floor(Math.random() * 18 - 9);
    const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, `rgb(${128 + offset},${128 + offset * 0.8},${248})`);
    grad.addColorStop(0.7, `rgb(${128 + Math.floor(offset * 0.3)},${128 + Math.floor(offset * 0.2)},${252})`);
    grad.addColorStop(1, 'rgb(128,128,255)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  _organNormalMap = tex;
  return tex;
}

// Roughness map — wet/dry variation
let _fleshRoughnessMap = null;
function getFleshRoughnessMap() {
  if (_fleshRoughnessMap) return _fleshRoughnessMap;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  // Base medium roughness (gray ~160)
  ctx.fillStyle = 'rgb(160,160,160)';
  ctx.fillRect(0, 0, size, size);
  // Wet patches (darker = smoother/wetter)
  for (let i = 0; i < 25; i++) {
    const px = Math.random() * size, py = Math.random() * size;
    const r = 4 + Math.random() * 18;
    const wetness = Math.floor(60 + Math.random() * 50); // dark = wet
    const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, `rgb(${wetness},${wetness},${wetness})`);
    grad.addColorStop(1, 'rgb(160,160,160)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Dry rough patches (lighter = rougher)
  for (let i = 0; i < 10; i++) {
    const px = Math.random() * size, py = Math.random() * size;
    const r = 3 + Math.random() * 10;
    const dryness = Math.floor(190 + Math.random() * 40);
    ctx.fillStyle = `rgb(${dryness},${dryness},${dryness})`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  _fleshRoughnessMap = tex;
  return tex;
}
```

**Step 2: Apply texture maps to material factories**

Update `fleshMat` (line ~120) to use the normal + roughness maps:

```javascript
function fleshMat(color = C.FLESH, wetness = 0.5) {
  return new THREE.MeshPhysicalMaterial({
    color,
    vertexColors: false,
    roughness: 0.65 - wetness * 0.35,
    roughnessMap: getFleshRoughnessMap(),
    normalMap: getFleshNormalMap(),
    normalScale: new THREE.Vector2(0.8, 0.8),
    metalness: 0.0,
    clearcoat: wetness * 0.4,
    clearcoatRoughness: 0.3,
    sheen: 0.4,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(0xff5533),
  });
}
```

Update `organMat` (line ~143) to use organ normal map + higher clearcoat:

```javascript
function organMat(color = C.ORGAN_RED, wetness = 0.8) {
  return new THREE.MeshPhysicalMaterial({
    color,
    vertexColors: false,
    roughness: 0.15,
    normalMap: getOrganNormalMap(),
    normalScale: new THREE.Vector2(0.5, 0.5),
    metalness: 0.0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08,
    sheen: 0.6,
    sheenRoughness: 0.25,
    sheenColor: new THREE.Color(0xff3311),
  });
}
```

Update `bloodMat` (line ~163) to add subtle emissive on fresh blood:

```javascript
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
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add src/game/gore-props.js
git commit -m "feat: add procedural normal/roughness maps to gore materials"
```

---

### Task 2: Enhanced Vertex Colors (Bruises, Veins, Blood Pooling)

**Files:**
- Modify: `src/game/gore-props.js` — replace `addVertexColors` function (lines 197-212)

**Step 1: Rewrite addVertexColors with bruises, veins, and blood pooling**

Replace the `addVertexColors` function:

```javascript
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
```

**Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/game/gore-props.js
git commit -m "feat: enhanced vertex colors with bruises, veins, blood pooling"
```

---

### Task 3: Ragged Stump Geometry

**Files:**
- Modify: `src/game/gore-props.js` — replace `addStump` function (lines 220-256)

**Step 1: Rewrite addStump with jagged edges and dangling flesh**

Replace the `addStump` function:

```javascript
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
```

**Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/game/gore-props.js
git commit -m "feat: ragged stump geometry with jagged edges and dangling flesh"
```

---

### Task 4: Flickering Light & Ambient Color Shift

**Files:**
- Modify: `src/game/scene.js` — add light animation exports

**Step 1: Store light references and add update function**

Replace scene.js with updated version that stores light refs and exports an `updateSceneFX` function:

After the light creation section (after line 71), add module-level refs and the update function. The overhead point light (line 55-57) and ambient light (line 46-47) need to be stored in module-scope variables.

Move `overheadPoint` and `ambientLight` declarations to module scope (outside `initScene`), assign them inside `initScene`, then add:

```javascript
let overheadPoint = null;
let ambientLight = null;

// In initScene, replace const with assignment:
// ambientLight = new THREE.AmbientLight(0xffeedd, 0.5);
// overheadPoint = new THREE.PointLight(0xffcc88, 0.8, 25);

export function updateSceneFX() {
  const t = performance.now() * 0.001;

  // Flickering overhead light — dying fluorescent
  if (overheadPoint) {
    // Base flicker: oscillate 0.6-0.9
    const flicker = 0.75 + Math.sin(t * 8.3) * 0.08 + Math.sin(t * 13.7) * 0.05 + Math.sin(t * 23.1) * 0.03;
    // Occasional dip to 0.3 (random spike every ~3-5 sec)
    const dip = Math.sin(t * 0.7) * Math.sin(t * 1.3) > 0.85 ? -0.35 : 0;
    overheadPoint.intensity = Math.max(0.25, Math.min(0.95, flicker + dip));
  }

  // Ambient color shift — slow warm↔cool cycle
  if (ambientLight) {
    const shift = Math.sin(t * 0.45) * 0.5 + 0.5; // 0-1, ~14 sec period
    // Warm orange (0xffeedd) → cool blue-ish (0xddeeff)
    const r = 1.0 - shift * 0.12;
    const g = 0.93 - shift * 0.05 + shift * 0.05;
    const b = 0.87 + shift * 0.13;
    ambientLight.color.setRGB(r, g, b);
    ambientLight.intensity = 0.45 + Math.sin(t * 0.3) * 0.08;
  }
}
```

**Step 2: Update fog distance**

Change fog line from:
```javascript
scene.fog = new THREE.Fog(0x0a0505, 12, 30);
```
To:
```javascript
scene.fog = new THREE.Fog(0x0a0505, 8, 25);
```

**Step 3: Hook updateSceneFX into animation loop in game.js**

In `src/screens/game.js`, import `updateSceneFX` and call it in the onAnimate callback alongside `updateTableMist()`.

**Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/game/scene.js src/screens/game.js
git commit -m "feat: flickering overhead light, ambient color shift, closer fog"
```

---

### Task 5: Floating Dust Particles

**Files:**
- Modify: `src/game/scene.js` — add dust particle system

**Step 1: Add dust particle system to initScene**

After the lighting section in `initScene`, add a dust sprite system:

```javascript
// --- Floating Dust/Ash Particles ---
const dustGroup = new THREE.Group();
const dustTex = (() => {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  grad.addColorStop(0, 'rgba(200,180,150,0.6)');
  grad.addColorStop(1, 'rgba(200,180,150,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 16);
  return new THREE.CanvasTexture(c);
})();

const DUST_COUNT = 45;
const dustParticles = [];
for (let i = 0; i < DUST_COUNT; i++) {
  const mat = new THREE.SpriteMaterial({
    map: dustTex, transparent: true, opacity: 0.15 + Math.random() * 0.2,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * TABLE_RADIUS * 1.2;
  sprite.position.set(Math.cos(angle) * radius, 0.5 + Math.random() * 3, Math.sin(angle) * radius);
  const s = 0.03 + Math.random() * 0.06;
  sprite.scale.set(s, s, 1);
  sprite.userData.baseY = sprite.position.y;
  sprite.userData.phase = Math.random() * Math.PI * 2;
  sprite.userData.driftX = (Math.random() - 0.5) * 0.02;
  sprite.userData.driftZ = (Math.random() - 0.5) * 0.02;
  sprite.userData.speed = 0.1 + Math.random() * 0.2;
  dustGroup.add(sprite);
  dustParticles.push(sprite);
}
scene.add(dustGroup);
```

**Step 2: Add dust update to updateSceneFX**

Append to `updateSceneFX`:

```javascript
// Floating dust particles
for (const d of dustParticles) {
  const t2 = t * d.userData.speed + d.userData.phase;
  d.position.y = d.userData.baseY + Math.sin(t2) * 0.15;
  d.position.x += d.userData.driftX * 0.016;
  d.position.z += d.userData.driftZ * 0.016;
  // Wrap around if drifted too far
  const dist = Math.sqrt(d.position.x * d.position.x + d.position.z * d.position.z);
  if (dist > TABLE_RADIUS * 1.5) {
    const a = Math.random() * Math.PI * 2;
    d.position.x = Math.cos(a) * TABLE_RADIUS * 0.5;
    d.position.z = Math.sin(a) * TABLE_RADIUS * 0.5;
  }
}
```

Import `TABLE_RADIUS` from constants in scene.js.

**Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/game/scene.js
git commit -m "feat: floating dust/ash particles in atmosphere"
```

---

### Task 6: Wet Table, Blood Veins, Grungy Rim

**Files:**
- Modify: `src/game/table.js` — table material upgrades, blood vein texture, rim grunge

**Step 1: Add blood vein texture generator**

Add after `generateMistTexture` function:

```javascript
// Blood vein texture — branching dark red lines on table surface
function generateBloodVeinTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  // Transparent base
  ctx.clearRect(0, 0, size, size);

  // Draw branching vein lines
  function drawVein(startX, startY, angle, length, width, depth) {
    if (depth > 5 || length < 5 || width < 0.3) return;
    ctx.strokeStyle = `rgba(80, 5, 5, ${0.15 + depth * 0.03})`;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    let cx = startX, cy = startY;
    const steps = Math.ceil(length / 8);
    for (let i = 0; i < steps; i++) {
      angle += (Math.random() - 0.5) * 0.6;
      cx += Math.cos(angle) * 8;
      cy += Math.sin(angle) * 8;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    // Branch
    if (Math.random() < 0.6 && depth < 4) {
      drawVein(cx, cy, angle + 0.5 + Math.random() * 0.5, length * 0.6, width * 0.6, depth + 1);
    }
    if (Math.random() < 0.6 && depth < 4) {
      drawVein(cx, cy, angle - 0.5 - Math.random() * 0.5, length * 0.6, width * 0.6, depth + 1);
    }
  }

  // Spawn veins from random edge points
  for (let i = 0; i < 8; i++) {
    const edge = Math.floor(Math.random() * 4);
    let sx, sy, sa;
    if (edge === 0) { sx = 0; sy = Math.random() * size; sa = 0; }
    else if (edge === 1) { sx = size; sy = Math.random() * size; sa = Math.PI; }
    else if (edge === 2) { sx = Math.random() * size; sy = 0; sa = Math.PI / 2; }
    else { sx = Math.random() * size; sy = size; sa = -Math.PI / 2; }
    drawVein(sx, sy, sa + (Math.random() - 0.5) * 0.8, 80 + Math.random() * 150, 1.5 + Math.random() * 1.5, 0);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
```

**Step 2: Update table material for wet look**

In `createTable`, update the table material:

```javascript
const tableMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x4a2818,          // slightly darker
  map: woodTexture,
  roughness: 0.2,            // was 0.35 — wetter
  metalness: 0.0,
  clearcoat: 0.75,           // was 0.4 — shiny wet surface
  clearcoatRoughness: 0.15,  // was 0.25
});
```

**Step 3: Add blood vein overlay plane on table surface**

After creating the table mesh, add a vein overlay:

```javascript
// Blood vein overlay
const veinTexture = generateBloodVeinTexture();
const veinGeometry = new THREE.PlaneGeometry(TABLE_RADIUS * 2, TABLE_RADIUS * 2);
const veinMaterial = new THREE.MeshBasicMaterial({
  map: veinTexture,
  transparent: true,
  opacity: 0.15,
  depthWrite: false,
  blending: THREE.NormalBlending,
});
const veinOverlay = new THREE.Mesh(veinGeometry, veinMaterial);
veinOverlay.rotation.x = -Math.PI / 2;
veinOverlay.position.y = 0.003;
scene.add(veinOverlay);
```

Store `veinMaterial` in module scope so `updateTableMist` can pulse its opacity.

**Step 4: Update rim material for grungy look**

```javascript
const rimMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x2a1608,          // darker
  roughness: 0.6,            // was 0.3 — rougher/worn
  metalness: 0.02,
  clearcoat: 0.15,           // was 0.6 — much less polished
  clearcoatRoughness: 0.5,   // was 0.2
});
```

**Step 5: Add vein pulse to updateTableMist**

In `updateTableMist()`, add vein opacity pulsing:

```javascript
// Pulse blood veins synced with time
if (veinMat) {
  veinMat.opacity = 0.12 + Math.sin(t * 1.5) * 0.04;
}
```

**Step 6: Increase mist opacity slightly**

Change `baseOpacity` range from `0.15 + Math.random() * 0.25` to `0.2 + Math.random() * 0.3`.

**Step 7: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 8: Commit**

```bash
git add src/game/table.js
git commit -m "feat: wet table surface, blood veins, grungy rim"
```

---

### Task 7: Final Integration & Deploy

**Files:**
- All modified files

**Step 1: Full build**

Run: `npm run build`
Expected: Build succeeds, no errors.

**Step 2: Final commit and push**

```bash
git add -A
git commit -m "feat: professional FX — gore textures, atmospheric lighting, grimy environment"
git push
```

Expected: Push succeeds, Railway auto-deploys.
