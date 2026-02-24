import { CUP_TOP_RADIUS } from '../shared/constants.js';

const spacing = CUP_TOP_RADIUS * 2 + 0.01;

// Generate triangle formation (like original layout but with fewer cups)
function triangle(count) {
  const positions = [];
  let row = 0;
  let placed = 0;
  while (placed < count) {
    const cupsInRow = row + 1;
    const rowWidth = (cupsInRow - 1) * spacing;
    for (let col = 0; col < cupsInRow && placed < count; col++) {
      positions.push({
        x: -rowWidth / 2 + col * spacing,
        z: row * spacing * 0.866, // sqrt(3)/2 for equilateral
      });
      placed++;
    }
    row++;
  }
  // Center vertically
  const avgZ = positions.reduce((s, p) => s + p.z, 0) / positions.length;
  positions.forEach(p => p.z -= avgZ);
  return positions;
}

// Diamond formation
function diamond(count) {
  if (count <= 2) return line(count);
  const positions = [];
  // Build diamond row by row: 1, 2, 3, ..., peak, ..., 3, 2, 1
  const side = Math.ceil((-1 + Math.sqrt(1 + 2 * count)) / 2);
  let placed = 0;
  const rows = [];
  // Build up
  for (let r = 1; r <= side && placed < count; r++) {
    const inRow = Math.min(r, count - placed);
    rows.push(inRow);
    placed += inRow;
  }
  // Build down
  for (let r = side - 1; r >= 1 && placed < count; r--) {
    const inRow = Math.min(r, count - placed);
    rows.push(inRow);
    placed += inRow;
  }
  let z = 0;
  for (const cupsInRow of rows) {
    const rowWidth = (cupsInRow - 1) * spacing;
    for (let col = 0; col < cupsInRow; col++) {
      positions.push({ x: -rowWidth / 2 + col * spacing, z });
    }
    z += spacing * 0.866;
  }
  const avgZ = positions.reduce((s, p) => s + p.z, 0) / positions.length;
  positions.forEach(p => p.z -= avgZ);
  return positions.slice(0, count);
}

// Single line
function line(count) {
  const positions = [];
  const totalWidth = (count - 1) * spacing;
  for (let i = 0; i < count; i++) {
    positions.push({ x: -totalWidth / 2 + i * spacing, z: 0 });
  }
  return positions;
}

// Two staggered rows
function zipper(count) {
  const positions = [];
  const topRow = Math.ceil(count / 2);
  const botRow = count - topRow;
  const topWidth = (topRow - 1) * spacing;
  for (let i = 0; i < topRow; i++) {
    positions.push({ x: -topWidth / 2 + i * spacing, z: -spacing * 0.433 });
  }
  const botWidth = (botRow - 1) * spacing;
  for (let i = 0; i < botRow; i++) {
    positions.push({ x: -botWidth / 2 + i * spacing, z: spacing * 0.433 });
  }
  return positions;
}

export const RERACK_PRESETS = [
  { name: 'Triangle', fn: triangle, minCups: 3 },
  { name: 'Diamond', fn: diamond, minCups: 4 },
  { name: 'Line', fn: line, minCups: 2 },
  { name: 'Zipper', fn: zipper, minCups: 3 },
];

// Get available presets for a given cup count
export function getAvailablePresets(cupCount) {
  return RERACK_PRESETS.filter(p => cupCount >= p.minCups);
}
