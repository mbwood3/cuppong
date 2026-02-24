import * as THREE from 'three';
import { PLAYER_ANGLES, PLAYER_DISTANCE, CAMERA_OVERHEAD } from '../shared/constants.js';
import { getCupTriangleCenter } from './cups.js';

let camera = null;
let targetPosition = new THREE.Vector3();
let targetLookAt = new THREE.Vector3();
let currentLookAt = new THREE.Vector3(0, 0, 0);
let lerpSpeed = 3;
let snapNextFrame = false; // When true, skip lerp and jump to target instantly

export function initCameraController(cam) {
  camera = cam;
  targetPosition.copy(camera.position);
  targetLookAt.set(0, 0, 0);
  currentLookAt.set(0, 0, 0);
}

// Overhead view — centered above the table
export function setCameraOverhead() {
  targetPosition.set(CAMERA_OVERHEAD.x, CAMERA_OVERHEAD.y, CAMERA_OVERHEAD.z + 0.1);
  targetLookAt.set(0, 0, 0);
  lerpSpeed = 3;
}

export function setCameraThrowView(throwerIndex, targetIndex) {
  // Get center of the TARGET's cup triangle — this is what we aim at
  const targetCenter = getCupTriangleCenter(targetIndex);

  // The target triangle's tip points toward table center (0,0).
  // To see the triangle head-on (tip pointing at camera), the camera must be
  // positioned on the line from the target player THROUGH center and beyond.
  // i.e. on the opposite side of the target's cups from the target player.
  const targetAngle = PLAYER_ANGLES[targetIndex];

  // Direction from target player toward center = the triangle's axis
  // (tip points this way)
  const towardCenterX = -Math.cos(targetAngle);
  const towardCenterZ = Math.sin(targetAngle);

  // Camera sits on this axis, past the tip of the triangle (toward center),
  // elevated for a top-down Game Pigeon style view.
  // Place it a good distance from the target cups so you see them nicely.
  const camDist = 5.5; // distance from target center along the triangle axis
  const camX = targetCenter.x + towardCenterX * camDist;
  const camZ = targetCenter.z + towardCenterZ * camDist;
  const camY = 4.5; // elevated for top-down angle

  // Look at the target cups
  targetPosition.set(camX, camY, camZ);
  targetLookAt.set(targetCenter.x, 0, targetCenter.z);
  lerpSpeed = 5;
  snapNextFrame = true; // Snap instantly so cups are centered when throw is enabled
}

export function setCameraSpectatorView(throwerIndex, targetIndex) {
  const targetCenter = getCupTriangleCenter(targetIndex);
  const throwerAngle = PLAYER_ANGLES[throwerIndex];
  const throwerX = Math.cos(throwerAngle) * PLAYER_DISTANCE;
  const throwerZ = -Math.sin(throwerAngle) * PLAYER_DISTANCE;

  // Midpoint between thrower and target
  const midX = (throwerX + targetCenter.x) / 2;
  const midZ = (throwerZ + targetCenter.z) / 2;

  // Direction from thrower to target
  const dx = targetCenter.x - throwerX;
  const dz = targetCenter.z - throwerZ;
  const dist = Math.sqrt(dx * dx + dz * dz);

  // Perpendicular direction (camera to the side)
  const perpX = -dz / dist;
  const perpZ = dx / dist;

  const sideDist = 6.0;
  const camX = midX + perpX * sideDist;
  const camZ = midZ + perpZ * sideDist;

  targetPosition.set(camX, 5.0, camZ);
  targetLookAt.set(midX, 0.2, midZ);
  lerpSpeed = 2;
}

// Set camera to a "home" view behind a specific player — sees whole table
export function setCameraPlayerView(playerIndex) {
  const angle = PLAYER_ANGLES[playerIndex];

  // Well behind the player, elevated, looking toward center of table
  const camDist = PLAYER_DISTANCE + 5.0;
  const camX = Math.cos(angle) * camDist;
  const camZ = -Math.sin(angle) * camDist;

  targetPosition.set(camX, 6.0, camZ);
  targetLookAt.set(0, 0.1, 0);
  lerpSpeed = 2.5;
}

export function updateCamera(deltaTime) {
  if (!camera) return;

  if (snapNextFrame) {
    // Snap camera to target instantly (no lerp)
    camera.position.copy(targetPosition);
    currentLookAt.copy(targetLookAt);
    camera.lookAt(currentLookAt);
    snapNextFrame = false;
    return;
  }

  const dt = Math.min(deltaTime, 0.05);
  const t = 1 - Math.exp(-lerpSpeed * dt);

  // Lerp position
  camera.position.lerp(targetPosition, t);

  // Lerp lookAt
  currentLookAt.lerp(targetLookAt, t);
  camera.lookAt(currentLookAt);
}
