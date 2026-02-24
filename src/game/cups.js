import * as THREE from 'three';
import {
  CUP_TOP_RADIUS,
  CUP_BOTTOM_RADIUS,
  CUP_HEIGHT,
  CUP_SPACING,
  CUP_ROWS,
  PLAYER_COLORS,
  PLAYER_ANGLES,
  PLAYER_DISTANCE,
  CUPS_PER_PLAYER,
} from '../shared/constants.js';

// Cups packed tight — rims nearly touching (like real beer pong / Game Pigeon)
const rowSpacing = CUP_TOP_RADIUS * 2 + 0.01;

// Generate world positions for each player's cup triangle.
// Triangle tip (1 cup) points toward center, base (5 cups) near the player.
function generatePlayerPositions(playerIndex) {
  const angle = PLAYER_ANGLES[playerIndex];

  // Player's base position on the table edge
  const baseX = Math.cos(angle) * PLAYER_DISTANCE;
  const baseZ = -Math.sin(angle) * PLAYER_DISTANCE;

  // Direction from player toward center (unit vector)
  const towardCenterX = -Math.cos(angle);
  const towardCenterZ = Math.sin(angle);

  // Perpendicular direction (for spreading cups in a row)
  const perpX = -towardCenterZ;
  const perpZ = towardCenterX;

  const positions = [];
  const totalDepth = (CUP_ROWS.length - 1) * rowSpacing;

  for (let row = 0; row < CUP_ROWS.length; row++) {
    const cupsInRow = CUP_ROWS[row];
    const rowWidth = (cupsInRow - 1) * rowSpacing;

    // Row 0 (1 cup, tip) is farthest from player (toward center)
    // Row 4 (5 cups, base) is closest to player
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

// Get the center of a player's cup triangle in world coordinates
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

// Get the world position for a specific cup
export function getCupWorldPosition(playerIndex, cupIndex) {
  const positions = allPlayerPositions[playerIndex];
  if (!positions[cupIndex]) return null;
  return { x: positions[cupIndex].x, y: CUP_HEIGHT / 2, z: positions[cupIndex].z };
}

export function createCups(scene) {
  const cupMeshes = []; // [playerIndex][cupIndex] = mesh

  // Shared cup geometry — higher poly for smoother look
  const cupGeometry = new THREE.CylinderGeometry(
    CUP_TOP_RADIUS,
    CUP_BOTTOM_RADIUS,
    CUP_HEIGHT,
    24,
    1,
    true // open ended
  );

  // Bottom disc
  const bottomGeometry = new THREE.CircleGeometry(CUP_BOTTOM_RADIUS, 24);

  // Rim torus at the top of each cup
  const rimGeometry = new THREE.TorusGeometry(CUP_TOP_RADIUS, 0.008, 8, 24);

  // Inner shell (visible through open top)
  const innerGeometry = new THREE.CylinderGeometry(
    CUP_TOP_RADIUS * 0.94,
    CUP_BOTTOM_RADIUS * 0.94,
    CUP_HEIGHT * 0.94,
    24,
    1,
    true
  );
  const innerMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a0808,
    roughness: 0.95,
    side: THREE.BackSide,
  });

  // Liquid surface — golden amber beer
  const liquidGeometry = new THREE.CircleGeometry(CUP_TOP_RADIUS * 0.85, 24);
  const liquidMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xcc8822,
    roughness: 0.1,
    metalness: 0.0,
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
    transparent: true,
    opacity: 0.85,
  });

  for (let pi = 0; pi < 3; pi++) {
    const playerCups = [];
    const cupColor = PLAYER_COLORS[pi];

    // Glossy cup material — Solo cup style with clearcoat
    const cupMaterial = new THREE.MeshPhysicalMaterial({
      color: cupColor,
      emissive: cupColor,
      emissiveIntensity: 0.08,
      roughness: 0.35,
      metalness: 0.0,
      clearcoat: 0.3,
      clearcoatRoughness: 0.4,
    });
    const bottomMaterial = new THREE.MeshStandardMaterial({
      color: cupColor,
      emissive: cupColor,
      emissiveIntensity: 0.05,
      roughness: 0.5,
    });
    // Slightly brighter rim
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

      // Outer shell
      const cup = new THREE.Mesh(cupGeometry, cupMaterial);
      cup.castShadow = true;
      group.add(cup);

      // Inner shell
      const inner = new THREE.Mesh(innerGeometry, innerMaterial);
      group.add(inner);

      // Rim at top of cup
      const rim = new THREE.Mesh(rimGeometry, rimMaterial);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = CUP_HEIGHT / 2;
      group.add(rim);

      // Bottom
      const bottom = new THREE.Mesh(bottomGeometry, bottomMaterial);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = -CUP_HEIGHT / 2;
      group.add(bottom);

      // Liquid surface
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
  // newWorldPositions is array of {x, z} for each ACTIVE cup
  // Map active cups to new positions
  let posIdx = 0;
  for (let ci = 0; ci < CUPS_PER_PLAYER; ci++) {
    const mesh = cupMeshes[playerIndex][ci];
    if (!mesh) continue; // cup already removed
    if (posIdx >= newWorldPositions.length) break;
    const pos = newWorldPositions[posIdx];
    mesh.position.set(pos.x, CUP_HEIGHT / 2, pos.z);
    posIdx++;
  }
}

export function removeCup(cupMeshes, scene, playerIndex, cupIndex) {
  const mesh = cupMeshes[playerIndex][cupIndex];
  if (!mesh) return;

  // Animate: scale down and fade
  const startScale = mesh.scale.x;
  const duration = 400;
  const startTime = Date.now();

  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease out cubic

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
