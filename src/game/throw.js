import * as THREE from 'three';
import {
  MIN_SWIPE_DISTANCE,
  MAX_SWIPE_TIME,
  HORIZONTAL_SCALE,
  FORWARD_SCALE,
  ARC_SCALE,
  MIN_THROW_SPEED,
  MAX_THROW_SPEED,
  GRAVITY,
  PLAYER_ANGLES,
  PLAYER_DISTANCE,
} from '../shared/constants.js';
import { getCamera } from './scene.js';
import { getCupTriangleCenter } from './cups.js';

let canvas = null;
let onThrowCallback = null;
let swipeStart = null;
let swipeEnabled = false;
let previewLine = null;
let previewScene = null;
let activePointerId = null; // Track single pointer for multi-touch rejection


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

  // Listen on DOCUMENT level — on iOS Safari, pointer events don't pass through
  // z-index layers via pointer-events:none. The ui-overlay sits above the canvas,
  // so canvas never receives pointer events. Document-level listeners always work.
  document.addEventListener('pointerdown', onPointerDown, { passive: false });
  document.addEventListener('pointermove', onPointerMove, { passive: false });
  document.addEventListener('pointerup', onPointerUp, { passive: false });
  document.addEventListener('pointercancel', onPointerCancel, { passive: false });

  // Prevent default touch behaviors (scroll, zoom, iOS rubber-band)
  // on the canvas container's parent to prevent page-level gestures during game
  const gameContainer = canvas.parentElement;
  if (gameContainer) {
    gameContainer.addEventListener('touchstart', e => { if (swipeEnabled) e.preventDefault(); }, { passive: false });
    gameContainer.addEventListener('touchmove', e => { if (swipeEnabled) e.preventDefault(); }, { passive: false });
  }

  // Lock first pointer only — reject multi-touch gestures
  activePointerId = null;
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

  // Only track one finger at a time — reject multi-touch
  if (activePointerId !== null) return;
  activePointerId = e.pointerId;

  swipeStart = {
    x: e.clientX,
    y: e.clientY,
    time: Date.now(),
  };
}

function onPointerMove(e) {
  if (!swipeEnabled || !swipeStart) return;
  if (e.pointerId !== activePointerId) return; // Ignore other fingers
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
  if (e.pointerId !== activePointerId) return;
  activePointerId = null;
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

function onPointerCancel(e) {
  if (e.pointerId !== activePointerId) return;
  activePointerId = null;
  swipeStart = null;
  if (previewLine) previewLine.visible = false;
}

function computeVelocity(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dt = Math.max(end.time - start.time, 1);
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < MIN_SWIPE_DISTANCE) return null;

  // Speed curve: t^1.3 for smooth low-to-mid range (front rows hittable),
  // linear bonus above cap so fast swipes reach back rows
  const rawSpeed = (dist / dt) * 15;
  const BASE_MAX = 8.44; // medium swipes saturate here
  const t = Math.min(rawSpeed / BASE_MAX, 1);
  let speed = MIN_THROW_SPEED + (BASE_MAX - MIN_THROW_SPEED) * Math.pow(t, 1.3);
  // Bonus: fast swipes beyond the base cap get extra reach
  const excess = Math.max(0, rawSpeed - BASE_MAX);
  speed = Math.min(speed + excess * 0.05, MAX_THROW_SPEED);

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

// Get a throwing start position on the TARGET's radial axis
// (same axis the camera is on, so ball appears centered on screen)
export function getThrowStartPosition(throwerIndex, targetIndex) {
  const targetCenter = getCupTriangleCenter(targetIndex);
  const targetAngle = PLAYER_ANGLES[targetIndex];

  // The target triangle's radial axis: from target player through center
  // (tip of triangle points this direction)
  const towardCenterX = -Math.cos(targetAngle);
  const towardCenterZ = Math.sin(targetAngle);

  // Camera is at targetCenter + towardCenter * camDist (see camera-controller.js)
  // Ball should start between camera and the target cups, on this same axis
  // Place it a bit in front of the camera (toward the cups)
  const startDist = 3.5; // distance from target center along the axis (toward camera)
  const startX = targetCenter.x + towardCenterX * startDist;
  const startZ = targetCenter.z + towardCenterZ * startDist;

  return { x: startX, y: 0.5, z: startZ };
}

// Get the throw direction: along target's radial axis toward their cups
export function getThrowDirection(throwerIndex, targetIndex) {
  const targetAngle = PLAYER_ANGLES[targetIndex];

  // Camera is on the target's radial axis, looking toward cups
  // "Forward" = opposite of towardCenter (i.e., toward target player's cups)
  const towardCenterX = -Math.cos(targetAngle);
  const towardCenterZ = Math.sin(targetAngle);

  // Forward from camera = opposite of towardCenter
  return { x: -towardCenterX, z: -towardCenterZ };
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
    vy += GRAVITY * dt;
    if (py < -0.5) break;
  }

  return points;
}

export function cleanup() {
  document.removeEventListener('pointerdown', onPointerDown);
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
  document.removeEventListener('pointercancel', onPointerCancel);
  canvas = null;
  onThrowCallback = null;
  swipeStart = null;
  swipeEnabled = false;
}
