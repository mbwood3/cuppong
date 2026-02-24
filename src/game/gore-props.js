import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { TABLE_RADIUS } from '../shared/constants.js';
import { getBallMaterial } from './physics.js';

// ─── Mobile detection ───
const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
  navigator.userAgent
) || (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);

// ─── Detail levels ───
const SPHERE_SEG = isMobile ? 10 : 20;
const CYL_SEG = isMobile ? 6 : 10;
const TUBE_SEG = isMobile ? 24 : 48;
const TUBE_RAD = isMobile ? 5 : 8;

// ─── Color palette ───
const C = {
  BLOOD_RED:    0x8b0000,
  DARK_BLOOD:   0x4a0000,
  FRESH_BLOOD:  0xaa1515,
  FLESH:        0xd4a574,
  FLESH_PALE:   0xe0c8a8,
  FLESH_DARK:   0xb08050,
  BRUISE:       0x553366,
  BONE:         0xe8dcc8,
  ORGAN_RED:    0x8b2020,
  ORGAN_PINK:   0xcc7777,
  MUSCLE:       0x993333,
  FAT:          0xe8d090,
  VEIN_BLUE:    0x4455aa,
  TENDON:       0xd8d0c0,
  NAIL:         0xf0e0d0,
};

// ─── Material factories ───

function fleshMat(color = C.FLESH, wetness = 0.5) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.7 - wetness * 0.4,
    metalness: 0.0,
    clearcoat: isMobile ? wetness * 0.15 : wetness * 0.3,
    clearcoatRoughness: 0.4,
    sheen: isMobile ? 0.15 : 0.3,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xff6644),
  });
}

function organMat(color = C.ORGAN_RED, wetness = 0.8) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.2,
    metalness: 0.0,
    clearcoat: isMobile ? 0.3 : 0.6,
    clearcoatRoughness: 0.15,
    sheen: isMobile ? 0.25 : 0.5,
    sheenRoughness: 0.3,
    sheenColor: new THREE.Color(0xff4422),
  });
}

function bloodMat(pooled = true) {
  return new THREE.MeshStandardMaterial({
    color: pooled ? C.DARK_BLOOD : C.FRESH_BLOOD,
    roughness: pooled ? 0.3 : 0.15,
    metalness: 0.08,
    transparent: true,
    opacity: pooled ? 0.85 : 0.9,
  });
}

function boneMat() {
  return new THREE.MeshStandardMaterial({ color: C.BONE, roughness: 0.6, metalness: 0.0 });
}

// ─── Geometry helpers ───

function displaceVertices(geo, amount = 0.02, freq = 3.0) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const noise = Math.sin(x * freq) * Math.cos(y * freq * 1.3) * Math.sin(z * freq * 0.7);
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    pos.setXYZ(i, x + (x / len) * noise * amount, y + (y / len) * noise * amount, z + (z / len) * noise * amount);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function makeTube(points, radius = 0.015, mat = null) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, Math.min(points.length * 4, TUBE_SEG), radius, TUBE_RAD, false);
  return new THREE.Mesh(geo, mat || fleshMat(C.FRESH_BLOOD, 0.7));
}

function addStump(group, pos, radius, boneRadius, rotation = null) {
  // Layered cross-section: flesh ring → fat ring → muscle fill → bone center
  const layers = [
    { inner: radius * 0.85, outer: radius, mat: fleshMat() },
    { inner: radius * 0.65, outer: radius * 0.85, mat: fleshMat(C.FAT, 0.3) },
  ];
  for (const l of layers) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(l.inner, l.outer, 12), l.mat);
    ring.position.copy(pos);
    if (rotation) ring.rotation.copy(rotation);
    else ring.rotation.x = -Math.PI / 2;
    group.add(ring);
  }
  const muscle = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.65, 12), organMat(C.MUSCLE));
  muscle.position.copy(pos);
  if (rotation) muscle.rotation.copy(rotation);
  else muscle.rotation.x = -Math.PI / 2;
  group.add(muscle);

  const bone = new THREE.Mesh(new THREE.CircleGeometry(boneRadius, 8), boneMat());
  bone.position.copy(pos);
  if (rotation) bone.rotation.copy(rotation);
  else bone.rotation.x = -Math.PI / 2;
  bone.position.y += 0.001;
  group.add(bone);

  // Blood drips
  if (!isMobile) {
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + Math.random();
      const dripPoints = [
        new THREE.Vector3(pos.x + Math.cos(angle) * radius * 0.4, pos.y, pos.z + Math.sin(angle) * radius * 0.4),
        new THREE.Vector3(pos.x + Math.cos(angle) * radius * 0.5, pos.y - 0.05, pos.z + Math.sin(angle) * radius * 0.5),
        new THREE.Vector3(pos.x + Math.cos(angle) * radius * 0.45, pos.y - 0.1, pos.z + Math.sin(angle) * radius * 0.45),
      ];
      group.add(makeTube(dripPoints, 0.008, bloodMat(false)));
    }
  }
}

// ─── Physics helper ───

let propMaterial = null;
function createPropBody(world, position, shape, mass = 0.5) {
  if (!propMaterial) {
    propMaterial = new CANNON.Material({ friction: 0.6, restitution: 0.2 });
    const bm = getBallMaterial();
    if (bm) {
      world.addContactMaterial(new CANNON.ContactMaterial(bm, propMaterial, {
        friction: 0.3, restitution: 0.3,
      }));
    }
  }
  const body = new CANNON.Body({
    mass,
    shape,
    material: propMaterial,
    position: new CANNON.Vec3(position.x, position.y, position.z),
    linearDamping: 0.5,
    angularDamping: 0.5,
    allowSleep: true,
    sleepSpeedLimit: 0.1,
    sleepTimeLimit: 1,
  });
  world.addBody(body);
  return body;
}

// ─── Blood puddles & smears (no physics) ───

function createBloodPuddle(scene, x, z, scale = 1) {
  const shape = new THREE.Shape();
  const pts = 12;
  for (let i = 0; i < pts; i++) {
    const angle = (i / pts) * Math.PI * 2;
    const r = (0.3 + Math.random() * 0.25) * scale;
    const px = Math.cos(angle) * r, py = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
  }
  shape.closePath();
  const puddle = new THREE.Mesh(new THREE.ShapeGeometry(shape), bloodMat(true));
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(x, 0.003, z);
  scene.add(puddle);
  return puddle;
}

function createBloodSmear(scene, x, z, angle, length = 0.8) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.06);
  shape.quadraticCurveTo(length * 0.3, -0.1, length * 0.6, -0.04);
  shape.lineTo(length, 0);
  shape.lineTo(length * 0.6, 0.04);
  shape.quadraticCurveTo(length * 0.3, 0.1, 0, 0.06);
  shape.closePath();
  const smear = new THREE.Mesh(new THREE.ShapeGeometry(shape), bloodMat(true));
  smear.material.opacity = 0.7;
  smear.rotation.x = -Math.PI / 2;
  smear.rotation.z = angle;
  smear.position.set(x, 0.002, z);
  scene.add(smear);
  return smear;
}

// ─── Body parts ───

function createSeveredFinger(scene, x, z, rotY = 0) {
  const group = new THREE.Group();
  const fm = fleshMat();

  const fingerGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.45, CYL_SEG);
  displaceVertices(fingerGeo, 0.008, 5);
  const finger = new THREE.Mesh(fingerGeo, fm);
  finger.rotation.z = Math.PI / 2;
  finger.position.y = 0.06;
  group.add(finger);

  const nail = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.02, 0.08),
    new THREE.MeshStandardMaterial({ color: C.NAIL, roughness: 0.4, metalness: 0.1 })
  );
  nail.position.set(0.2, 0.1, 0);
  group.add(nail);

  addStump(group, new THREE.Vector3(-0.225, 0.06, 0), 0.08, 0.025,
    new THREE.Euler(0, 0, Math.PI / 2));

  createBloodPuddle(scene, x + 0.1, z, 0.4);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

function createBoneFragment(scene, x, z, rotY = 0) {
  const group = new THREE.Group();
  const bm = boneMat();

  const shaftGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.5, CYL_SEG);
  displaceVertices(shaftGeo, 0.005, 4);
  const shaft = new THREE.Mesh(shaftGeo, bm);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.y = 0.04;
  group.add(shaft);

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, CYL_SEG, CYL_SEG), bm);
  knob.position.set(0.25, 0.04, 0);
  knob.scale.set(1, 0.7, 0.8);
  group.add(knob);

  const spikeMat = new THREE.MeshStandardMaterial({ color: 0xd8c8b0, roughness: 0.7 });
  for (let i = 0; i < 3; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), spikeMat);
    const a = (i / 3) * Math.PI * 2;
    spike.position.set(-0.25, 0.04 + Math.sin(a) * 0.02, Math.cos(a) * 0.02);
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

  const eyeGeo = new THREE.SphereGeometry(0.12, SPHERE_SEG, SPHERE_SEG);
  const eyeMat = isMobile
    ? new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.3, metalness: 0.05 })
    : new THREE.MeshPhysicalMaterial({ color: 0xf5f0e0, roughness: 0.15, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  eye.position.y = 0.12;
  group.add(eye);

  const iris = new THREE.Mesh(
    new THREE.CircleGeometry(0.06, 16),
    new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.3 })
  );
  iris.position.set(0, 0.16, 0.11);
  iris.rotation.x = -0.3;
  group.add(iris);

  const pupil = new THREE.Mesh(
    new THREE.CircleGeometry(0.03, 16),
    new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.2 })
  );
  pupil.position.set(0, 0.165, 0.115);
  pupil.rotation.x = -0.3;
  group.add(pupil);

  // Blood veins
  if (!isMobile) {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const veinPts = [];
      for (let j = 0; j < 4; j++) {
        const t = j / 3;
        veinPts.push(new THREE.Vector3(
          Math.cos(a + t * 0.3) * (0.06 + t * 0.04),
          0.12 + Math.sin(a * 2 + t) * 0.04,
          Math.sin(a + t * 0.3) * (0.06 + t * 0.04)
        ));
      }
      group.add(makeTube(veinPts, 0.003, new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.6 })));
    }
  }

  // Optic nerve
  const nervePoints = [];
  for (let i = 0; i < 6; i++) {
    nervePoints.push(new THREE.Vector3(
      Math.sin(i * 0.5) * 0.03, 0.12 - i * 0.03, -0.12 - i * 0.04
    ));
  }
  group.add(makeTube(nervePoints, 0.015, organMat(0xcc4444)));

  createBloodPuddle(scene, x, z + 0.15, 0.3);
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function createSeveredHand(scene, x, z, rotY = 0) {
  const group = new THREE.Group();
  const fm = fleshMat();

  const palmGeo = new THREE.BoxGeometry(0.4, 0.1, 0.35, 4, 2, 4);
  displaceVertices(palmGeo, 0.008, 4);
  const palm = new THREE.Mesh(palmGeo, fm);
  palm.position.y = 0.05;
  group.add(palm);

  for (let i = 0; i < 4; i++) {
    const len = 0.25 + Math.random() * 0.1;
    const fGeo = new THREE.CylinderGeometry(0.03, 0.035, len, CYL_SEG);
    displaceVertices(fGeo, 0.005, 6);
    const f = new THREE.Mesh(fGeo, fm);
    const spread = (i - 1.5) * 0.08;
    f.position.set(0.2 + len / 2 * 0.9, 0.05, spread);
    f.rotation.z = Math.PI / 2 + (i - 1.5) * 0.08;
    f.rotation.x = (i - 1.5) * 0.1;
    group.add(f);
  }

  const thumbGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.2, CYL_SEG);
  displaceVertices(thumbGeo, 0.005, 6);
  const thumb = new THREE.Mesh(thumbGeo, fm);
  thumb.position.set(0.05, 0.05, -0.22);
  thumb.rotation.z = Math.PI / 2 - 0.6;
  thumb.rotation.x = -0.3;
  group.add(thumb);

  addStump(group, new THREE.Vector3(-0.22, 0.05, 0), 0.15, 0.035,
    new THREE.Euler(0, 0, Math.PI / 2));

  createBloodPuddle(scene, x, z, 0.8);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

// ─── New body parts ───

function createSeveredHead(scene, x, z) {
  const group = new THREE.Group();
  const fm = fleshMat(C.FLESH, 0.6);
  const darkFm = fleshMat(C.FLESH_DARK, 0.4);

  // Cranium
  const craniumGeo = new THREE.SphereGeometry(0.5, SPHERE_SEG + 4, SPHERE_SEG);
  displaceVertices(craniumGeo, 0.025, 2.5);
  const cranium = new THREE.Mesh(craniumGeo, fm);
  cranium.scale.y = 0.85;
  cranium.position.y = 0.5;
  group.add(cranium);

  // Jaw — lower half-sphere, slightly open
  const jawGeo = new THREE.SphereGeometry(0.38, SPHERE_SEG, SPHERE_SEG, 0, Math.PI * 2, 0, Math.PI * 0.5);
  displaceVertices(jawGeo, 0.015, 3);
  const jaw = new THREE.Mesh(jawGeo, fm);
  jaw.position.set(0, 0.25, 0.05);
  jaw.rotation.x = 0.15; // slightly open
  group.add(jaw);

  // Eye sockets — dark recesses
  const socketMat = new THREE.MeshStandardMaterial({ color: C.DARK_BLOOD, roughness: 0.8 });
  for (const side of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), socketMat);
    socket.position.set(side * 0.17, 0.55, 0.35);
    socket.scale.z = 0.6;
    group.add(socket);

    // Small eyeball in socket
    const miniEye = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.3 })
    );
    miniEye.position.set(side * 0.17, 0.55, 0.38);
    group.add(miniEye);

    const miniIris = new THREE.Mesh(
      new THREE.CircleGeometry(0.025, 8),
      new THREE.MeshStandardMaterial({ color: 0x2d5a27 })
    );
    miniIris.position.set(side * 0.17, 0.55, 0.44);
    group.add(miniIris);
  }

  // Nose
  const noseGeo = new THREE.ConeGeometry(0.06, 0.12, CYL_SEG);
  const nose = new THREE.Mesh(noseGeo, fm);
  nose.position.set(0, 0.48, 0.42);
  nose.rotation.x = -0.3;
  nose.scale.z = 0.6;
  group.add(nose);

  // Nostrils
  for (const side of [-1, 1]) {
    const nostril = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 6, 6),
      new THREE.MeshStandardMaterial({ color: C.DARK_BLOOD, roughness: 0.8 })
    );
    nostril.position.set(side * 0.03, 0.44, 0.44);
    group.add(nostril);
  }

  // Exposed skull section — bone visible on one side
  const skullGeo = new THREE.SphereGeometry(0.48, SPHERE_SEG, SPHERE_SEG, Math.PI * 0.8, Math.PI * 0.5, 0, Math.PI * 0.6);
  const skull = new THREE.Mesh(skullGeo, boneMat());
  skull.position.y = 0.51;
  group.add(skull);

  // Blood at skull/flesh boundary
  const boundaryGeo = new THREE.TorusGeometry(0.35, 0.03, 6, 12, Math.PI * 0.5);
  const boundary = new THREE.Mesh(boundaryGeo, bloodMat(false));
  boundary.position.set(-0.15, 0.6, 0);
  boundary.rotation.y = Math.PI * 0.8;
  group.add(boundary);

  // Neck stump with layered cross-section
  const neckStump = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.2, 0.15, CYL_SEG + 2),
    organMat(C.MUSCLE, 0.9)
  );
  neckStump.position.y = 0.08;
  group.add(neckStump);

  addStump(group, new THREE.Vector3(0, 0.01, 0), 0.25, 0.06);

  // Spine bone poking out
  const spine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.12, CYL_SEG),
    boneMat()
  );
  spine.position.set(0, 0.02, -0.08);
  group.add(spine);

  // Dangling tendons
  if (!isMobile) {
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
      const r = 0.12 + Math.random() * 0.08;
      const pts = [
        new THREE.Vector3(Math.cos(angle) * r, 0.05, Math.sin(angle) * r),
        new THREE.Vector3(Math.cos(angle) * r * 1.1, -0.03, Math.sin(angle) * r * 1.1),
        new THREE.Vector3(Math.cos(angle) * r * 0.9, -0.08, Math.sin(angle) * r * 1.2),
      ];
      group.add(makeTube(pts, 0.01, organMat(C.MUSCLE, 0.7)));
    }
  }

  // Ears on the head
  for (const side of [-1, 1]) {
    const earGeo = new THREE.SphereGeometry(0.06, 6, 6);
    const ear = new THREE.Mesh(earGeo, fm);
    ear.position.set(side * 0.48, 0.45, 0);
    ear.scale.set(0.4, 1, 0.8);
    group.add(ear);
  }

  createBloodPuddle(scene, x, z, 1.5);
  createBloodSmear(scene, x + 0.3, z + 0.2, 0.5, 0.6);

  group.position.set(x, 0, z);
  group.rotation.z = 0.15; // slightly tilted like it rolled
  scene.add(group);
  return group;
}

function createHeart(scene, x, z) {
  const group = new THREE.Group();

  // Heart body via LatheGeometry
  const profile = [
    new THREE.Vector2(0, -0.2),
    new THREE.Vector2(0.08, -0.15),
    new THREE.Vector2(0.15, -0.05),
    new THREE.Vector2(0.18, 0.05),
    new THREE.Vector2(0.16, 0.12),
    new THREE.Vector2(0.12, 0.18),
    new THREE.Vector2(0.06, 0.2),
    new THREE.Vector2(0, 0.17),
  ];
  const heartGeo = new THREE.LatheGeometry(profile, SPHERE_SEG);
  displaceVertices(heartGeo, 0.012, 4);
  const heart = new THREE.Mesh(heartGeo, organMat(C.ORGAN_RED, 0.9));
  heart.scale.set(1, 1, 0.7);
  heart.position.y = 0.2;
  group.add(heart);

  // Severed arteries at top
  const arteryColors = [C.FRESH_BLOOD, C.FRESH_BLOOD, C.VEIN_BLUE];
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const pts = [
      new THREE.Vector3(Math.cos(angle) * 0.04, 0.37, Math.sin(angle) * 0.04),
      new THREE.Vector3(Math.cos(angle) * 0.06, 0.42, Math.sin(angle) * 0.06),
      new THREE.Vector3(Math.cos(angle) * 0.05, 0.46, Math.sin(angle) * 0.07 + 0.02),
    ];
    const mat = i < 2 ? bloodMat(false) : new THREE.MeshStandardMaterial({ color: arteryColors[i], roughness: 0.4 });
    group.add(makeTube(pts, 0.012, mat));
  }

  createBloodPuddle(scene, x, z, 0.5);
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function createIntestines(scene, x, z) {
  const group = new THREE.Group();

  // Winding tube pile
  const points = [];
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    const angle = t * Math.PI * 6;
    const r = 0.15 + Math.sin(t * Math.PI) * 0.2;
    points.push(new THREE.Vector3(
      Math.cos(angle) * r + (Math.random() - 0.5) * 0.08,
      t * 0.12,
      Math.sin(angle) * r + (Math.random() - 0.5) * 0.08
    ));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const tubeGeo = new THREE.TubeGeometry(curve, TUBE_SEG + 16, 0.035, TUBE_RAD, false);
  const intestine = new THREE.Mesh(tubeGeo, organMat(C.ORGAN_PINK, 0.9));
  group.add(intestine);

  // Second overlapping tube for tangled look
  const points2 = [];
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const angle = t * Math.PI * 4 + 1.5;
    const r = 0.1 + Math.sin(t * Math.PI) * 0.15;
    points2.push(new THREE.Vector3(
      Math.cos(angle) * r + (Math.random() - 0.5) * 0.06,
      t * 0.08 + 0.03,
      Math.sin(angle) * r + (Math.random() - 0.5) * 0.06
    ));
  }
  const curve2 = new THREE.CatmullRomCurve3(points2);
  const tubeGeo2 = new THREE.TubeGeometry(curve2, TUBE_SEG, 0.03, TUBE_RAD, false);
  const intestine2 = new THREE.Mesh(tubeGeo2, organMat(C.ORGAN_PINK, 0.85));
  group.add(intestine2);

  createBloodPuddle(scene, x, z, 0.7);
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function createBrain(scene, x, z) {
  const group = new THREE.Group();

  // Brain base sphere
  const brainGeo = new THREE.SphereGeometry(0.15, SPHERE_SEG, SPHERE_SEG - 2);
  displaceVertices(brainGeo, 0.01, 5);
  const brain = new THREE.Mesh(brainGeo, organMat(C.ORGAN_PINK, 0.7));
  brain.scale.set(1, 0.75, 0.85);
  brain.position.y = 0.12;
  group.add(brain);

  // Wrinkle ribbons (sulci)
  if (!isMobile) {
    for (let i = 0; i < 7; i++) {
      const ribbonPts = [];
      const startAngle = (i / 7) * Math.PI;
      for (let j = 0; j < 8; j++) {
        const t = j / 7;
        const theta = startAngle + (Math.random() - 0.5) * 0.3;
        const phi = t * Math.PI;
        const r = 0.155;
        ribbonPts.push(new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi) * 0.75 + 0.12,
          r * Math.sin(phi) * Math.sin(theta) * 0.85
        ));
      }
      group.add(makeTube(ribbonPts, 0.008, organMat(0xbb6666, 0.6)));
    }
  }

  // Hemisphere fissure
  const fissure = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28, 0.22),
    new THREE.MeshStandardMaterial({ color: C.DARK_BLOOD, roughness: 0.8, side: THREE.DoubleSide })
  );
  fissure.position.set(0, 0.14, 0);
  fissure.rotation.y = Math.PI / 2;
  group.add(fissure);

  // Brain stem
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.04, 0.08, CYL_SEG),
    organMat(C.ORGAN_PINK, 0.5)
  );
  stem.position.set(0, 0.02, -0.05);
  group.add(stem);

  createBloodPuddle(scene, x, z, 0.4);
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function createLiver(scene, x, z) {
  const group = new THREE.Group();

  const profile = [
    new THREE.Vector2(0, -0.05),
    new THREE.Vector2(0.12, -0.03),
    new THREE.Vector2(0.2, 0.0),
    new THREE.Vector2(0.18, 0.03),
    new THREE.Vector2(0.1, 0.04),
    new THREE.Vector2(0, 0.03),
  ];
  const liverGeo = new THREE.LatheGeometry(profile, SPHERE_SEG - 4);
  liverGeo.scale(1.3, 1, 0.8);
  displaceVertices(liverGeo, 0.015, 2.5);
  const liver = new THREE.Mesh(liverGeo, organMat(0x6b2020, 0.9));
  liver.position.y = 0.05;
  group.add(liver);

  createBloodPuddle(scene, x, z, 0.5);
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function createForearm(scene, x, z, rotY = 0) {
  const group = new THREE.Group();
  const fm = fleshMat(C.FLESH, 0.5);

  // Arm shaft
  const armGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.8, CYL_SEG + 2);
  displaceVertices(armGeo, 0.012, 3);
  const arm = new THREE.Mesh(armGeo, fm);
  arm.rotation.z = Math.PI / 2;
  arm.position.y = 0.12;
  group.add(arm);

  // Hand at wrist end
  const handFm = fleshMat(C.FLESH_PALE, 0.4);
  const palmGeo = new THREE.BoxGeometry(0.2, 0.08, 0.18, 3, 2, 3);
  displaceVertices(palmGeo, 0.006, 5);
  const palm = new THREE.Mesh(palmGeo, handFm);
  palm.position.set(0.5, 0.12, 0);
  group.add(palm);

  for (let i = 0; i < 4; i++) {
    const len = 0.15 + Math.random() * 0.06;
    const fGeo = new THREE.CylinderGeometry(0.02, 0.025, len, CYL_SEG);
    const f = new THREE.Mesh(fGeo, handFm);
    f.position.set(0.6 + len / 2 * 0.85, 0.12, (i - 1.5) * 0.04);
    f.rotation.z = Math.PI / 2 + (i - 1.5) * 0.06;
    group.add(f);
  }

  // Thumb
  const thumbGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.12, CYL_SEG);
  const thumb = new THREE.Mesh(thumbGeo, handFm);
  thumb.position.set(0.45, 0.12, -0.12);
  thumb.rotation.z = Math.PI / 2 - 0.5;
  group.add(thumb);

  // Elbow stump
  addStump(group, new THREE.Vector3(-0.4, 0.12, 0), 0.12, 0.03,
    new THREE.Euler(0, 0, Math.PI / 2));

  // Dual bones at stump (radius and ulna)
  for (const offset of [-0.025, 0.025]) {
    const bone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.08, CYL_SEG),
      boneMat()
    );
    bone.position.set(-0.44, 0.12, offset);
    bone.rotation.z = Math.PI / 2;
    group.add(bone);
  }

  // Veins along surface
  if (!isMobile) {
    for (let i = 0; i < 3; i++) {
      const zOff = (i - 1) * 0.06;
      const pts = [
        new THREE.Vector3(-0.2, 0.17, zOff),
        new THREE.Vector3(0.0, 0.18, zOff + 0.02),
        new THREE.Vector3(0.2, 0.17, zOff - 0.01),
        new THREE.Vector3(0.35, 0.16, zOff + 0.01),
      ];
      group.add(makeTube(pts, 0.004, new THREE.MeshStandardMaterial({ color: C.VEIN_BLUE, roughness: 0.5 })));
    }
  }

  createBloodPuddle(scene, x, z, 0.9);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

function createFoot(scene, x, z, rotY = 0) {
  const group = new THREE.Group();
  const fm = fleshMat(C.FLESH, 0.4);

  // Foot body
  const footGeo = new THREE.BoxGeometry(0.18, 0.1, 0.4, 4, 2, 6);
  displaceVertices(footGeo, 0.012, 3);
  const foot = new THREE.Mesh(footGeo, fm);
  foot.position.y = 0.05;
  group.add(foot);

  // Sole (lighter underside)
  const sole = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.35),
    fleshMat(C.FLESH_PALE, 0.2)
  );
  sole.rotation.x = -Math.PI / 2;
  sole.position.set(0, 0.001, 0);
  group.add(sole);

  // Toes
  for (let i = 0; i < 5; i++) {
    const size = i === 0 ? 0.03 : 0.025 - i * 0.002;
    const len = i === 0 ? 0.08 : 0.06 - i * 0.005;
    const toeGeo = new THREE.CylinderGeometry(size * 0.8, size, len, CYL_SEG);
    displaceVertices(toeGeo, 0.003, 8);
    const toe = new THREE.Mesh(toeGeo, fm);
    toe.position.set((i - 2) * 0.035, 0.04, 0.22 + (i === 0 ? 0 : -Math.abs(i - 1) * 0.015));
    toe.rotation.x = Math.PI / 2;
    group.add(toe);
  }

  // Ankle stump
  addStump(group, new THREE.Vector3(0, 0.06, -0.2), 0.08, 0.03,
    new THREE.Euler(Math.PI / 2, 0, 0));

  // Tibia bone
  const tibia = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.08, CYL_SEG),
    boneMat()
  );
  tibia.position.set(0, 0.06, -0.24);
  group.add(tibia);

  createBloodPuddle(scene, x, z, 0.6);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

function createEar(scene, x, z, rotY = 0) {
  const group = new THREE.Group();

  const earShape = new THREE.Shape();
  earShape.moveTo(0, -0.12);
  earShape.quadraticCurveTo(0.08, -0.1, 0.1, 0);
  earShape.quadraticCurveTo(0.11, 0.08, 0.06, 0.12);
  earShape.quadraticCurveTo(0.02, 0.1, 0.03, 0.05);
  earShape.quadraticCurveTo(0.04, 0, 0.02, -0.05);
  earShape.lineTo(0, -0.12);

  const earGeo = new THREE.ExtrudeGeometry(earShape, {
    depth: 0.02, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 2,
  });
  const ear = new THREE.Mesh(earGeo, fleshMat(C.FLESH, 0.4));
  ear.rotation.x = -Math.PI / 2;
  ear.position.y = 0.02;
  group.add(ear);

  // Inner ear fold
  const innerShape = new THREE.Shape();
  innerShape.moveTo(0.02, -0.06);
  innerShape.quadraticCurveTo(0.05, -0.04, 0.06, 0.02);
  innerShape.quadraticCurveTo(0.05, 0.06, 0.03, 0.04);
  innerShape.quadraticCurveTo(0.03, 0, 0.02, -0.06);

  const innerGeo = new THREE.ExtrudeGeometry(innerShape, {
    depth: 0.015, bevelEnabled: false,
  });
  const inner = new THREE.Mesh(innerGeo, fleshMat(C.FLESH_DARK, 0.3));
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.025;
  group.add(inner);

  // Bloody attachment point
  const stumpBlood = new THREE.Mesh(
    new THREE.CircleGeometry(0.03, 8),
    bloodMat(false)
  );
  stumpBlood.rotation.x = -Math.PI / 2;
  stumpBlood.position.set(0, 0.015, -0.12);
  group.add(stumpBlood);

  createBloodPuddle(scene, x, z, 0.25);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

function createTongue(scene, x, z, rotY = 0) {
  const group = new THREE.Group();

  const tongueGeo = new THREE.BoxGeometry(0.08, 0.03, 0.25, 4, 2, 8);
  // Manual bend — curve the tongue tip downward
  const pos = tongueGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = (z + 0.125) / 0.25; // 0 at back, 1 at tip
    // Narrow toward tip
    pos.setX(i, pos.getX(i) * (1 - t * 0.3));
    // Curve downward at tip
    if (t > 0.6) {
      pos.setY(i, pos.getY(i) - (t - 0.6) * 0.04);
    }
  }
  pos.needsUpdate = true;
  displaceVertices(tongueGeo, 0.005, 6);
  tongueGeo.computeVertexNormals();

  const tongue = new THREE.Mesh(tongueGeo, organMat(0xcc6666, 0.8));
  tongue.position.y = 0.02;
  group.add(tongue);

  // Center line
  const lineGeo = new THREE.PlaneGeometry(0.002, 0.2);
  const line = new THREE.Mesh(lineGeo, new THREE.MeshStandardMaterial({ color: C.DARK_BLOOD, roughness: 0.5 }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, 0.04, 0.02);
  group.add(line);

  // Severed root
  const root = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, 0.03, CYL_SEG),
    organMat(C.MUSCLE, 0.8)
  );
  root.position.set(0, 0.015, -0.12);
  group.add(root);

  // Tendon roots
  if (!isMobile) {
    for (let i = 0; i < 2; i++) {
      const pts = [
        new THREE.Vector3((i - 0.5) * 0.02, 0.015, -0.12),
        new THREE.Vector3((i - 0.5) * 0.03, -0.01, -0.15),
        new THREE.Vector3((i - 0.5) * 0.025, -0.03, -0.16),
      ];
      group.add(makeTube(pts, 0.006, organMat(C.TENDON, 0.4)));
    }
  }

  createBloodPuddle(scene, x, z, 0.3);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

// ─── Main export ───

export function addGoreProps(scene, world, onEyeballHit) {
  const R = TABLE_RADIUS;
  const propPairs = []; // { mesh, body }

  function addProp(mesh, position, shape, mass) {
    const body = createPropBody(world, position, shape, mass);
    // Match initial rotation
    body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
    propPairs.push({ mesh, body });
    return body;
  }

  // ─── Blood puddles & smears (no physics) ───
  createBloodPuddle(scene, R * 0.3, R * 0.5, 1.2);
  createBloodPuddle(scene, -R * 0.45, -R * 0.2, 0.9);
  createBloodPuddle(scene, R * 0.1, -R * 0.55, 1.0);
  createBloodPuddle(scene, -R * 0.6, R * 0.35, 0.7);
  createBloodSmear(scene, -R * 0.2, R * 0.4, 0.8, 1.2);
  createBloodSmear(scene, R * 0.35, -R * 0.3, -1.5, 0.9);
  createBloodSmear(scene, R * 0.5, R * 0.2, 2.1, 0.7);

  // ─── Severed head (centerpiece) ───
  const head = createSeveredHead(scene, 0, 0);
  addProp(head, { x: 0, y: 0.5, z: 0 }, new CANNON.Sphere(0.5), 2.0);

  // ─── Eyeball (special hit reaction) ───
  const eyeball = createEyeball(scene, -R * 0.15, R * 0.3);
  const eyeballBody = addProp(eyeball, { x: -R * 0.15, y: 0.12, z: R * 0.3 }, new CANNON.Sphere(0.12), 0.05);

  // Eyeball collision listener
  eyeballBody.addEventListener('collide', (event) => {
    if (event.body && event.body.isBall && onEyeballHit) {
      onEyeballHit();
    }
  });

  // ─── Heart ───
  const heart = createHeart(scene, R * 0.35, -R * 0.15);
  addProp(heart, { x: R * 0.35, y: 0.15, z: -R * 0.15 }, new CANNON.Sphere(0.15), 0.3);

  // ─── Intestines ───
  const intestines = createIntestines(scene, -R * 0.4, -R * 0.35);
  addProp(intestines, { x: -R * 0.4, y: 0.06, z: -R * 0.35 }, new CANNON.Box(new CANNON.Vec3(0.3, 0.1, 0.3)), 0.8);

  // ─── Brain ───
  const brain = createBrain(scene, R * 0.2, R * 0.5);
  addProp(brain, { x: R * 0.2, y: 0.12, z: R * 0.5 }, new CANNON.Sphere(0.13), 0.4);

  // ─── Liver ───
  const liver = createLiver(scene, -R * 0.55, R * 0.1);
  addProp(liver, { x: -R * 0.55, y: 0.05, z: R * 0.1 }, new CANNON.Box(new CANNON.Vec3(0.2, 0.05, 0.15)), 0.5);

  // ─── Forearm ───
  const forearm = createForearm(scene, R * 0.5, R * 0.35, -0.4);
  addProp(forearm, { x: R * 0.5, y: 0.12, z: R * 0.35 }, new CANNON.Cylinder(0.12, 0.12, 0.8, 8), 1.5);

  // ─── Foot ───
  const foot = createFoot(scene, -R * 0.3, R * 0.55, 1.8);
  addProp(foot, { x: -R * 0.3, y: 0.05, z: R * 0.55 }, new CANNON.Box(new CANNON.Vec3(0.15, 0.06, 0.25)), 1.0);

  // ─── Ear ───
  const ear = createEar(scene, R * 0.6, -R * 0.4, 0.9);
  addProp(ear, { x: R * 0.6, y: 0.02, z: -R * 0.4 }, new CANNON.Box(new CANNON.Vec3(0.06, 0.07, 0.015)), 0.05);

  // ─── Tongue ───
  const tongue = createTongue(scene, -R * 0.15, -R * 0.5, -0.6);
  addProp(tongue, { x: -R * 0.15, y: 0.02, z: -R * 0.5 }, new CANNON.Box(new CANNON.Vec3(0.04, 0.02, 0.12)), 0.1);

  // ─── Severed hand ───
  const hand = createSeveredHand(scene, R * 0.4, R * 0.4, -0.5);
  addProp(hand, { x: R * 0.4, y: 0.05, z: R * 0.4 }, new CANNON.Box(new CANNON.Vec3(0.2, 0.05, 0.18)), 0.3);

  // ─── Severed fingers ───
  const f1 = createSeveredFinger(scene, R * 0.55, R * 0.1, 1.2);
  addProp(f1, { x: R * 0.55, y: 0.06, z: R * 0.1 }, new CANNON.Cylinder(0.04, 0.04, 0.45, 6), 0.05);
  const f2 = createSeveredFinger(scene, -R * 0.3, R * 0.55, -0.8);
  addProp(f2, { x: -R * 0.3, y: 0.06, z: R * 0.55 }, new CANNON.Cylinder(0.04, 0.04, 0.45, 6), 0.05);
  const f3 = createSeveredFinger(scene, R * 0.15, -R * 0.45, 2.5);
  addProp(f3, { x: R * 0.15, y: 0.06, z: -R * 0.45 }, new CANNON.Cylinder(0.04, 0.04, 0.45, 6), 0.05);

  // ─── Bone fragments ───
  const b1 = createBoneFragment(scene, -R * 0.5, -R * 0.4, 0.6);
  addProp(b1, { x: -R * 0.5, y: 0.04, z: -R * 0.4 }, new CANNON.Cylinder(0.04, 0.04, 0.5, 6), 0.1);
  const b2 = createBoneFragment(scene, R * 0.6, -R * 0.15, -1.2);
  addProp(b2, { x: R * 0.6, y: 0.04, z: -R * 0.15 }, new CANNON.Cylinder(0.04, 0.04, 0.5, 6), 0.1);

  // ─── Physics-visual sync ───
  function update() {
    for (const { mesh, body } of propPairs) {
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    }
  }

  return {
    props: propPairs,
    eyeball: { mesh: eyeball, body: eyeballBody },
    update,
  };
}
