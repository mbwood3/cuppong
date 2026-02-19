import * as THREE from 'three';
import { TABLE_RADIUS, TABLE_HEIGHT } from '../shared/constants.js';

export function createTable(scene) {
  // Table surface - circular
  const tableGeometry = new THREE.CylinderGeometry(TABLE_RADIUS, TABLE_RADIUS, TABLE_HEIGHT, 48);
  const tableMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d5016,
    roughness: 0.8,
    metalness: 0.1,
  });
  const table = new THREE.Mesh(tableGeometry, tableMaterial);
  table.position.y = -TABLE_HEIGHT / 2;
  table.receiveShadow = true;
  scene.add(table);

  // Table edge rim
  const rimGeometry = new THREE.TorusGeometry(TABLE_RADIUS, 0.03, 8, 48);
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a3520,
    roughness: 0.6,
    metalness: 0.2,
  });
  const rim = new THREE.Mesh(rimGeometry, rimMaterial);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0;
  scene.add(rim);

  // Floor beneath table
  const floorGeometry = new THREE.PlaneGeometry(20, 20);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x111122,
    roughness: 0.9,
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  scene.add(floor);

  return table;
}
