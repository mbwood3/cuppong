import * as THREE from 'three';
import { TABLE_RADIUS } from '../shared/constants.js';

/**
 * Decorative horror props scattered across the table.
 * Purely visual — no physics or gameplay interaction.
 */

const BLOOD_RED = 0x8b0000;
const FLESH = 0xd4a574;
const BONE_WHITE = 0xe8dcc8;
const DARK_BLOOD = 0x4a0000;

function createBloodPuddle(scene, x, z, scale = 1) {
  const shape = new THREE.Shape();
  // Irregular blob shape
  const points = 12;
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = (0.3 + Math.random() * 0.25) * scale;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshStandardMaterial({
    color: BLOOD_RED,
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
  });
  const puddle = new THREE.Mesh(geometry, material);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(x, 0.003, z);
  scene.add(puddle);
  return puddle;
}

function createSeveredFinger(scene, x, z, rotY = 0) {
  const group = new THREE.Group();

  // Finger body — tapered cylinder
  const fingerGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.45, 8);
  const fleshMat = new THREE.MeshStandardMaterial({
    color: FLESH,
    roughness: 0.7,
    metalness: 0.0,
  });
  const finger = new THREE.Mesh(fingerGeo, fleshMat);
  finger.rotation.z = Math.PI / 2;
  finger.position.y = 0.06;
  group.add(finger);

  // Fingernail
  const nailGeo = new THREE.BoxGeometry(0.06, 0.02, 0.08);
  const nailMat = new THREE.MeshStandardMaterial({
    color: 0xf0e0d0,
    roughness: 0.4,
    metalness: 0.1,
  });
  const nail = new THREE.Mesh(nailGeo, nailMat);
  nail.position.set(0.2, 0.1, 0);
  group.add(nail);

  // Bloody stump end
  const stumpGeo = new THREE.CircleGeometry(0.08, 8);
  const bloodMat = new THREE.MeshStandardMaterial({
    color: DARK_BLOOD,
    roughness: 0.5,
  });
  const stump = new THREE.Mesh(stumpGeo, bloodMat);
  stump.rotation.z = Math.PI / 2;
  stump.rotation.y = -Math.PI / 2;
  stump.position.set(-0.225, 0.06, 0);
  group.add(stump);

  // Bone peeking out of stump
  const boneGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.06, 6);
  const boneMat = new THREE.MeshStandardMaterial({
    color: BONE_WHITE,
    roughness: 0.6,
  });
  const bone = new THREE.Mesh(boneGeo, boneMat);
  bone.rotation.z = Math.PI / 2;
  bone.position.set(-0.25, 0.06, 0);
  group.add(bone);

  // Small blood puddle underneath
  createBloodPuddle(scene, x + 0.1, z, 0.4);

  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

function createBoneFragment(scene, x, z, rotY = 0) {
  const group = new THREE.Group();

  const boneMat = new THREE.MeshStandardMaterial({
    color: BONE_WHITE,
    roughness: 0.6,
    metalness: 0.0,
  });

  // Main bone shaft — slightly tapered
  const shaftGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.5, 6);
  const shaft = new THREE.Mesh(shaftGeo, boneMat);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.y = 0.04;
  group.add(shaft);

  // Knobby end
  const knobGeo = new THREE.SphereGeometry(0.07, 6, 6);
  const knob = new THREE.Mesh(knobGeo, boneMat);
  knob.position.set(0.25, 0.04, 0);
  knob.scale.set(1, 0.7, 0.8);
  group.add(knob);

  // Jagged broken end — a few small spiky shapes
  const spikeMat = new THREE.MeshStandardMaterial({
    color: 0xd8c8b0,
    roughness: 0.7,
  });
  for (let i = 0; i < 3; i++) {
    const spikeGeo = new THREE.ConeGeometry(0.025, 0.08, 4);
    const spike = new THREE.Mesh(spikeGeo, spikeMat);
    const angle = (i / 3) * Math.PI * 2;
    spike.position.set(-0.25, 0.04 + Math.sin(angle) * 0.02, Math.cos(angle) * 0.02);
    spike.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
    group.add(spike);
  }

  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

function createEyeball(scene, x, z) {
  const group = new THREE.Group();

  // Eyeball sphere
  const eyeGeo = new THREE.SphereGeometry(0.12, 16, 16);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xf5f0e0,
    roughness: 0.4,
    metalness: 0.05,
  });
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  eye.position.y = 0.12;
  group.add(eye);

  // Iris
  const irisGeo = new THREE.CircleGeometry(0.06, 16);
  const irisMat = new THREE.MeshStandardMaterial({
    color: 0x2d5a27,
    roughness: 0.3,
  });
  const iris = new THREE.Mesh(irisGeo, irisMat);
  iris.position.set(0, 0.16, 0.11);
  iris.rotation.x = -0.3;
  group.add(iris);

  // Pupil
  const pupilGeo = new THREE.CircleGeometry(0.03, 16);
  const pupilMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    roughness: 0.2,
  });
  const pupil = new THREE.Mesh(pupilGeo, pupilMat);
  pupil.position.set(0, 0.165, 0.115);
  pupil.rotation.x = -0.3;
  group.add(pupil);

  // Blood veins — thin red lines on the white part
  for (let i = 0; i < 5; i++) {
    const veinGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.08, 4);
    const veinMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.6 });
    const vein = new THREE.Mesh(veinGeo, veinMat);
    const angle = Math.random() * Math.PI * 2;
    vein.position.set(
      Math.cos(angle) * 0.08,
      0.12 + Math.random() * 0.06,
      Math.sin(angle) * 0.08
    );
    vein.rotation.z = angle + Math.PI / 2;
    vein.rotation.x = Math.random() * 0.5;
    group.add(vein);
  }

  // Dangling optic nerve
  const nervePoints = [];
  for (let i = 0; i < 6; i++) {
    nervePoints.push(new THREE.Vector3(
      Math.sin(i * 0.5) * 0.03,
      0.12 - i * 0.03,
      -0.12 - i * 0.04
    ));
  }
  const nerveCurve = new THREE.CatmullRomCurve3(nervePoints);
  const nerveGeo = new THREE.TubeGeometry(nerveCurve, 8, 0.015, 6, false);
  const nerveMat = new THREE.MeshStandardMaterial({
    color: 0xcc4444,
    roughness: 0.6,
  });
  const nerve = new THREE.Mesh(nerveGeo, nerveMat);
  group.add(nerve);

  // Blood smear
  createBloodPuddle(scene, x, z + 0.15, 0.3);

  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function createSeveredHand(scene, x, z, rotY = 0) {
  const group = new THREE.Group();

  const fleshMat = new THREE.MeshStandardMaterial({
    color: FLESH,
    roughness: 0.7,
    metalness: 0.0,
  });

  // Palm — flattened box
  const palmGeo = new THREE.BoxGeometry(0.4, 0.1, 0.35);
  const palm = new THREE.Mesh(palmGeo, fleshMat);
  palm.position.y = 0.05;
  // Round it a bit
  palm.scale.set(1, 1, 1);
  group.add(palm);

  // Fingers — 4 cylinders fanning out
  for (let i = 0; i < 4; i++) {
    const len = 0.25 + Math.random() * 0.1;
    const fingerGeo = new THREE.CylinderGeometry(0.03, 0.035, len, 6);
    const finger = new THREE.Mesh(fingerGeo, fleshMat);
    const spread = (i - 1.5) * 0.08;
    finger.position.set(0.2 + len / 2 * 0.9, 0.05, spread);
    finger.rotation.z = Math.PI / 2 + (i - 1.5) * 0.08;
    // Curl fingers slightly
    finger.rotation.x = (i - 1.5) * 0.1;
    group.add(finger);
  }

  // Thumb — angled out
  const thumbGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.2, 6);
  const thumb = new THREE.Mesh(thumbGeo, fleshMat);
  thumb.position.set(0.05, 0.05, -0.22);
  thumb.rotation.z = Math.PI / 2 - 0.6;
  thumb.rotation.x = -0.3;
  group.add(thumb);

  // Bloody wrist stump
  const stumpGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.08, 8);
  const stumpMat = new THREE.MeshStandardMaterial({
    color: DARK_BLOOD,
    roughness: 0.4,
    metalness: 0.05,
  });
  const stump = new THREE.Mesh(stumpGeo, stumpMat);
  stump.position.set(-0.22, 0.05, 0);
  stump.rotation.z = Math.PI / 2;
  group.add(stump);

  // Wrist bones
  const boneMat = new THREE.MeshStandardMaterial({ color: BONE_WHITE, roughness: 0.6 });
  for (let i = 0; i < 2; i++) {
    const boneGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.1, 6);
    const bone = new THREE.Mesh(boneGeo, boneMat);
    bone.position.set(-0.26, 0.05, (i - 0.5) * 0.06);
    bone.rotation.z = Math.PI / 2;
    group.add(bone);
  }

  // Big blood puddle under hand
  createBloodPuddle(scene, x, z, 0.8);

  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

function createBloodSmear(scene, x, z, angle, length = 0.8) {
  const shape = new THREE.Shape();
  // Elongated smear shape
  shape.moveTo(0, -0.06);
  shape.quadraticCurveTo(length * 0.3, -0.1, length * 0.6, -0.04);
  shape.lineTo(length, 0);
  shape.lineTo(length * 0.6, 0.04);
  shape.quadraticCurveTo(length * 0.3, 0.1, 0, 0.06);
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshStandardMaterial({
    color: BLOOD_RED,
    roughness: 0.35,
    metalness: 0.08,
    transparent: true,
    opacity: 0.7,
  });
  const smear = new THREE.Mesh(geometry, material);
  smear.rotation.x = -Math.PI / 2;
  smear.rotation.z = angle;
  smear.position.set(x, 0.002, z);
  scene.add(smear);
  return smear;
}

/**
 * Add all horror props to the scene.
 * Places them around the table edges and in gaps between cup formations.
 */
export function addGoreProps(scene) {
  const props = [];
  const R = TABLE_RADIUS;

  // Blood puddles scattered around
  props.push(createBloodPuddle(scene, R * 0.3, R * 0.5, 1.2));
  props.push(createBloodPuddle(scene, -R * 0.45, -R * 0.2, 0.9));
  props.push(createBloodPuddle(scene, R * 0.1, -R * 0.55, 1.0));
  props.push(createBloodPuddle(scene, -R * 0.6, R * 0.35, 0.7));

  // Blood smears — like something was dragged
  props.push(createBloodSmear(scene, -R * 0.2, R * 0.4, 0.8, 1.2));
  props.push(createBloodSmear(scene, R * 0.35, -R * 0.3, -1.5, 0.9));
  props.push(createBloodSmear(scene, R * 0.5, R * 0.2, 2.1, 0.7));

  // Severed fingers
  props.push(createSeveredFinger(scene, R * 0.55, R * 0.1, 1.2));
  props.push(createSeveredFinger(scene, -R * 0.3, R * 0.55, -0.8));
  props.push(createSeveredFinger(scene, R * 0.15, -R * 0.45, 2.5));

  // Bone fragments
  props.push(createBoneFragment(scene, -R * 0.5, -R * 0.4, 0.6));
  props.push(createBoneFragment(scene, R * 0.6, -R * 0.15, -1.2));

  // Eyeball — placed prominently
  props.push(createEyeball(scene, -R * 0.15, R * 0.3));

  // Severed hand — the centerpiece
  props.push(createSeveredHand(scene, R * 0.4, R * 0.4, -0.5));

  return props;
}
