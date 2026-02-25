import * as THREE from 'three';
import { CAMERA_FOV, TABLE_RADIUS } from '../shared/constants.js';
import { initPostProcessing, resizePostProcessing, getComposer } from './post-processing.js';

let scene, camera, renderer;
let overheadPoint = null;
let ambientLight = null;
let dustParticles = [];
let animationCallbacks = [];

export function initScene(container) {
  scene = new THREE.Scene();

  // Dark horror atmosphere
  scene.background = new THREE.Color(0x0a0505);
  scene.fog = new THREE.Fog(0x0a0505, 8, 25);

  camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 12, 0.1);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({
    antialias: false, // off for iPhone performance
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Shadows off for iPhone performance
  renderer.shadowMap.enabled = false;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;

  container.appendChild(renderer.domElement);

  // Post-processing (bloom + vignette)
  initPostProcessing(renderer, scene, camera);

  // --- Lighting ---

  // Warm ambient — slight orange tint for party feel
  ambientLight = new THREE.AmbientLight(0xffeedd, 0.5);
  scene.add(ambientLight);

  // Main overhead directional — warm white
  const directionalLight = new THREE.DirectionalLight(0xfff0e0, 1.2);
  directionalLight.position.set(1, 10, 2);
  scene.add(directionalLight);

  // Warm overhead point light — creates dramatic cup highlights
  overheadPoint = new THREE.PointLight(0xffcc88, 0.8, 25);
  overheadPoint.position.set(0, 8, 0);
  scene.add(overheadPoint);

  // Subtle rim/fill light from below table edge — highlights cup bottoms
  const rimLight = new THREE.PointLight(0xff8844, 0.25, 14);
  rimLight.position.set(0, -0.3, 0);
  scene.add(rimLight);

  // Accent side lights for depth (warm and cool for contrast)
  const warmAccent = new THREE.PointLight(0xff6633, 0.15, 20);
  warmAccent.position.set(8, 3, -5);
  scene.add(warmAccent);

  const coolAccent = new THREE.PointLight(0x4488cc, 0.1, 20);
  coolAccent.position.set(-8, 3, 5);
  scene.add(coolAccent);

  // Handle resize (iOS orientation changes)
  function handleResize() {
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(pixelRatio);
    resizePostProcessing(container.clientWidth, container.clientHeight, pixelRatio);
  }

  window.addEventListener('resize', handleResize);

  if ('onorientationchange' in window) {
    window.addEventListener('orientationchange', () => {
      setTimeout(handleResize, 150);
    });
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize);
  }

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

  // Start animation loop
  animate();

  return { scene, camera, renderer };
}

function animate() {
  requestAnimationFrame(animate);
  for (const cb of animationCallbacks) {
    cb();
  }
  const composer = getComposer();
  if (composer) {
    composer.render();
  } else if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

export function updateSceneFX() {
  const t = performance.now() * 0.001;

  // Flickering overhead light — dying fluorescent
  if (overheadPoint) {
    const flicker = 0.75 + Math.sin(t * 8.3) * 0.08 + Math.sin(t * 13.7) * 0.05 + Math.sin(t * 23.1) * 0.03;
    const dip = Math.sin(t * 0.7) * Math.sin(t * 1.3) > 0.85 ? -0.35 : 0;
    overheadPoint.intensity = Math.max(0.25, Math.min(0.95, flicker + dip));
  }

  // Ambient color shift — slow warm↔cool cycle
  if (ambientLight) {
    const shift = Math.sin(t * 0.45) * 0.5 + 0.5; // 0-1, ~14 sec period
    const r = 1.0 - shift * 0.12;
    const g = 0.93 - shift * 0.05 + shift * 0.05;
    const b = 0.87 + shift * 0.13;
    ambientLight.color.setRGB(r, g, b);
    ambientLight.intensity = 0.45 + Math.sin(t * 0.3) * 0.08;
  }

  // Floating dust particles
  for (const d of dustParticles) {
    const t2 = t * d.userData.speed + d.userData.phase;
    d.position.y = d.userData.baseY + Math.sin(t2) * 0.15;
    d.position.x += d.userData.driftX * 0.016;
    d.position.z += d.userData.driftZ * 0.016;
    const dist = Math.sqrt(d.position.x * d.position.x + d.position.z * d.position.z);
    if (dist > TABLE_RADIUS * 1.5) {
      const a = Math.random() * Math.PI * 2;
      d.position.x = Math.cos(a) * TABLE_RADIUS * 0.5;
      d.position.z = Math.sin(a) * TABLE_RADIUS * 0.5;
    }
  }
}

export function onAnimate(callback) {
  animationCallbacks.push(callback);
}

export function removeAnimateCallback(callback) {
  animationCallbacks = animationCallbacks.filter(cb => cb !== callback);
}

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
