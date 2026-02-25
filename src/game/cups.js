import * as THREE from 'three';
import {
  CUP_TOP_RADIUS,
  CUP_BOTTOM_RADIUS,
  CUP_HEIGHT,
  CUP_ROWS,
  PLAYER_ANGLES,
  PLAYER_DISTANCE,
  CUPS_PER_PLAYER,
} from '../shared/constants.js';
import { getTheme } from '../shared/themes.js';

// Cups packed tight — rims nearly touching (like real beer pong / Game Pigeon)
const rowSpacing = CUP_TOP_RADIUS * 2 + 0.01;

// Generate world positions for each player's cup triangle.
// Triangle tip (1 cup) points toward center, base (5 cups) near the player.
function generatePlayerPositions(playerIndex) {
  const angle = PLAYER_ANGLES[playerIndex];

  const baseX = Math.cos(angle) * PLAYER_DISTANCE;
  const baseZ = -Math.sin(angle) * PLAYER_DISTANCE;

  const towardCenterX = -Math.cos(angle);
  const towardCenterZ = Math.sin(angle);

  const perpX = -towardCenterZ;
  const perpZ = towardCenterX;

  const positions = [];
  const totalDepth = (CUP_ROWS.length - 1) * rowSpacing;

  for (let row = 0; row < CUP_ROWS.length; row++) {
    const cupsInRow = CUP_ROWS[row];
    const rowWidth = (cupsInRow - 1) * rowSpacing;

    const depthOffset = totalDepth - row * rowSpacing;

    for (let col = 0; col < cupsInRow; col++) {
      const lateralOffset = -rowWidth / 2 + col * rowSpacing;

      const worldX = baseX + towardCenterX * depthOffset + perpX * lateralOffset;
      const worldZ = baseZ + towardCenterZ * depthOffset + perpZ * lateralOffset;

      positions.push({ x: worldX, z: worldZ });
    }
  }

  return positions;
}

// Pre-compute all player positions
const allPlayerPositions = [
  generatePlayerPositions(0),
  generatePlayerPositions(1),
  generatePlayerPositions(2),
];

export function getCupTriangleCenter(playerIndex) {
  const positions = allPlayerPositions[playerIndex];
  let avgX = 0, avgZ = 0;
  for (const pos of positions) {
    avgX += pos.x;
    avgZ += pos.z;
  }
  avgX /= positions.length;
  avgZ /= positions.length;

  return { x: avgX, y: CUP_HEIGHT / 2, z: avgZ };
}

export function getCupWorldPosition(playerIndex, cupIndex) {
  const positions = allPlayerPositions[playerIndex];
  if (!positions[cupIndex]) return null;
  return { x: positions[cupIndex].x, y: CUP_HEIGHT / 2, z: positions[cupIndex].z };
}

export function createCups(scene) {
  const theme = getTheme();
  const cupColors = theme.cups.playerColors;
  const cupMeshes = [];

  // Shared cup geometry
  const cupGeometry = new THREE.CylinderGeometry(
    CUP_TOP_RADIUS,
    CUP_BOTTOM_RADIUS,
    CUP_HEIGHT,
    24,
    1,
    true
  );

  const bottomGeometry = new THREE.CircleGeometry(CUP_BOTTOM_RADIUS, 24);
  const rimGeometry = new THREE.TorusGeometry(CUP_TOP_RADIUS, 0.008, 8, 24);

  const innerGeometry = new THREE.CylinderGeometry(
    CUP_TOP_RADIUS * 0.94,
    CUP_BOTTOM_RADIUS * 0.94,
    CUP_HEIGHT * 0.94,
    24,
    1,
    true
  );
  const innerMaterial = new THREE.MeshStandardMaterial({
    color: theme.cups.innerColor,
    roughness: 0.95,
    side: THREE.BackSide,
  });

  // Liquid surface — theme-driven (beer or hot cocoa)
  const liquidGeometry = new THREE.CircleGeometry(CUP_TOP_RADIUS * 0.85, 24);
  const liquidMaterial = new THREE.MeshPhysicalMaterial({
    color: theme.cups.liquidColor,
    roughness: 0.1,
    metalness: 0.0,
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
    transparent: true,
    opacity: theme.cups.liquidOpacity,
  });

  for (let pi = 0; pi < 3; pi++) {
    const playerCups = [];
    const cupColor = cupColors[pi];

    const cupMaterial = new THREE.MeshPhysicalMaterial({
      color: cupColor,
      emissive: cupColor,
      emissiveIntensity: 0.08,
      roughness: 0.35,
      metalness: 0.0,
      clearcoat: theme.cups.clearcoat,
      clearcoatRoughness: 0.4,
    });
    const bottomMaterial = new THREE.MeshStandardMaterial({
      color: cupColor,
      emissive: cupColor,
      emissiveIntensity: 0.05,
      roughness: 0.5,
    });
    const rimMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(cupColor).multiplyScalar(1.3),
      roughness: 0.25,
      metalness: 0.0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
    });

    for (let ci = 0; ci < CUPS_PER_PLAYER; ci++) {
      const pos = getCupWorldPosition(pi, ci);
      if (!pos) continue;

      const group = new THREE.Group();
      group.position.set(pos.x, pos.y, pos.z);

      const cup = new THREE.Mesh(cupGeometry, cupMaterial);
      cup.castShadow = true;
      group.add(cup);

      const inner = new THREE.Mesh(innerGeometry, innerMaterial);
      group.add(inner);

      const rim = new THREE.Mesh(rimGeometry, rimMaterial);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = CUP_HEIGHT / 2;
      group.add(rim);

      const bottom = new THREE.Mesh(bottomGeometry, bottomMaterial);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = -CUP_HEIGHT / 2;
      group.add(bottom);

      const liquid = new THREE.Mesh(liquidGeometry, liquidMaterial);
      liquid.rotation.x = -Math.PI / 2;
      liquid.position.y = CUP_HEIGHT * 0.3;
      group.add(liquid);

      group.userData = { playerIndex: pi, cupIndex: ci };
      scene.add(group);
      playerCups.push(group);
    }
    cupMeshes.push(playerCups);
  }

  return cupMeshes;
}

export function repositionCups(cupMeshes, scene, playerIndex, newWorldPositions) {
  let posIdx = 0;
  for (let ci = 0; ci < CUPS_PER_PLAYER; ci++) {
    const mesh = cupMeshes[playerIndex][ci];
    if (!mesh) continue;
    if (posIdx >= newWorldPositions.length) break;
    const pos = newWorldPositions[posIdx];
    mesh.position.set(pos.x, CUP_HEIGHT / 2, pos.z);
    posIdx++;
  }
}

export function removeCup(cupMeshes, scene, playerIndex, cupIndex) {
  const mesh = cupMeshes[playerIndex][cupIndex];
  if (!mesh) return;

  const startScale = mesh.scale.x;
  const duration = 400;
  const startTime = Date.now();

  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    const scale = startScale * (1 - eased);
    mesh.scale.set(scale, scale, scale);
    mesh.position.y -= 0.002;

    mesh.traverse(child => {
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => {
            m.transparent = true;
            m.opacity = 1 - eased;
          });
        } else {
          child.material.transparent = true;
          child.material.opacity = 1 - eased;
        }
      }
    });

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      scene.remove(mesh);
      cupMeshes[playerIndex][cupIndex] = null;
    }
  }

  animate();
}
