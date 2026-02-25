import * as THREE from 'three';
import { TABLE_RADIUS, TABLE_HEIGHT } from '../shared/constants.js';

let mistSprites = [];
let mistGroup = null;

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

export function createTable(scene) {
  const woodTexture = generateWoodTexture();

  // Table surface — polished dark wood with grain texture
  const tableGeometry = new THREE.CylinderGeometry(TABLE_RADIUS, TABLE_RADIUS, TABLE_HEIGHT, 64);
  const tableMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x5c3a1e,
    map: woodTexture,
    roughness: 0.35,
    metalness: 0.0,
    clearcoat: 0.4,
    clearcoatRoughness: 0.25,
  });
  const table = new THREE.Mesh(tableGeometry, tableMaterial);
  table.position.y = -TABLE_HEIGHT / 2;
  table.receiveShadow = true;
  scene.add(table);

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
    color: 0x3d2410,
    roughness: 0.3,
    metalness: 0.05,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
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
    sprite.userData.baseOpacity = 0.15 + Math.random() * 0.25;

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
}
