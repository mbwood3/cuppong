import * as THREE from 'three';
import { CAMERA_FOV } from '../shared/constants.js';
import { initPostProcessing, resizePostProcessing, getComposer } from './post-processing.js';

let scene, camera, renderer;
let animationCallbacks = [];

export function initScene(container) {
  scene = new THREE.Scene();

  // Dark horror atmosphere
  scene.background = new THREE.Color(0x0a0505);
  scene.fog = new THREE.Fog(0x0a0505, 12, 30);

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
  const ambientLight = new THREE.AmbientLight(0xffeedd, 0.5);
  scene.add(ambientLight);

  // Main overhead directional — warm white
  const directionalLight = new THREE.DirectionalLight(0xfff0e0, 1.2);
  directionalLight.position.set(1, 10, 2);
  scene.add(directionalLight);

  // Warm overhead point light — creates dramatic cup highlights
  const overheadPoint = new THREE.PointLight(0xffcc88, 0.8, 25);
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

export function onAnimate(callback) {
  animationCallbacks.push(callback);
}

export function removeAnimateCallback(callback) {
  animationCallbacks = animationCallbacks.filter(cb => cb !== callback);
}

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
