import * as THREE from 'three';
import { BALL_RADIUS } from '../shared/constants.js';

let ballMesh = null;
let trailPoints = [];
let trailLine = null;

export function createBall(scene) {
  const geometry = new THREE.SphereGeometry(BALL_RADIUS, 16, 16);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.1,
  });
  ballMesh = new THREE.Mesh(geometry, material);
  ballMesh.castShadow = true;
  ballMesh.visible = false;
  scene.add(ballMesh);

  // Trail line
  const trailMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.3,
  });
  const trailGeometry = new THREE.BufferGeometry();
  trailLine = new THREE.Line(trailGeometry, trailMaterial);
  scene.add(trailLine);

  return ballMesh;
}

export function showBall(x, y, z) {
  if (!ballMesh) return;
  ballMesh.position.set(x, y, z);
  ballMesh.visible = true;
  trailPoints = [];
}

export function updateBallPosition(x, y, z) {
  if (!ballMesh) return;
  ballMesh.position.set(x, y, z);

  // Add to trail
  trailPoints.push(new THREE.Vector3(x, y, z));
  if (trailPoints.length > 60) trailPoints.shift();

  if (trailLine && trailPoints.length > 1) {
    trailLine.geometry.dispose();
    trailLine.geometry = new THREE.BufferGeometry().setFromPoints(trailPoints);
  }

  // Spin the ball
  ballMesh.rotation.x += 0.15;
  ballMesh.rotation.z += 0.05;
}

export function hideBall() {
  if (ballMesh) ballMesh.visible = false;
  trailPoints = [];
  if (trailLine) {
    trailLine.geometry.dispose();
    trailLine.geometry = new THREE.BufferGeometry();
  }
}

export function getBall() {
  return ballMesh;
}
