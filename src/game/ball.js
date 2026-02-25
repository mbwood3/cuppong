import * as THREE from 'three';
import { BALL_RADIUS } from '../shared/constants.js';
import { getTheme } from '../shared/themes.js';

let ballGroup = null;
let ballMesh = null;
let glowMesh = null;
let trailPoints = [];
let trailMesh = null;
let dripMeshes = [];
let trailScene = null;
let prevPos = null;

export function createBall(scene) {
  const theme = getTheme();
  trailScene = scene;
  ballGroup = new THREE.Group();
  ballGroup.visible = false;

  // Main ball — theme-driven color
  const geometry = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
  const material = new THREE.MeshPhysicalMaterial({
    color: theme.ball.color,
    emissive: theme.ball.emissive,
    emissiveIntensity: theme.ball.emissiveIntensity,
    roughness: 0.15,
    metalness: 0.0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.1,
  });
  ballMesh = new THREE.Mesh(geometry, material);
  ballMesh.castShadow = true;
  ballGroup.add(ballMesh);

  // Glow halo around the ball for visibility
  const glowGeometry = new THREE.SphereGeometry(BALL_RADIUS * 2.0, 16, 16);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: theme.ball.glowColor,
    transparent: true,
    opacity: theme.ball.glowOpacity,
    side: THREE.BackSide,
  });
  glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
  ballGroup.add(glowMesh);

  scene.add(ballGroup);

  return ballGroup;
}

/**
 * Build a blood-stream trail (horror) or sparkle/glitter trail (christmas).
 */
function buildTrailMesh(points) {
  if (trailMesh) {
    trailScene.remove(trailMesh);
    trailMesh.geometry.dispose();
    trailMesh.material.dispose();
    trailMesh = null;
  }

  if (points.length < 2) return;

  const theme = getTheme();
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

    // Width and wobble
    const baseWidth = TRAIL_WIDTH * t;
    const wobble = Math.sin(i * 1.7) * 0.3 + Math.sin(i * 3.1) * 0.15;
    const width = baseWidth * (0.7 + wobble * 0.3 + t * 0.3);

    const p = points[i];
    const dripOffset = (1 - t) * 0.02;

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

  const headColor = theme.ball.trailColors.head;
  const tailColor = theme.ball.trailColors.tail;

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
      uniform vec3 headColor;
      uniform vec3 tailColor;
      void main() {
        vec3 color = mix(tailColor, headColor, vAlpha);
        gl_FragColor = vec4(color, vAlpha);
      }
    `,
    uniforms: {
      headColor: { value: new THREE.Vector3(headColor[0], headColor[1], headColor[2]) },
      tailColor: { value: new THREE.Vector3(tailColor[0], tailColor[1], tailColor[2]) },
    },
  });

  trailMesh = new THREE.Mesh(geom, mat);
  trailScene.add(trailMesh);
}

/**
 * Spawn drip particles — blood drips (horror) or sparkle/snowflake bits (christmas).
 */
function spawnDrips(x, y, z) {
  if (Math.random() > 0.35) return;

  const theme = getTheme();
  const dc = theme.ball.dripColor;
  const isSparkle = theme.ball.trailStyle === 'sparkle';

  const size = isSparkle ? (0.006 + Math.random() * 0.01) : (0.008 + Math.random() * 0.012);
  const geom = new THREE.SphereGeometry(size, 4, 4);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(
      dc.r + (Math.random() - 0.5) * 0.1,
      dc.g + (Math.random() - 0.5) * 0.05,
      dc.b + (Math.random() - 0.5) * 0.05
    ),
    transparent: true,
    opacity: isSparkle ? 0.6 : 0.8,
  });
  const drip = new THREE.Mesh(geom, mat);
  drip.position.set(
    x + (Math.random() - 0.5) * BALL_RADIUS,
    y - BALL_RADIUS * 0.5,
    z + (Math.random() - 0.5) * BALL_RADIUS
  );

  if (isSparkle) {
    // Sparkle: slower, floatier drift
    drip.userData.vy = -0.2 - Math.random() * 0.5;
    drip.userData.vx = (Math.random() - 0.5) * 0.5;
    drip.userData.vz = (Math.random() - 0.5) * 0.5;
    drip.userData.decay = 0.025 + Math.random() * 0.02;
  } else {
    // Blood: heavier, faster falling
    drip.userData.vy = -0.5 - Math.random() * 1.5;
    drip.userData.vx = (Math.random() - 0.5) * 0.3;
    drip.userData.vz = (Math.random() - 0.5) * 0.3;
    drip.userData.decay = 0.02 + Math.random() * 0.02;
  }
  drip.userData.life = 1.0;

  trailScene.add(drip);
  dripMeshes.push(drip);
}

/**
 * Update drip particles (call every frame).
 */
function updateDrips() {
  const theme = getTheme();
  const gravity = theme.ball.dripGravity; // negative value (e.g. -3.0 or -1.5)

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
    d.userData.vy += gravity * 0.016; // gravity pulls down (value is negative)
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
  if (ballMesh) ballMesh.scale.set(1, 1, 1);
}

export function updateBallPosition(x, y, z) {
  if (!ballGroup) return;
  ballGroup.position.set(x, y, z);

  // Motion stretch
  if (ballMesh && prevPos) {
    const dx = x - prevPos.x;
    const dy = y - prevPos.y;
    const dz = z - prevPos.z;
    const speed = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const stretch = Math.min(1 + speed * 8, 1.8);
    const squash = 1 / Math.sqrt(stretch);

    if (speed > 0.001) {
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

  spawnDrips(x, y, z);
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
