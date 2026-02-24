import * as THREE from 'three';
import { CUP_HEIGHT, CUP_TOP_RADIUS } from '../shared/constants.js';

let effectScene = null;
let activeParticles = [];
let activeGlows = [];

export function initHitEffects(scene) {
  effectScene = scene;
}

/**
 * Play a splash + glow effect when a ball lands in a cup.
 * @param {number} x - cup world x
 * @param {number} y - cup world y
 * @param {number} z - cup world z
 * @param {number} color - hex color of the cup's player
 */
export function playCupHitEffect(x, y, z, color) {
  if (!effectScene) return;

  // 1. Splash particles — small droplets burst upward
  spawnSplashParticles(x, y + CUP_HEIGHT * 0.3, z, color);

  // 2. Glow ring — expanding ring of light at cup position
  spawnGlowRing(x, y + CUP_HEIGHT * 0.5, z, color);

  // 3. Camera shake is handled by the caller
}

function spawnSplashParticles(x, y, z, color) {
  const PARTICLE_COUNT = 16;
  const particleColor = new THREE.Color(color);
  // Mix particle color with white/gold for beer-splash look
  const splashColor = new THREE.Color(0xffcc44);
  particleColor.lerp(splashColor, 0.5);

  const particles = [];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Small sphere particles
    const size = 0.015 + Math.random() * 0.02;
    const geom = new THREE.SphereGeometry(size, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: i < PARTICLE_COUNT / 2 ? particleColor : splashColor,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geom, mat);

    // Start at cup position
    mesh.position.set(x, y, z);

    // Random upward/outward velocity
    const angle = Math.random() * Math.PI * 2;
    const spread = CUP_TOP_RADIUS * (0.5 + Math.random() * 1.5);
    const upSpeed = 1.5 + Math.random() * 3.0;

    mesh.userData.velocity = new THREE.Vector3(
      Math.cos(angle) * spread,
      upSpeed,
      Math.sin(angle) * spread
    );
    mesh.userData.startTime = performance.now();
    mesh.userData.lifetime = 500 + Math.random() * 400; // 500-900ms

    effectScene.add(mesh);
    particles.push(mesh);
  }

  activeParticles.push(...particles);
}

function spawnGlowRing(x, y, z, color) {
  // Expanding ring of light
  const ringGeom = new THREE.RingGeometry(0.01, CUP_TOP_RADIUS * 0.5, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.position.set(x, y, z);
  ring.rotation.x = -Math.PI / 2;

  ring.userData.startTime = performance.now();
  ring.userData.lifetime = 600;
  ring.userData.type = 'glow';

  effectScene.add(ring);
  activeGlows.push(ring);
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
    const elapsed = (now - p.userData.startTime) / 1000; // seconds
    const progress = (now - p.userData.startTime) / p.userData.lifetime;

    if (progress >= 1) {
      effectScene.remove(p);
      p.geometry.dispose();
      p.material.dispose();
      activeParticles.splice(i, 1);
      continue;
    }

    // Apply velocity + gravity
    const dt = 0.016; // ~60fps
    p.userData.velocity.y -= gravity * dt;
    p.position.x += p.userData.velocity.x * dt;
    p.position.y += p.userData.velocity.y * dt;
    p.position.z += p.userData.velocity.z * dt;

    // Fade out
    p.material.opacity = 0.9 * (1 - progress);

    // Shrink slightly
    const scale = 1 - progress * 0.5;
    p.scale.set(scale, scale, scale);
  }

  // Update glow rings
  for (let i = activeGlows.length - 1; i >= 0; i--) {
    const g = activeGlows[i];
    const progress = (now - g.userData.startTime) / g.userData.lifetime;

    if (progress >= 1) {
      effectScene.remove(g);
      g.geometry.dispose();
      g.material.dispose();
      activeGlows.splice(i, 1);
      continue;
    }

    // Expand ring
    const scale = 1 + progress * 4;
    g.scale.set(scale, scale, scale);

    // Fade out
    g.material.opacity = 0.8 * (1 - progress);
  }
}

/**
 * Shake the camera briefly. Call with the camera reference.
 */
export function cameraShake(camera, intensity = 0.04, duration = 200) {
  if (!camera) return;

  const originalPos = camera.position.clone();
  const startTime = performance.now();

  function shake() {
    const elapsed = performance.now() - startTime;
    const progress = elapsed / duration;

    if (progress >= 1) {
      // Don't restore — camera controller will lerp back naturally
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
