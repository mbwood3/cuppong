import * as THREE from 'three';
import { CAMERA_FOV } from '../shared/constants.js';

let scene, camera, renderer;
let animationCallbacks = [];

export function initScene(container) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.Fog(0x1a1a2e, 8, 15);

  camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 5, 0.1);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  container.appendChild(renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
  directionalLight.position.set(2, 8, 2);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 1024;
  directionalLight.shadow.mapSize.height = 1024;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 20;
  directionalLight.shadow.camera.left = -5;
  directionalLight.shadow.camera.right = 5;
  directionalLight.shadow.camera.top = 5;
  directionalLight.shadow.camera.bottom = -5;
  scene.add(directionalLight);

  // Subtle point light for warmth
  const pointLight = new THREE.PointLight(0xffaa44, 0.3, 10);
  pointLight.position.set(0, 3, 0);
  scene.add(pointLight);

  // Handle resize
  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

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
