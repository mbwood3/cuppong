import * as THREE from 'three';
import { TABLE_RADIUS, TABLE_HEIGHT } from '../shared/constants.js';

export function createTable(scene) {
  // Table surface — polished wood look
  const tableGeometry = new THREE.CylinderGeometry(TABLE_RADIUS, TABLE_RADIUS, TABLE_HEIGHT, 64);
  const tableMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x5c3a1e,
    roughness: 0.35,
    metalness: 0.0,
    clearcoat: 0.4,
    clearcoatRoughness: 0.25,
  });
  const table = new THREE.Mesh(tableGeometry, tableMaterial);
  table.position.y = -TABLE_HEIGHT / 2;
  table.receiveShadow = true;
  scene.add(table);

  // Inner ring marking where cups go (subtle darker circle)
  const ringGeometry = new THREE.RingGeometry(TABLE_RADIUS * 0.72, TABLE_RADIUS * 0.75, 64);
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a2a12,
    roughness: 0.5,
    metalness: 0.0,
    transparent: true,
    opacity: 0.3,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002; // just above table surface
  scene.add(ring);

  // Table edge rim — thick polished wood border
  const rimGeometry = new THREE.TorusGeometry(TABLE_RADIUS, 0.09, 12, 64);
  const rimMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x3d2410,
    roughness: 0.3,
    metalness: 0.05,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
  });
  const rim = new THREE.Mesh(rimGeometry, rimMaterial);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0;
  rim.castShadow = true;
  scene.add(rim);

  // Floor beneath table — dark warm surface
  const floorGeometry = new THREE.PlaneGeometry(50, 50);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1210,
    roughness: 0.85,
    metalness: 0.0,
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  scene.add(floor);

  return table;
}
