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
  if (count <= 3) return triangle(count);
  const positions = [];
  // Find peak width: smallest k where diamond fits count
  // Diamond with peak k has k^2 cups (k rows up + k-1 rows down)
  // But we need at least `count`, so find k where k^2 >= count
  let peak = Math.ceil(Math.sqrt(count));
  // Build the diamond row pattern: 1, 2, ..., peak, ..., 2, 1
  const rows = [];
  let total = 0;
  for (let r = 1; r <= peak; r++) { rows.push(r); total += r; }
  for (let r = peak - 1; r >= 1; r--) { rows.push(r); total += r; }
  // If still not enough, widen the peak rows until we have enough slots
  while (total < count) {
    // Add an extra row at peak width
    rows.splice(peak, 0, peak);
    total += peak;
  }
  // Place cups row by row, stopping at count
  let placed = 0;
  let z = 0;
  for (const cupsInRow of rows) {
    const toPlace = Math.min(cupsInRow, count - placed);
    if (toPlace <= 0) break;
    const rowWidth = (toPlace - 1) * spacing;
    for (let col = 0; col < toPlace; col++) {
      positions.push({ x: -rowWidth / 2 + col * spacing, z });
      placed++;
    }
    z += spacing * 0.866;
  }
  const avgZ = positions.reduce((s, p) => s + p.z, 0) / positions.length;
  positions.forEach(p => p.z -= avgZ);
  return positions;
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
