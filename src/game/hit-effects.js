import * as THREE from 'three';
import { CUP_HEIGHT, CUP_TOP_RADIUS } from '../shared/constants.js';

let effectScene = null;
let activeParticles = [];
let activeGlows = [];
let activeSplatters = [];

export function initHitEffects(scene) {
  effectScene = scene;
}

/**
 * Play a splash + blood splatter + glow effect when a ball lands in a cup.
 * @param {number} x - cup world x
 * @param {number} y - cup world y
 * @param {number} z - cup world z
 * @param {number} color - hex color of the cup's player
 */
export function playCupHitEffect(x, y, z, color) {
  if (!effectScene) return;

  // 1. Splash particles — droplets burst upward (beer + blood mix)
  spawnSplashParticles(x, y + CUP_HEIGHT * 0.3, z, color);

  // 2. Blood splatter decals on table surface
  spawnBloodSplatters(x, z);

  // 3. Glow ring — expanding ring of light at cup position
  spawnGlowRing(x, y + CUP_HEIGHT * 0.5, z, color);

  // 4. Camera shake is handled by the caller
}

function spawnSplashParticles(x, y, z, color) {
  const PARTICLE_COUNT = 24;
  const particleColor = new THREE.Color(color);
  const splashColor = new THREE.Color(0xffcc44);
  const bloodColor = new THREE.Color(0x880011);

  const particles = [];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const size = 0.015 + Math.random() * 0.025;
    const geom = new THREE.SphereGeometry(size, 6, 6);

    // Mix of beer splash, player color, and blood red
    let pColor;
    if (i < 8) {
      pColor = particleColor.clone().lerp(splashColor, 0.5);
    } else if (i < 16) {
      pColor = splashColor.clone();
    } else {
      pColor = bloodColor.clone().lerp(new THREE.Color(0x440000), Math.random() * 0.5);
    }

    const mat = new THREE.MeshBasicMaterial({
      color: pColor,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, y, z);

    // Random upward/outward velocity — blood particles go wider and higher
    const angle = Math.random() * Math.PI * 2;
    const isBlood = i >= 16;
    const spread = CUP_TOP_RADIUS * (isBlood ? (1.0 + Math.random() * 2.5) : (0.5 + Math.random() * 1.5));
    const upSpeed = isBlood ? (2.5 + Math.random() * 4.0) : (1.5 + Math.random() * 3.0);

    mesh.userData.velocity = new THREE.Vector3(
      Math.cos(angle) * spread,
      upSpeed,
      Math.sin(angle) * spread
    );
    mesh.userData.startTime = performance.now();
    mesh.userData.lifetime = isBlood ? (700 + Math.random() * 500) : (500 + Math.random() * 400);

    effectScene.add(mesh);
    particles.push(mesh);
  }

  activeParticles.push(...particles);
}

function spawnBloodSplatters(x, z) {
  const SPLATTER_COUNT = 4 + Math.floor(Math.random() * 3); // 4-6 splatters

  for (let i = 0; i < SPLATTER_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = CUP_TOP_RADIUS * (0.8 + Math.random() * 3.0);
    const sx = x + Math.cos(angle) * dist;
    const sz = z + Math.sin(angle) * dist;

    // Random sized blood circle
    const radius = 0.04 + Math.random() * 0.1;
    const geom = new THREE.CircleGeometry(radius, 12);
    const darkness = 0.3 + Math.random() * 0.5;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(darkness * 0.5, 0, 0.01),
      transparent: true,
      opacity: 0.7 + Math.random() * 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const splatter = new THREE.Mesh(geom, mat);
    splatter.rotation.x = -Math.PI / 2;
    splatter.position.set(sx, 0.003, sz);
    splatter.rotation.z = Math.random() * Math.PI * 2;

    splatter.userData.startTime = performance.now();
    splatter.userData.lifetime = 3000 + Math.random() * 2000; // 3-5 seconds
    splatter.userData.fadeStart = 0.6;
    splatter.userData.maxOpacity = mat.opacity;

    effectScene.add(splatter);
    activeSplatters.push(splatter);
  }
}

function spawnGlowRing(x, y, z, color) {
  // Larger, more dramatic expanding ring
  const ringGeom = new THREE.RingGeometry(0.01, CUP_TOP_RADIUS * 0.8, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.position.set(x, y, z);
  ring.rotation.x = -Math.PI / 2;

  ring.userData.startTime = performance.now();
  ring.userData.lifetime = 800;
  ring.userData.type = 'glow';

  effectScene.add(ring);
  activeGlows.push(ring);

  // Second ring — slower, wider blood-red ripple
  const ring2Geom = new THREE.RingGeometry(0.01, CUP_TOP_RADIUS * 0.4, 24);
  const ring2Mat = new THREE.MeshBasicMaterial({
    color: 0xff2200,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  });
  const ring2 = new THREE.Mesh(ring2Geom, ring2Mat);
  ring2.position.set(x, y - 0.01, z);
  ring2.rotation.x = -Math.PI / 2;

  ring2.userData.startTime = performance.now() + 100; // delayed
  ring2.userData.lifetime = 1000;
  ring2.userData.type = 'glow';
  ring2.userData.baseOpacity = 0.5;

  effectScene.add(ring2);
  activeGlows.push(ring2);
}

/**
 * Call this every frame to animate active hit effects.
 */
export function updateHitEffects() {
  const now = performance.now();
  const gravity = 9.82;

  // Update splash particles
  for (let i = activeParticles.length - 1; i >= 0; i--) {
    const p = activeParticles[i];
    const progress = (now - p.userData.startTime) / p.userData.lifetime;

    if (progress >= 1) {
      effectScene.remove(p);
      p.geometry.dispose();
      p.material.dispose();
      activeParticles.splice(i, 1);
      continue;
    }

    const dt = 0.016;
    p.userData.velocity.y -= gravity * dt;
    p.position.x += p.userData.velocity.x * dt;
    p.position.y += p.userData.velocity.y * dt;
    p.position.z += p.userData.velocity.z * dt;

    p.material.opacity = 0.9 * (1 - progress);
    const scale = 1 - progress * 0.5;
    p.scale.set(scale, scale, scale);
  }

  // Update glow rings
  for (let i = activeGlows.length - 1; i >= 0; i--) {
    const g = activeGlows[i];
    const elapsed = now - g.userData.startTime;
    if (elapsed < 0) continue; // delayed start
    const progress = elapsed / g.userData.lifetime;

    if (progress >= 1) {
      effectScene.remove(g);
      g.geometry.dispose();
      g.material.dispose();
      activeGlows.splice(i, 1);
      continue;
    }

    // Expand ring — bigger for more drama
    const scale = 1 + progress * 6;
    g.scale.set(scale, scale, scale);

    const baseOpacity = g.userData.baseOpacity || 0.9;
    g.material.opacity = baseOpacity * (1 - progress);
  }

  // Update blood splatters
  for (let i = activeSplatters.length - 1; i >= 0; i--) {
    const s = activeSplatters[i];
    const progress = (now - s.userData.startTime) / s.userData.lifetime;

    if (progress >= 1) {
      effectScene.remove(s);
      s.geometry.dispose();
      s.material.dispose();
      activeSplatters.splice(i, 1);
      continue;
    }

    // Fade after fadeStart threshold
    if (progress > s.userData.fadeStart) {
      const fadeProgress = (progress - s.userData.fadeStart) / (1 - s.userData.fadeStart);
      s.material.opacity = s.userData.maxOpacity * (1 - fadeProgress);
    }
  }
}

/**
 * Shake the camera briefly. Call with the camera reference.
 */
export function cameraShake(camera, intensity = 0.06, duration = 250) {
  if (!camera) return;

  const startTime = performance.now();

  function shake() {
    const elapsed = performance.now() - startTime;
    const progress = elapsed / duration;

    if (progress >= 1) {
      return;
    }

    const decay = 1 - progress;
    const offsetX = (Math.random() - 0.5) * 2 * intensity * decay;
    const offsetY = (Math.random() - 0.5) * 2 * intensity * decay;

    camera.position.x += offsetX;
    camera.position.y += offsetY;

    requestAnimationFrame(shake);
  }

  shake();
}
