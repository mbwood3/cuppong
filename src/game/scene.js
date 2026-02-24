import * as THREE from 'three';
import { CAMERA_FOV } from '../shared/constants.js';

let scene, camera, renderer;
let animationCallbacks = [];

// Detect mobile/tablet devices for performance tuning
const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
  navigator.userAgent
) || (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);

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
    antialias: !isMobile,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  if (isMobile) {
    renderer.shadowMap.enabled = false;
  } else {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;

  container.appendChild(renderer.domElement);

  // --- Lighting ---

  // Warm ambient — slight orange tint for party feel
  const ambientLight = new THREE.AmbientLight(0xffeedd, isMobile ? 0.6 : 0.45);
  scene.add(ambientLight);

  // Main overhead directional — warm white
  const directionalLight = new THREE.DirectionalLight(0xfff0e0, 1.2);
  directionalLight.position.set(1, 10, 2);

  if (!isMobile) {
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 30;
    directionalLight.shadow.camera.left = -12;
    directionalLight.shadow.camera.right = 12;
    directionalLight.shadow.camera.top = 12;
    directionalLight.shadow.camera.bottom = -12;
    directionalLight.shadow.bias = -0.001;
  }
  scene.add(directionalLight);

  // Warm overhead point light — creates dramatic cup highlights
  const overheadPoint = new THREE.PointLight(0xffcc88, 0.8, 25);
  overheadPoint.position.set(0, 8, 0);
  if (!isMobile) {
    overheadPoint.castShadow = true;
    overheadPoint.shadow.mapSize.width = 512;
    overheadPoint.shadow.mapSize.height = 512;
  }
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

  // Handle resize (desktop + iOS orientation changes)
  function handleResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
  if (renderer && scene && camera) {
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
export function getIsMobile() { return isMobile; }
