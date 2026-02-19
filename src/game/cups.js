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

// Generate cup positions for a single player's triangle
// Returns local positions (before rotation to player's side)
function generateTrianglePositions() {
  const positions = [];
  const rowSpacing = CUP_TOP_RADIUS * 2 + CUP_SPACING * 0.5;

  for (let row = 0; row < CUP_ROWS.length; row++) {
    const cupsInRow = CUP_ROWS[row];
    const rowWidth = (cupsInRow - 1) * rowSpacing;

    for (let col = 0; col < cupsInRow; col++) {
      const x = -rowWidth / 2 + col * rowSpacing;
      const z = row * rowSpacing; // row 0 is front (closest to center)
      positions.push({ x, z });
    }
  }
  return positions;
}

const localPositions = generateTrianglePositions();

// Get the world position for a specific cup
export function getCupWorldPosition(playerIndex, cupIndex) {
  const local = localPositions[cupIndex];
  if (!local) return null;

  const angle = PLAYER_ANGLES[playerIndex];
  const baseX = Math.cos(angle) * PLAYER_DISTANCE;
  const baseZ = -Math.sin(angle) * PLAYER_DISTANCE;

  // Rotate local position by player's angle
  // The triangle points toward center, so we rotate the local positions
  const cosA = Math.cos(angle + Math.PI); // +PI to face center
  const sinA = Math.sin(angle + Math.PI);

  const worldX = baseX + local.x * cosA - local.z * sinA;
  const worldZ = baseZ + local.x * sinA + local.z * cosA;

  return { x: worldX, y: CUP_HEIGHT / 2, z: worldZ };
}

export function createCups(scene) {
  const cupMeshes = []; // [playerIndex][cupIndex] = mesh

  // Create cup geometry (shared)
  const cupGeometry = new THREE.CylinderGeometry(
    CUP_TOP_RADIUS,
    CUP_BOTTOM_RADIUS,
    CUP_HEIGHT,
    16,
    1,
    true // open ended
  );

  // Bottom disc
  const bottomGeometry = new THREE.CircleGeometry(CUP_BOTTOM_RADIUS, 16);

  // Inner dark material (visible through open top)
  const innerGeometry = new THREE.CylinderGeometry(
    CUP_TOP_RADIUS * 0.95,
    CUP_BOTTOM_RADIUS * 0.95,
    CUP_HEIGHT * 0.95,
    16,
    1,
    true
  );
  const innerMaterial = new THREE.MeshStandardMaterial({
    color: 0x331111,
    roughness: 0.9,
    side: THREE.BackSide,
  });

  // Liquid surface inside cup
  const liquidGeometry = new THREE.CircleGeometry(CUP_TOP_RADIUS * 0.85, 16);
  const liquidMaterial = new THREE.MeshStandardMaterial({
    color: 0xddaa33,
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
    opacity: 0.8,
  });

  for (let pi = 0; pi < 3; pi++) {
    const playerCups = [];
    const cupColor = PLAYER_COLORS[pi];
    const cupMaterial = new THREE.MeshStandardMaterial({
      color: cupColor,
      emissive: cupColor,
      emissiveIntensity: 0.15,
      roughness: 0.6,
      metalness: 0.05,
    });
    const bottomMaterial = new THREE.MeshStandardMaterial({
      color: cupColor,
      emissive: cupColor,
      emissiveIntensity: 0.1,
      roughness: 0.7,
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

      // Bottom
      const bottom = new THREE.Mesh(bottomGeometry, bottomMaterial);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = -CUP_HEIGHT / 2;
      group.add(bottom);

      // Liquid surface
      const liquid = new THREE.Mesh(liquidGeometry, liquidMaterial);
      liquid.rotation.x = -Math.PI / 2;
      liquid.position.y = CUP_HEIGHT * 0.3; // liquid level
      group.add(liquid);

      group.userData = { playerIndex: pi, cupIndex: ci };
      scene.add(group);
      playerCups.push(group);
    }
    cupMeshes.push(playerCups);
  }

  return cupMeshes;
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
