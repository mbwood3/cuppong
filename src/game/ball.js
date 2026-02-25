import * as THREE from 'three';
import { BALL_RADIUS } from '../shared/constants.js';

let ballGroup = null;
let ballMesh = null;
let glowMesh = null;
let trailPoints = [];
let trailMesh = null;
let dripMeshes = [];
let trailScene = null;
let prevPos = null;

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
 * Build a blood-stream trail from tracked positions.
 * Main ribbon is dark red with irregular edges + drip particles falling off.
 */
function buildTrailMesh(points) {
  // Clean up old trail
  if (trailMesh) {
    trailScene.remove(trailMesh);
    trailMesh.geometry.dispose();
    trailMesh.material.dispose();
    trailMesh = null;
  }

  if (points.length < 2) return;

  const TRAIL_WIDTH = BALL_RADIUS * 0.7;
  const positions = [];
  const alphas = [];

  for (let i = 0; i < points.length; i++) {
    const t = i / (points.length - 1); // 0 at tail, 1 at head

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

    // Irregular width — simulate dripping/streaming blood
    const baseWidth = TRAIL_WIDTH * t;
    // Add sine-wave wobble + random-looking variation using position-based noise
    const wobble = Math.sin(i * 1.7) * 0.3 + Math.sin(i * 3.1) * 0.15;
    const width = baseWidth * (0.7 + wobble * 0.3 + t * 0.3);

    const p = points[i];

    // Offset the trail slightly downward to simulate dripping gravity
    const dripOffset = (1 - t) * 0.02; // tail hangs lower

    positions.push(
      p.x - side.x * width, p.y - side.y * width - dripOffset, p.z - side.z * width,
      p.x + side.x * width, p.y + side.y * width - dripOffset, p.z + side.z * width
    );
    alphas.push(t * 0.7, t * 0.7);
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
        // Dark blood red with slight color variation along alpha
        float r = 0.45 + vAlpha * 0.15;
        float g = 0.02 + vAlpha * 0.03;
        float b = 0.02;
        gl_FragColor = vec4(r, g, b, vAlpha);
      }
    `,
  });

  trailMesh = new THREE.Mesh(geom, mat);
  trailScene.add(trailMesh);
}

/**
 * Spawn small blood drip particles that fall off the trail.
 */
function spawnDrips(x, y, z) {
  // Only spawn every few frames to keep count low
  if (Math.random() > 0.35) return;

  const size = 0.008 + Math.random() * 0.012;
  const geom = new THREE.SphereGeometry(size, 4, 4);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.35 + Math.random() * 0.2, 0, 0.01),
    transparent: true,
    opacity: 0.8,
  });
  const drip = new THREE.Mesh(geom, mat);
  drip.position.set(
    x + (Math.random() - 0.5) * BALL_RADIUS,
    y - BALL_RADIUS * 0.5,
    z + (Math.random() - 0.5) * BALL_RADIUS
  );
  drip.userData.vy = -0.5 - Math.random() * 1.5; // falling speed
  drip.userData.vx = (Math.random() - 0.5) * 0.3;
  drip.userData.vz = (Math.random() - 0.5) * 0.3;
  drip.userData.life = 1.0;
  drip.userData.decay = 0.02 + Math.random() * 0.02;

  trailScene.add(drip);
  dripMeshes.push(drip);
}

/**
 * Update drip particles (call every frame).
 */
function updateDrips() {
  for (let i = dripMeshes.length - 1; i >= 0; i--) {
    const d = dripMeshes[i];
    d.userData.life -= d.userData.decay;

    if (d.userData.life <= 0 || d.position.y < -0.5) {
      trailScene.remove(d);
      d.geometry.dispose();
      d.material.dispose();
      dripMeshes.splice(i, 1);
      continue;
    }

    d.position.x += d.userData.vx * 0.016;
    d.position.y += d.userData.vy * 0.016;
    d.position.z += d.userData.vz * 0.016;
    d.userData.vy -= 3.0 * 0.016; // gravity on drips
    d.material.opacity = d.userData.life * 0.8;
    const s = 0.5 + d.userData.life * 0.5;
    d.scale.set(s, s, s);
  }
}

export function showBall(x, y, z) {
  if (!ballGroup) return;
  ballGroup.position.set(x, y, z);
  ballGroup.visible = true;
  trailPoints = [];
  prevPos = null;
  // Reset ball stretch
  if (ballMesh) ballMesh.scale.set(1, 1, 1);
}

export function updateBallPosition(x, y, z) {
  if (!ballGroup) return;
  ballGroup.position.set(x, y, z);

  // Motion stretch — squash ball along velocity direction for speed perception
  if (ballMesh && prevPos) {
    const dx = x - prevPos.x;
    const dy = y - prevPos.y;
    const dz = z - prevPos.z;
    const speed = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Stretch factor: scales with speed, capped
    const stretch = Math.min(1 + speed * 8, 1.8);
    const squash = 1 / Math.sqrt(stretch); // preserve volume

    if (speed > 0.001) {
      // Align stretch with velocity direction
      const dir = new THREE.Vector3(dx, dy, dz).normalize();
      const quat = new THREE.Quaternion();
      quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      ballMesh.quaternion.copy(quat);
      ballMesh.scale.set(squash, squash, stretch);
    }
  } else if (ballMesh) {
    ballMesh.scale.set(1, 1, 1);
  }

  prevPos = { x, y, z };

  trailPoints.push(new THREE.Vector3(x, y, z));
  if (trailPoints.length > 60) trailPoints.shift();

  if (trailPoints.length > 1) {
    buildTrailMesh(trailPoints);
  }

  // Spawn blood drips from the ball
  spawnDrips(x, y, z);

  // Update existing drips
  updateDrips();
}

export function hideBall() {
  if (ballGroup) ballGroup.visible = false;
  trailPoints = [];
  prevPos = null;
  if (ballMesh) {
    ballMesh.scale.set(1, 1, 1);
    ballMesh.quaternion.identity();
  }
  if (trailMesh && trailScene) {
    trailScene.remove(trailMesh);
    trailMesh.geometry.dispose();
    trailMesh.material.dispose();
    trailMesh = null;
  }
  // Clean up drips
  for (const d of dripMeshes) {
    if (trailScene) trailScene.remove(d);
    d.geometry.dispose();
    d.material.dispose();
  }
  dripMeshes = [];
}

export function getBall() {
  return ballGroup;
}
