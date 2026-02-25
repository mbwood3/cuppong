import * as THREE from 'three';
import { TABLE_RADIUS, TABLE_HEIGHT } from '../shared/constants.js';

let mistSprites = [];
let mistGroup = null;
let veinMat = null;

/**
 * Generate a dark wood grain texture via canvas.
 */
function generateWoodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Base dark brown
  ctx.fillStyle = '#4a2a14';
  ctx.fillRect(0, 0, 512, 512);

  // Wood grain lines — many thin dark streaks
  for (let i = 0; i < 80; i++) {
    const y = Math.random() * 512;
    const width = 0.5 + Math.random() * 2;
    const alpha = 0.08 + Math.random() * 0.15;
    ctx.strokeStyle = `rgba(20, 10, 5, ${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(0, y);
    // Slight waviness
    for (let x = 0; x < 512; x += 20) {
      const dy = (Math.random() - 0.5) * 4;
      ctx.lineTo(x, y + dy);
    }
    ctx.stroke();
  }

  // Lighter grain highlights
  for (let i = 0; i < 30; i++) {
    const y = Math.random() * 512;
    const width = 0.3 + Math.random() * 1;
    const alpha = 0.04 + Math.random() * 0.08;
    ctx.strokeStyle = `rgba(120, 70, 30, ${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x < 512; x += 25) {
      const dy = (Math.random() - 0.5) * 3;
      ctx.lineTo(x, y + dy);
    }
    ctx.stroke();
  }

  // Subtle knots
  for (let i = 0; i < 4; i++) {
    const kx = 50 + Math.random() * 412;
    const ky = 50 + Math.random() * 412;
    const kr = 8 + Math.random() * 15;
    const gradient = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
    gradient.addColorStop(0, 'rgba(30, 15, 5, 0.3)');
    gradient.addColorStop(0.6, 'rgba(40, 20, 10, 0.15)');
    gradient.addColorStop(1, 'rgba(50, 25, 12, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(kx, ky, kr * 1.3, kr, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

/**
 * Generate a soft radial gradient sprite texture for mist particles.
 */
function generateMistTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(40, 15, 10, 0.35)');
  gradient.addColorStop(0.5, 'rgba(30, 10, 8, 0.15)');
  gradient.addColorStop(1, 'rgba(20, 5, 5, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// Blood vein texture — branching dark red lines on table surface
function generateBloodVeinTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

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
    if (Math.random() < 0.6 && depth < 4) {
      drawVein(cx, cy, angle + 0.5 + Math.random() * 0.5, length * 0.6, width * 0.6, depth + 1);
    }
    if (Math.random() < 0.6 && depth < 4) {
      drawVein(cx, cy, angle - 0.5 - Math.random() * 0.5, length * 0.6, width * 0.6, depth + 1);
    }
  }

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

export function createTable(scene) {
  const woodTexture = generateWoodTexture();

  // Table surface — polished dark wood with grain texture
  const tableGeometry = new THREE.CylinderGeometry(TABLE_RADIUS, TABLE_RADIUS, TABLE_HEIGHT, 64);
  const tableMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x4a2818,
    map: woodTexture,
    roughness: 0.2,
    metalness: 0.0,
    clearcoat: 0.75,
    clearcoatRoughness: 0.15,
  });
  const table = new THREE.Mesh(tableGeometry, tableMaterial);
  table.position.y = -TABLE_HEIGHT / 2;
  table.receiveShadow = true;
  scene.add(table);

  // Blood vein overlay
  const veinTexture = generateBloodVeinTexture();
  const veinGeometry = new THREE.PlaneGeometry(TABLE_RADIUS * 2, TABLE_RADIUS * 2);
  veinMat = new THREE.MeshBasicMaterial({
    map: veinTexture,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
  });
  const veinOverlay = new THREE.Mesh(veinGeometry, veinMat);
  veinOverlay.rotation.x = -Math.PI / 2;
  veinOverlay.position.y = 0.003;
  scene.add(veinOverlay);

  // Inner ring marking where cups go (subtle darker circle)
  const ringGeometry = new THREE.RingGeometry(TABLE_RADIUS * 0.72, TABLE_RADIUS * 0.75, 64);
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a2a12,
    roughness: 0.5,
    metalness: 0.0,
    transparent: true,
    opacity: 0.3,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  scene.add(ring);

  // Table edge rim — thick polished wood border
  const rimGeometry = new THREE.TorusGeometry(TABLE_RADIUS, 0.09, 12, 64);
  const rimMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x2a1608,
    roughness: 0.6,
    metalness: 0.02,
    clearcoat: 0.15,
    clearcoatRoughness: 0.5,
  });
  const rim = new THREE.Mesh(rimGeometry, rimMaterial);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0;
  rim.castShadow = true;
  scene.add(rim);

  // Floor beneath table — dark warm surface
  const floorGeometry = new THREE.PlaneGeometry(50, 50);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1210,
    roughness: 0.85,
    metalness: 0.0,
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  scene.add(floor);

  // --- Table Mist / Fog Particles ---
  mistGroup = new THREE.Group();
  const mistTexture = generateMistTexture();
  const mistMaterial = new THREE.SpriteMaterial({
    map: mistTexture,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const MIST_COUNT = 35;
  for (let i = 0; i < MIST_COUNT; i++) {
    const sprite = new THREE.Sprite(mistMaterial.clone());
    // Random position across table surface
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * TABLE_RADIUS * 0.85;
    sprite.position.set(
      Math.cos(angle) * radius,
      0.05 + Math.random() * 0.25, // just above table
      Math.sin(angle) * radius
    );
    const size = 1.5 + Math.random() * 2.5;
    sprite.scale.set(size, size, 1);

    // Store animation params
    sprite.userData.baseY = sprite.position.y;
    sprite.userData.baseX = sprite.position.x;
    sprite.userData.baseZ = sprite.position.z;
    sprite.userData.phase = Math.random() * Math.PI * 2;
    sprite.userData.speed = 0.2 + Math.random() * 0.3;
    sprite.userData.driftSpeed = 0.05 + Math.random() * 0.1;
    sprite.userData.baseOpacity = 0.2 + Math.random() * 0.3;

    mistGroup.add(sprite);
    mistSprites.push(sprite);
  }
  scene.add(mistGroup);

  return table;
}

/**
 * Call every frame to animate table mist.
 */
export function updateTableMist() {
  if (!mistSprites.length) return;
  const t = performance.now() * 0.001;

  for (const sprite of mistSprites) {
    const d = sprite.userData;
    // Gentle sine-wave bob
    sprite.position.y = d.baseY + Math.sin(t * d.speed + d.phase) * 0.08;
    // Slow drift
    sprite.position.x = d.baseX + Math.sin(t * d.driftSpeed + d.phase) * 0.3;
    sprite.position.z = d.baseZ + Math.cos(t * d.driftSpeed + d.phase * 1.3) * 0.3;
    // Pulse opacity
    sprite.material.opacity = d.baseOpacity + Math.sin(t * d.speed * 0.5 + d.phase) * 0.08;
  }

  // Pulse blood veins
  if (veinMat) {
    veinMat.opacity = 0.12 + Math.sin(t * 1.5) * 0.04;
  }
}
