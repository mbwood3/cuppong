import * as THREE from 'three';
import { BALL_RADIUS } from '../shared/constants.js';

let ballGroup = null;
let ballMesh = null;
let glowMesh = null;
let trailPoints = [];
let trailMesh = null;
let trailScene = null;

export function createBall(scene) {
  trailScene = scene;
  ballGroup = new THREE.Group();
  ballGroup.visible = false;

  // Main ball — slight orange tint like a real ping pong ball
  const geometry = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xfff4e8,
    emissive: 0xffddaa,
    emissiveIntensity: 0.15,
    roughness: 0.15,
    metalness: 0.0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.1,
  });
  ballMesh = new THREE.Mesh(geometry, material);
  ballMesh.castShadow = true;
  ballGroup.add(ballMesh);

  // Warm glow halo around the ball for visibility
  const glowGeometry = new THREE.SphereGeometry(BALL_RADIUS * 2.0, 16, 16);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffeecc,
    transparent: true,
    opacity: 0.12,
    side: THREE.BackSide,
  });
  glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
  ballGroup.add(glowMesh);

  scene.add(ballGroup);

  return ballGroup;
}

/**
 * Build a mesh-based trail ribbon from an array of Vector3 points.
 * Warm-tinted trail that fades from transparent to semi-opaque.
 */
function buildTrailMesh(points) {
  if (trailMesh) {
    trailScene.remove(trailMesh);
    trailMesh.geometry.dispose();
    trailMesh.material.dispose();
    trailMesh = null;
  }

  if (points.length < 2) return;

  const TRAIL_WIDTH = BALL_RADIUS * 0.5;
  const positions = [];
  const alphas = [];

  for (let i = 0; i < points.length; i++) {
    const t = i / (points.length - 1);

    let tangent;
    if (i === 0) {
      tangent = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
    } else if (i === points.length - 1) {
      tangent = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
    } else {
      tangent = new THREE.Vector3().subVectors(points[i + 1], points[i - 1]).normalize();
    }

    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    if (side.length() < 0.01) {
      side.crossVectors(tangent, new THREE.Vector3(0, 0, 1)).normalize();
    }

    const width = TRAIL_WIDTH * t;
    const p = points[i];

    positions.push(
      p.x - side.x * width, p.y - side.y * width, p.z - side.z * width,
      p.x + side.x * width, p.y + side.y * width, p.z + side.z * width
    );
    alphas.push(t * 0.5, t * 0.5);
  }

  const indices = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('alpha', new THREE.Float32BufferAttribute(alphas, 1));
  geom.setIndex(indices);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute float alpha;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(1.0, 0.95, 0.85, vAlpha);
      }
    `,
  });

  trailMesh = new THREE.Mesh(geom, mat);
  trailScene.add(trailMesh);
}

export function showBall(x, y, z) {
  if (!ballGroup) return;
  ballGroup.position.set(x, y, z);
  ballGroup.visible = true;
  trailPoints = [];
}

export function updateBallPosition(x, y, z) {
  if (!ballGroup) return;
  ballGroup.position.set(x, y, z);

  trailPoints.push(new THREE.Vector3(x, y, z));
  if (trailPoints.length > 80) trailPoints.shift();

  if (trailPoints.length > 1) {
    buildTrailMesh(trailPoints);
  }

  if (ballMesh) {
    ballMesh.rotation.x += 0.15;
    ballMesh.rotation.z += 0.05;
  }
}

export function hideBall() {
  if (ballGroup) ballGroup.visible = false;
  trailPoints = [];
  if (trailMesh && trailScene) {
    trailScene.remove(trailMesh);
    trailMesh.geometry.dispose();
    trailMesh.material.dispose();
    trailMesh = null;
  }
}

export function getBall() {
  return ballGroup;
}
