import * as THREE from 'three';
import { CAMERA_FOV, TABLE_RADIUS } from '../shared/constants.js';
import { initPostProcessing, resizePostProcessing, getComposer } from './post-processing.js';
import { getTheme } from '../shared/themes.js';

let scene, camera, renderer;
let overheadPoint = null;
let ambientLight = null;
let dustParticles = [];
let animationCallbacks = [];

export function initScene(container) {
  const theme = getTheme();

  scene = new THREE.Scene();

  // Theme-driven atmosphere
  scene.background = new THREE.Color(theme.scene.background);
  scene.fog = new THREE.Fog(theme.scene.fogColor, theme.scene.fogNear, theme.scene.fogFar);

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
  renderer.toneMappingExposure = theme.scene.toneMappingExposure;

  container.appendChild(renderer.domElement);

  // Post-processing (bloom + vignette) — theme-aware
  initPostProcessing(renderer, scene, camera);

  // --- Lighting (all from theme) ---

  ambientLight = new THREE.AmbientLight(theme.lighting.ambient.color, theme.lighting.ambient.intensity);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(theme.lighting.directional.color, theme.lighting.directional.intensity);
  directionalLight.position.set(...theme.lighting.directional.position);
  scene.add(directionalLight);

  overheadPoint = new THREE.PointLight(theme.lighting.overhead.color, theme.lighting.overhead.intensity, theme.lighting.overhead.range);
  overheadPoint.position.set(...theme.lighting.overhead.position);
  scene.add(overheadPoint);

  const rimLight = new THREE.PointLight(theme.lighting.rim.color, theme.lighting.rim.intensity, theme.lighting.rim.range);
  rimLight.position.set(...theme.lighting.rim.position);
  scene.add(rimLight);

  const warmAccent = new THREE.PointLight(theme.lighting.warmAccent.color, theme.lighting.warmAccent.intensity, theme.lighting.warmAccent.range);
  warmAccent.position.set(...theme.lighting.warmAccent.position);
  scene.add(warmAccent);

  const coolAccent = new THREE.PointLight(theme.lighting.coolAccent.color, theme.lighting.coolAccent.intensity, theme.lighting.coolAccent.range);
  coolAccent.position.set(...theme.lighting.coolAccent.position);
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

  // --- Floating Particles (dust for horror, snowflakes for christmas) ---
  const dustGroup = new THREE.Group();
  const dustTex = (() => {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, theme.atmosphere.dustColor);
    grad.addColorStop(1, theme.atmosphere.dustColor.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 16);
    return new THREE.CanvasTexture(c);
  })();

  const DUST_COUNT = theme.atmosphere.dustCount;
  const isSnow = theme.atmosphere.dustDrift === 'snow';

  for (let i = 0; i < DUST_COUNT; i++) {
    const mat = new THREE.SpriteMaterial({
      map: dustTex, transparent: true, opacity: 0.15 + Math.random() * 0.2,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * TABLE_RADIUS * 1.2;
    sprite.position.set(Math.cos(angle) * radius, 0.5 + Math.random() * 3, Math.sin(angle) * radius);
    const sMin = theme.atmosphere.dustSize[0];
    const sMax = theme.atmosphere.dustSize[1];
    const s = sMin + Math.random() * (sMax - sMin);
    sprite.scale.set(s, s, 1);
    sprite.userData.baseY = sprite.position.y;
    sprite.userData.phase = Math.random() * Math.PI * 2;
    sprite.userData.driftX = (Math.random() - 0.5) * 0.02;
    sprite.userData.driftZ = (Math.random() - 0.5) * 0.02;
    sprite.userData.speed = 0.1 + Math.random() * 0.2;
    sprite.userData.isSnow = isSnow;
    // Snow: add gentle downward drift
    if (isSnow) {
      sprite.userData.fallSpeed = 0.15 + Math.random() * 0.25;
      sprite.userData.swirlRadius = 0.3 + Math.random() * 0.5;
      sprite.userData.swirlSpeed = 0.3 + Math.random() * 0.4;
    }
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
  const theme = getTheme();

  // Overhead light animation — style depends on theme
  if (overheadPoint) {
    if (theme.lighting.flickerStyle === 'fluorescent') {
      // Harsh dying-fluorescent flicker
      const flicker = 0.75 + Math.sin(t * 8.3) * 0.08 + Math.sin(t * 13.7) * 0.05 + Math.sin(t * 23.1) * 0.03;
      const dip = Math.sin(t * 0.7) * Math.sin(t * 1.3) > 0.85 ? -0.35 : 0;
      overheadPoint.intensity = Math.max(0.25, Math.min(0.95, flicker + dip));
    } else if (theme.lighting.flickerStyle === 'twinkle') {
      // Gentle sine twinkle — warm Christmas lights feel
      const base = theme.lighting.overhead.intensity;
      const twinkle = Math.sin(t * 2.5) * 0.05 + Math.sin(t * 4.1) * 0.03;
      overheadPoint.intensity = base * (0.9 + twinkle);
    }
  }

  // Ambient color shift — slow warm↔cool cycle
  if (ambientLight) {
    const shift = theme.lighting.ambientShift;
    const period = shift.period || 14;
    const warm = new THREE.Color(shift.warm);
    const cool = new THREE.Color(shift.cool);
    const mix = Math.sin(t * (Math.PI * 2 / period)) * 0.5 + 0.5;
    ambientLight.color.copy(warm).lerp(cool, mix);
    ambientLight.intensity = theme.lighting.ambient.intensity + Math.sin(t * 0.3) * 0.08;
  }

  // Floating particles
  for (const d of dustParticles) {
    if (d.userData.isSnow) {
      // Snow: gentle downward drift + horizontal swirl
      const t2 = t * d.userData.swirlSpeed + d.userData.phase;
      d.position.y -= d.userData.fallSpeed * 0.016;
      d.position.x += Math.sin(t2) * d.userData.swirlRadius * 0.016;
      d.position.z += Math.cos(t2 * 0.7) * d.userData.swirlRadius * 0.016;

      // Reset snowflake when it falls below table
      if (d.position.y < -0.2) {
        d.position.y = 3.5 + Math.random() * 1.5;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * TABLE_RADIUS * 1.2;
        d.position.x = Math.cos(a) * r;
        d.position.z = Math.sin(a) * r;
      }
    } else {
      // Horror: horizontal float
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
