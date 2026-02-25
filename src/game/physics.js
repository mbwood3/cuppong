import * as CANNON from 'cannon-es';
import {
  GRAVITY,
  BALL_RADIUS,
  BALL_MASS,
  BALL_RESTITUTION,
  BALL_FRICTION,
  CUP_TOP_RADIUS,
  CUP_BOTTOM_RADIUS,
  CUP_HEIGHT,
  TABLE_RADIUS,
  CUPS_PER_PLAYER,
} from '../shared/constants.js';
import { getCupWorldPosition } from './cups.js';

let world = null;
let ballBody = null;
let cupTriggers = []; // [playerIndex][cupIndex] = body
let cupRimBodies = []; // [playerIndex][cupIndex] = [body, body, ...] rim collision bodies
let groundBody = null;
let tableBody = null;
let isSimulating = false;
let hitCallback = null;
let missCallback = null;
let simulationTimeout = null;
let prevBallPos = { x: 0, y: 0, z: 0 }; // for swept-sphere anti-tunneling

// Materials
let ballMaterial = null;
let rimMaterial = null;
let ballRimContact = null;

export function initPhysics() {
  world = new CANNON.World({
    gravity: new CANNON.Vec3(0, GRAVITY, 0),
  });
  world.solver.iterations = 8; // tuned for iPhone performance
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = false;

  // Ground plane (below table, catches missed balls)
  const groundShape = new CANNON.Plane();
  groundBody = new CANNON.Body({ mass: 0, shape: groundShape });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  groundBody.position.set(0, -1, 0);
  world.addBody(groundBody);

  // Table surface
  const tableShape = new CANNON.Cylinder(TABLE_RADIUS, TABLE_RADIUS, 0.05, 24);
  tableBody = new CANNON.Body({ mass: 0, shape: tableShape });
  tableBody.position.set(0, -0.025, 0);
  tableBody.material = new CANNON.Material({ friction: 0.5, restitution: 0.5 });
  world.addBody(tableBody);

  // Ball
  const ballShape = new CANNON.Sphere(BALL_RADIUS);
  ballMaterial = new CANNON.Material({ friction: BALL_FRICTION, restitution: BALL_RESTITUTION });
  ballBody = new CANNON.Body({ mass: BALL_MASS, shape: ballShape, material: ballMaterial });
  ballBody.linearDamping = 0.01;
  ballBody.isBall = true;
  world.addBody(ballBody);

  // Rim material — slightly bouncy so ball deflects off cup edges
  rimMaterial = new CANNON.Material({ friction: 0.2, restitution: 0.6 });

  // Ball-rim contact: bouncy deflection
  ballRimContact = new CANNON.ContactMaterial(ballMaterial, rimMaterial, {
    friction: 0.2,
    restitution: 0.65,
  });
  world.addContactMaterial(ballRimContact);

  // Ball-table contact
  const ballTableContact = new CANNON.ContactMaterial(ballMaterial, tableBody.material, {
    friction: 0.3,
    restitution: 0.6,
  });
  world.addContactMaterial(ballTableContact);

  // Create cup colliders for all 3 players
  // Each cup is ONE compound body (rim + wall spheres as shapes with offsets)
  // This keeps body count low (~48 total) for fast broadphase
  cupTriggers = [];
  cupRimBodies = [];
  for (let pi = 0; pi < 3; pi++) {
    const playerTriggers = [];
    const playerRims = [];
    for (let ci = 0; ci < CUPS_PER_PLAYER; ci++) {
      const pos = getCupWorldPosition(pi, ci);
      if (!pos) {
        playerTriggers.push(null);
        playerRims.push(null);
        continue;
      }

      // Store cup position for hit detection in stepPhysics
      playerTriggers.push({ position: { x: pos.x, y: pos.y, z: pos.z } });

      // One compound body per cup — all collision spheres are shapes with offsets
      const cupBody = new CANNON.Body({ mass: 0, material: rimMaterial });
      cupBody.position.set(pos.x, pos.y, pos.z);

      // Rim ring — 16 overlapping spheres at the cup top
      const RIM_SEGMENTS = 16;
      const rimSphereRadius = 0.028;
      const rimYOff = CUP_HEIGHT * 0.5; // offset from cup center

      for (let s = 0; s < RIM_SEGMENTS; s++) {
        const angle = (s / RIM_SEGMENTS) * Math.PI * 2;
        const lx = Math.cos(angle) * CUP_TOP_RADIUS;
        const lz = Math.sin(angle) * CUP_TOP_RADIUS;
        cupBody.addShape(
          new CANNON.Sphere(rimSphereRadius),
          new CANNON.Vec3(lx, rimYOff, lz)
        );
      }

      // Wall colliders — two rings of spheres forming the cup wall
      const WALL_SEGMENTS = 12;
      const wallLevels = [0.15, -0.05]; // offsets from cup center Y

      for (const yOff of wallLevels) {
        const t = (yOff + CUP_HEIGHT * 0.5) / CUP_HEIGHT; // 0=bottom, 1=top
        const wallRadius = CUP_BOTTOM_RADIUS + (CUP_TOP_RADIUS - CUP_BOTTOM_RADIUS) * t;
        const wallSphereRadius = 0.025;

        for (let s = 0; s < WALL_SEGMENTS; s++) {
          const angle = (s / WALL_SEGMENTS) * Math.PI * 2;
          const lx = Math.cos(angle) * wallRadius;
          const lz = Math.sin(angle) * wallRadius;
          cupBody.addShape(
            new CANNON.Sphere(wallSphereRadius),
            new CANNON.Vec3(lx, yOff, lz)
          );
        }
      }

      world.addBody(cupBody);
      playerRims.push(cupBody); // single body per cup now
    }
    cupTriggers.push(playerTriggers);
    cupRimBodies.push(playerRims);
  }

  return world;
}

export function launchBall(startPos, velocity, activeCups, onHit, onMiss) {
  if (!world || !ballBody) return;

  ballBody.position.set(startPos.x, startPos.y, startPos.z);
  ballBody.velocity.set(velocity.x, velocity.y, velocity.z);
  ballBody.angularVelocity.set(
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10
  );

  prevBallPos = { x: startPos.x, y: startPos.y, z: startPos.z };
  hitCallback = onHit;
  missCallback = onMiss;
  isSimulating = true;

  // Timeout: if no hit after 4 seconds, count as miss
  clearTimeout(simulationTimeout);
  simulationTimeout = setTimeout(() => {
    if (isSimulating) {
      isSimulating = false;
      if (missCallback) missCallback();
    }
  }, 4000);
}

// Check a single point against all cup triggers. Returns {pi, ci} or null.
function checkPointAgainstCups(px, py, pz) {
  for (let pi = 0; pi < cupTriggers.length; pi++) {
    for (let ci = 0; ci < cupTriggers[pi].length; ci++) {
      const trigger = cupTriggers[pi][ci];
      if (!trigger) continue;

      const cupCenterY = trigger.position.y;
      const rimY = cupCenterY + CUP_HEIGHT * 0.5;

      const dx = px - trigger.position.x;
      const dz = pz - trigger.position.z;
      const horizontalDist = Math.sqrt(dx * dx + dz * dz);

      // Widened trigger: 80% of cup radius (rim physics handles deflections)
      const maxHorizDist = CUP_TOP_RADIUS * 0.8;
      const belowRim = py < rimY - BALL_RADIUS * 0.5; // more forgiving
      const aboveBottom = py > cupCenterY - CUP_HEIGHT * 0.4; // wider vertical window

      if (horizontalDist < maxHorizDist && belowRim && aboveBottom) {
        return { pi, ci };
      }
    }
  }
  return null;
}

export function stepPhysics() {
  if (!world || !isSimulating) return null;

  const ballPos = ballBody.position;

  // Check if ball has fallen below table
  if (ballPos.y < -0.5) {
    isSimulating = false;
    clearTimeout(simulationTimeout);
    if (missCallback) missCallback();
    prevBallPos = { x: ballPos.x, y: ballPos.y, z: ballPos.z };
    return { x: ballPos.x, y: ballPos.y, z: ballPos.z, done: true, hit: false };
  }

  // Swept-sphere anti-tunneling: interpolate substeps if ball moved far this frame
  const dx = ballPos.x - prevBallPos.x;
  const dy = ballPos.y - prevBallPos.y;
  const dz = ballPos.z - prevBallPos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // If ball moved more than half a cup radius, check intermediate positions
  const threshold = CUP_TOP_RADIUS * 0.5;
  const substeps = dist > threshold ? Math.min(Math.ceil(dist / threshold), 6) : 1;

  for (let s = 0; s < substeps; s++) {
    const t = substeps === 1 ? 1 : (s + 1) / substeps;
    const px = prevBallPos.x + dx * t;
    const py = prevBallPos.y + dy * t;
    const pz = prevBallPos.z + dz * t;

    const hit = checkPointAgainstCups(px, py, pz);
    if (hit) {
      isSimulating = false;
      clearTimeout(simulationTimeout);
      if (hitCallback) hitCallback(hit.pi, hit.ci);
      prevBallPos = { x: px, y: py, z: pz };
      return { x: px, y: py, z: pz, done: true, hit: true, playerIndex: hit.pi, cupIndex: hit.ci };
    }
  }

  prevBallPos = { x: ballPos.x, y: ballPos.y, z: ballPos.z };
  return { x: ballPos.x, y: ballPos.y, z: ballPos.z, done: false };
}

export function disableCupTrigger(playerIndex, cupIndex) {
  // Remove trigger (plain position object)
  if (cupTriggers[playerIndex] && cupTriggers[playerIndex][cupIndex]) {
    cupTriggers[playerIndex][cupIndex] = null;
  }
  // Remove compound cup body
  if (cupRimBodies[playerIndex] && cupRimBodies[playerIndex][cupIndex]) {
    world.removeBody(cupRimBodies[playerIndex][cupIndex]);
    cupRimBodies[playerIndex][cupIndex] = null;
  }
}

export function rebuildCupColliders(playerIndex, newWorldPositions) {
  // Remove all existing colliders for this player
  for (let ci = 0; ci < CUPS_PER_PLAYER; ci++) {
    if (cupRimBodies[playerIndex] && cupRimBodies[playerIndex][ci]) {
      world.removeBody(cupRimBodies[playerIndex][ci]);
      cupRimBodies[playerIndex][ci] = null;
    }
    if (cupTriggers[playerIndex]) {
      cupTriggers[playerIndex][ci] = null;
    }
  }

  // Rebuild for active cups at new positions
  let posIdx = 0;
  for (let ci = 0; ci < CUPS_PER_PLAYER; ci++) {
    if (!cupTriggers[playerIndex]) continue;
    // Skip removed cups — only rebuild for as many positions as provided
    if (posIdx >= newWorldPositions.length) {
      cupTriggers[playerIndex][ci] = null;
      break;
    }

    const pos = newWorldPositions[posIdx];
    cupTriggers[playerIndex][ci] = { position: { x: pos.x, y: CUP_HEIGHT / 2, z: pos.z } };

    // Build compound body (same structure as initPhysics)
    const cupBody = new CANNON.Body({ mass: 0, material: rimMaterial });
    cupBody.position.set(pos.x, CUP_HEIGHT / 2, pos.z);

    const RIM_SEGMENTS = 16;
    const rimSphereRadius = 0.028;
    const rimYOff = CUP_HEIGHT * 0.5;
    for (let s = 0; s < RIM_SEGMENTS; s++) {
      const angle = (s / RIM_SEGMENTS) * Math.PI * 2;
      cupBody.addShape(
        new CANNON.Sphere(rimSphereRadius),
        new CANNON.Vec3(Math.cos(angle) * CUP_TOP_RADIUS, rimYOff, Math.sin(angle) * CUP_TOP_RADIUS)
      );
    }

    const WALL_SEGMENTS = 12;
    const wallLevels = [0.15, -0.05];
    for (const yOff of wallLevels) {
      const t = (yOff + CUP_HEIGHT * 0.5) / CUP_HEIGHT;
      const wallRadius = CUP_BOTTOM_RADIUS + (CUP_TOP_RADIUS - CUP_BOTTOM_RADIUS) * t;
      for (let s = 0; s < WALL_SEGMENTS; s++) {
        const angle = (s / WALL_SEGMENTS) * Math.PI * 2;
        cupBody.addShape(
          new CANNON.Sphere(0.025),
          new CANNON.Vec3(Math.cos(angle) * wallRadius, yOff, Math.sin(angle) * wallRadius)
        );
      }
    }

    world.addBody(cupBody);
    cupRimBodies[playerIndex][ci] = cupBody;
    posIdx++;
  }
}

export function isPhysicsRunning() {
  return isSimulating;
}

export function stopSimulation() {
  isSimulating = false;
  clearTimeout(simulationTimeout);
}

export function getWorld() {
  return world;
}

export function getBallMaterial() {
  return ballMaterial;
}

export function stepWorld() {
  if (world) world.step(1 / 60);
}
