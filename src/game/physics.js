import * as CANNON from 'cannon-es';
import {
  GRAVITY,
  BALL_RADIUS,
  BALL_MASS,
  BALL_RESTITUTION,
  BALL_FRICTION,
  CUP_TOP_RADIUS,
  CUP_HEIGHT,
  TABLE_RADIUS,
  CUPS_PER_PLAYER,
} from '../shared/constants.js';
import { getCupWorldPosition } from './cups.js';

let world = null;
let ballBody = null;
let cupTriggers = []; // [playerIndex][cupIndex] = body
let groundBody = null;
let tableBody = null;
let isSimulating = false;
let hitCallback = null;
let missCallback = null;
let simulationTimeout = null;

export function initPhysics() {
  world = new CANNON.World({
    gravity: new CANNON.Vec3(0, GRAVITY, 0),
  });
  world.solver.iterations = 10;
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
  const ballMaterial = new CANNON.Material({ friction: BALL_FRICTION, restitution: BALL_RESTITUTION });
  ballBody = new CANNON.Body({ mass: BALL_MASS, shape: ballShape, material: ballMaterial });
  ballBody.linearDamping = 0.01;
  world.addBody(ballBody);

  // Contact material
  const contactMat = new CANNON.ContactMaterial(ballMaterial, tableBody.material, {
    friction: 0.3,
    restitution: 0.6,
  });
  world.addContactMaterial(contactMat);

  // Create cup trigger zones for all 3 players
  cupTriggers = [];
  for (let pi = 0; pi < 3; pi++) {
    const playerTriggers = [];
    for (let ci = 0; ci < CUPS_PER_PLAYER; ci++) {
      const pos = getCupWorldPosition(pi, ci);
      if (!pos) {
        playerTriggers.push(null);
        continue;
      }

      // Trigger zone: a cylinder slightly smaller than the cup opening
      const triggerShape = new CANNON.Cylinder(
        CUP_TOP_RADIUS * 0.8,
        CUP_TOP_RADIUS * 0.8,
        CUP_HEIGHT * 0.6,
        8
      );
      const triggerBody = new CANNON.Body({
        mass: 0,
        shape: triggerShape,
        isTrigger: true,
      });
      triggerBody.position.set(pos.x, pos.y, pos.z);
      triggerBody.collisionResponse = false;
      world.addBody(triggerBody);
      playerTriggers.push(triggerBody);
    }
    cupTriggers.push(playerTriggers);
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

export function stepPhysics() {
  if (!world || !isSimulating) return null;

  world.step(1 / 60);

  const ballPos = ballBody.position;
  const ballVel = ballBody.velocity;

  // Check if ball has fallen below table
  if (ballPos.y < -0.5) {
    isSimulating = false;
    clearTimeout(simulationTimeout);
    if (missCallback) missCallback();
    return { x: ballPos.x, y: ballPos.y, z: ballPos.z, done: true, hit: false };
  }

  // Check cup triggers
  for (let pi = 0; pi < cupTriggers.length; pi++) {
    for (let ci = 0; ci < cupTriggers[pi].length; ci++) {
      const trigger = cupTriggers[pi][ci];
      if (!trigger) continue;

      const dx = ballPos.x - trigger.position.x;
      const dy = ballPos.y - trigger.position.y;
      const dz = ballPos.z - trigger.position.z;
      const horizontalDist = Math.sqrt(dx * dx + dz * dz);

      // Ball is inside trigger zone and moving downward
      if (horizontalDist < CUP_TOP_RADIUS * 0.85 &&
          Math.abs(dy) < CUP_HEIGHT * 0.4 &&
          ballVel.y < 0) {
        isSimulating = false;
        clearTimeout(simulationTimeout);
        if (hitCallback) hitCallback(pi, ci);
        return { x: ballPos.x, y: ballPos.y, z: ballPos.z, done: true, hit: true, playerIndex: pi, cupIndex: ci };
      }
    }
  }

  return { x: ballPos.x, y: ballPos.y, z: ballPos.z, done: false };
}

export function disableCupTrigger(playerIndex, cupIndex) {
  if (cupTriggers[playerIndex] && cupTriggers[playerIndex][cupIndex]) {
    world.removeBody(cupTriggers[playerIndex][cupIndex]);
    cupTriggers[playerIndex][cupIndex] = null;
  }
}

export function isPhysicsRunning() {
  return isSimulating;
}

export function stopSimulation() {
  isSimulating = false;
  clearTimeout(simulationTimeout);
}
