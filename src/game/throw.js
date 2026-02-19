import * as THREE from 'three';
import {
  MIN_SWIPE_DISTANCE,
  MAX_SWIPE_TIME,
  HORIZONTAL_SCALE,
  FORWARD_SCALE,
  ARC_SCALE,
  MIN_THROW_SPEED,
  MAX_THROW_SPEED,
  PLAYER_ANGLES,
  PLAYER_DISTANCE,
} from '../shared/constants.js';
import { getCamera } from './scene.js';

let canvas = null;
let onThrowCallback = null;
let swipeStart = null;
let swipeEnabled = false;
let previewLine = null;
let previewScene = null;

export function initThrowControls(canvasEl, scene) {
  canvas = canvasEl;
  previewScene = scene;

  // Create trajectory preview line
  const material = new THREE.LineDashedMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    dashSize: 0.05,
    gapSize: 0.03,
  });
  const geometry = new THREE.BufferGeometry();
  previewLine = new THREE.Line(geometry, material);
  previewLine.visible = false;
  scene.add(previewLine);

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', onPointerUp, { passive: false });
  canvas.addEventListener('pointercancel', onPointerCancel, { passive: false });

  // Prevent default touch behaviors
  canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
}

export function enableThrow(callback) {
  onThrowCallback = callback;
  swipeEnabled = true;
}

export function disableThrow() {
  swipeEnabled = false;
  onThrowCallback = null;
  swipeStart = null;
  if (previewLine) previewLine.visible = false;
}

function onPointerDown(e) {
  if (!swipeEnabled) return;
  e.preventDefault();

  swipeStart = {
    x: e.clientX,
    y: e.clientY,
    time: Date.now(),
  };
}

function onPointerMove(e) {
  if (!swipeEnabled || !swipeStart) return;
  e.preventDefault();

  // Show trajectory preview
  const dx = e.clientX - swipeStart.x;
  const dy = e.clientY - swipeStart.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > MIN_SWIPE_DISTANCE * 0.5 && previewLine) {
    // Simple parabolic preview
    const velocity = computeVelocity(swipeStart, { x: e.clientX, y: e.clientY, time: Date.now() });
    if (velocity) {
      const points = computeTrajectoryPreview(velocity);
      previewLine.geometry.dispose();
      previewLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
      previewLine.computeLineDistances();
      previewLine.visible = true;
    }
  }
}

function onPointerUp(e) {
  if (!swipeEnabled || !swipeStart) return;
  e.preventDefault();

  const end = {
    x: e.clientX,
    y: e.clientY,
    time: Date.now(),
  };

  const dx = end.x - swipeStart.x;
  const dy = end.y - swipeStart.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (previewLine) previewLine.visible = false;

  if (dist < MIN_SWIPE_DISTANCE) {
    swipeStart = null;
    return; // Too short, ignore
  }

  const velocity = computeVelocity(swipeStart, end);
  swipeStart = null;

  if (velocity && onThrowCallback) {
    onThrowCallback(velocity);
  }
}

function onPointerCancel() {
  swipeStart = null;
  if (previewLine) previewLine.visible = false;
}

function computeVelocity(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dt = Math.max(end.time - start.time, 1);
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < MIN_SWIPE_DISTANCE) return null;

  // Speed based on distance and time
  let speed = (dist / dt) * 15; // Scale factor for feel
  speed = Math.max(MIN_THROW_SPEED, Math.min(MAX_THROW_SPEED, speed));

  // Normalize direction
  const ndx = dx / dist;
  const ndy = dy / dist;

  // Map screen swipe to 3D velocity
  // Up swipe (negative dy) = forward (negative z) + upward arc
  // Left/right swipe = x velocity
  const velocityX = ndx * speed * HORIZONTAL_SCALE * 60;
  const velocityZ = ndy * speed * FORWARD_SCALE * 60; // screen Y maps to world Z
  const velocityY = Math.max(2, (-ndy) * speed * ARC_SCALE * 60 + 2); // Always some upward arc

  return { x: velocityX, y: velocityY, z: velocityZ };
}

// Get a throwing start position based on current player facing target
export function getThrowStartPosition(throwerIndex, targetIndex) {
  const throwerAngle = PLAYER_ANGLES[throwerIndex];
  const targetAngle = PLAYER_ANGLES[targetIndex];

  // Start position: near the thrower, slightly toward center
  const startX = Math.cos(throwerAngle) * (PLAYER_DISTANCE - 0.3);
  const startZ = -Math.sin(throwerAngle) * (PLAYER_DISTANCE - 0.3);

  return { x: startX, y: 0.5, z: startZ };
}

// Get the direction from thrower to target for camera positioning
export function getThrowDirection(throwerIndex, targetIndex) {
  const throwerAngle = PLAYER_ANGLES[throwerIndex];
  const targetAngle = PLAYER_ANGLES[targetIndex];

  const fromX = Math.cos(throwerAngle) * PLAYER_DISTANCE;
  const fromZ = -Math.sin(throwerAngle) * PLAYER_DISTANCE;
  const toX = Math.cos(targetAngle) * PLAYER_DISTANCE;
  const toZ = -Math.sin(targetAngle) * PLAYER_DISTANCE;

  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const dist = Math.sqrt(dx * dx + dz * dz);

  return { x: dx / dist, z: dz / dist };
}

function computeTrajectoryPreview(velocity) {
  const camera = getCamera();
  if (!camera) return [];

  // Simulate a simple parabola from camera's forward direction
  const points = [];
  const startPos = new THREE.Vector3(0, 0.5, 0); // Approximate

  let px = startPos.x;
  let py = startPos.y;
  let pz = startPos.z;
  let vx = velocity.x;
  let vy = velocity.y;
  let vz = velocity.z;

  for (let i = 0; i < 40; i++) {
    points.push(new THREE.Vector3(px, py, pz));
    const dt = 0.03;
    px += vx * dt;
    py += vy * dt;
    pz += vz * dt;
    vy -= 9.82 * dt;
    if (py < -0.5) break;
  }

  return points;
}

export function cleanup() {
  if (canvas) {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
  }
  canvas = null;
  onThrowCallback = null;
  swipeStart = null;
  swipeEnabled = false;
}
