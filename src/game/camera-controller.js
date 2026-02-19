import * as THREE from 'three';
import { PLAYER_ANGLES, PLAYER_DISTANCE, CAMERA_OVERHEAD } from '../shared/constants.js';

let camera = null;
let targetPosition = new THREE.Vector3();
let targetLookAt = new THREE.Vector3();
let currentLookAt = new THREE.Vector3(0, 0, 0);
let lerpSpeed = 3;

export function initCameraController(cam) {
  camera = cam;
  targetPosition.copy(camera.position);
  targetLookAt.set(0, 0, 0);
  currentLookAt.set(0, 0, 0);
}

export function setCameraOverhead() {
  targetPosition.set(CAMERA_OVERHEAD.x, CAMERA_OVERHEAD.y, CAMERA_OVERHEAD.z + 0.1);
  targetLookAt.set(0, 0, 0);
  lerpSpeed = 3;
}

export function setCameraThrowView(throwerIndex, targetIndex) {
  const throwerAngle = PLAYER_ANGLES[throwerIndex];
  const targetAngle = PLAYER_ANGLES[targetIndex];

  // Camera behind the thrower, looking toward target
  const camDist = PLAYER_DISTANCE + 0.8;
  const camX = Math.cos(throwerAngle) * camDist;
  const camZ = -Math.sin(throwerAngle) * camDist;

  // Look at the target's cups
  const lookX = Math.cos(targetAngle) * (PLAYER_DISTANCE * 0.5);
  const lookZ = -Math.sin(targetAngle) * (PLAYER_DISTANCE * 0.5);

  targetPosition.set(camX, 1.8, camZ);
  targetLookAt.set(lookX, 0.1, lookZ);
  lerpSpeed = 3;
}

export function setCameraSpectatorView(throwerIndex, targetIndex) {
  // Side view of the action
  const throwerAngle = PLAYER_ANGLES[throwerIndex];
  const targetAngle = PLAYER_ANGLES[targetIndex];

  // Position camera to the side of the throw path
  const midAngle = (throwerAngle + targetAngle) / 2;
  const perpAngle = midAngle + Math.PI / 2;

  const camX = Math.cos(perpAngle) * 3;
  const camZ = -Math.sin(perpAngle) * 3;

  targetPosition.set(camX, 2.5, camZ);
  targetLookAt.set(0, 0.2, 0);
  lerpSpeed = 2;
}

export function updateCamera(deltaTime) {
  if (!camera) return;

  const dt = Math.min(deltaTime, 0.05);
  const t = 1 - Math.exp(-lerpSpeed * dt);

  // Lerp position
  camera.position.lerp(targetPosition, t);

  // Lerp lookAt
  currentLookAt.lerp(targetLookAt, t);
  camera.lookAt(currentLookAt);
}
