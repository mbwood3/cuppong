# Rerack + Async Persistent Games Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a rerack system (2 per player per game, hybrid preset+drag UI) and convert multiplayer to async persistent games with SQLite storage and Twilio SMS notifications.

**Architecture:** Two independent features sharing the same game logic core. Rerack adds a new turn phase and cup repositioning to both client and server. Async games replace Socket.IO multiplayer with REST API endpoints, SQLite persistence, and SMS turn notifications. Freeplay/test mode remains Socket.IO-free as today.

**Tech Stack:** Express.js, SQLite (better-sqlite3), Twilio SDK, Three.js, Cannon-ES, Vite

---

## Phase 1: Rerack

### Task 1: Add rerack fields to game state

**Files:**
- Modify: `server/game-logic.js:3-19` (createGameState)
- Modify: `server/game-logic.js:116-132` (getPublicGameState)
- Modify: `server/constants.js` (add RERACKS_PER_PLAYER)
- Modify: `src/shared/constants.js` (add RERACKS_PER_PLAYER)

**Step 1: Add constant**

In `server/constants.js`, add:
```js
export const RERACKS_PER_PLAYER = 2;
```

In `src/shared/constants.js`, add:
```js
export const RERACKS_PER_PLAYER = 2;
```

**Step 2: Update createGameState**

In `server/game-logic.js`, update the player object in `createGameState` (line 5-10) to include:
```js
reracksRemaining: RERACKS_PER_PLAYER,
cupPositions: null, // null = use default positions; array of {x, z} when reracked
```

Import `RERACKS_PER_PLAYER` from `./constants.js`.

**Step 3: Update getPublicGameState**

In `server/game-logic.js`, update `getPublicGameState` (line 118-123) to include:
```js
reracksRemaining: p.reracksRemaining,
cupPositions: p.cupPositions ? [...p.cupPositions] : null,
```

**Step 4: Commit**
```bash
git add server/game-logic.js server/constants.js src/shared/constants.js
git commit -m "feat: add rerack fields to game state"
```

---

### Task 2: Add rerack game logic on server

**Files:**
- Modify: `server/game-logic.js` (add rerackCups function, update selectTarget)

**Step 1: Add rerackCups function**

After `selectTarget` in `server/game-logic.js`, add:
```js
export function rerackCups(gameState, playerId, targetIndex, newPositions) {
  const currentPlayer = gameState.players[gameState.currentTurnIndex];
  if (currentPlayer.id !== playerId) return { error: 'Not your turn' };
  if (gameState.turnPhase !== 'reracking') return { error: 'Not in rerack phase' };

  const target = gameState.players[targetIndex];
  if (!target) return { error: 'Invalid target' };

  // Count active cups
  const activeCups = target.cups.filter(c => c).length;
  if (newPositions.length !== activeCups) return { error: 'Wrong number of positions' };

  // Validate minimum distance between cups (no overlapping)
  const MIN_DIST = CUP_TOP_RADIUS * 2;
  for (let i = 0; i < newPositions.length; i++) {
    for (let j = i + 1; j < newPositions.length; j++) {
      const dx = newPositions[i].x - newPositions[j].x;
      const dz = newPositions[i].z - newPositions[j].z;
      if (Math.sqrt(dx * dx + dz * dz) < MIN_DIST * 0.9) {
        return { error: 'Cups too close together' };
      }
    }
  }

  // Store positions — map active cup indices to new positions
  target.cupPositions = newPositions;
  currentPlayer.reracksRemaining--;

  gameState.turnPhase = 'throwing';
  return { ok: true };
}
```

Import `CUP_TOP_RADIUS` from `./constants.js` (add it to server constants too, value `0.13`).

**Step 2: Update selectTarget to support rerack option**

Modify `selectTarget` (line 32-34) so that instead of going directly to `'throwing'`, it goes to `'reracking'` if the player has reracks remaining:
```js
gameState.currentTarget = targetIndex;
if (currentPlayer.reracksRemaining > 0) {
  gameState.turnPhase = 'reracking';
} else {
  gameState.turnPhase = 'throwing';
}
return { ok: true };
```

**Step 3: Add skipRerack function**
```js
export function skipRerack(gameState, playerId) {
  const currentPlayer = gameState.players[gameState.currentTurnIndex];
  if (currentPlayer.id !== playerId) return { error: 'Not your turn' };
  if (gameState.turnPhase !== 'reracking') return { error: 'Not in rerack phase' };

  gameState.turnPhase = 'throwing';
  return { ok: true };
}
```

**Step 4: Commit**
```bash
git add server/game-logic.js server/constants.js
git commit -m "feat: add rerack game logic (rerackCups, skipRerack)"
```

---

### Task 3: Add rerack socket events

**Files:**
- Modify: `src/network/events.js` (add RERACK_CUPS, SKIP_RERACK, CUPS_RERACKED)
- Modify: `server/socket-handlers.js` (add rerack handlers)

**Step 1: Add events**

In `src/network/events.js`, add to the Game section:
```js
RERACK_CUPS: 'rerack_cups',
SKIP_RERACK: 'skip_rerack',
CUPS_RERACKED: 'cups_reracked',
```

**Step 2: Add socket handlers**

In `server/socket-handlers.js`, import `rerackCups` and `skipRerack` from game-logic. Add handlers after the `select_target` handler:

```js
socket.on('rerack_cups', (data, callback) => {
  const room = getRoomByPlayerId(socket.id);
  if (!room || !room.gameState) return callback({ error: 'No active game' });

  const result = rerackCups(room.gameState, socket.id, data.targetIndex, data.positions);
  if (result.error) return callback({ error: result.error });

  room.lastActivity = Date.now();
  io.to(room.code).emit('cups_reracked', {
    targetIndex: data.targetIndex,
    positions: data.positions,
    gameState: getPublicGameState(room.gameState),
  });
  callback({ ok: true });
});

socket.on('skip_rerack', (callback) => {
  const room = getRoomByPlayerId(socket.id);
  if (!room || !room.gameState) return callback({ error: 'No active game' });

  const result = skipRerack(room.gameState, socket.id);
  if (result.error) return callback({ error: result.error });

  room.lastActivity = Date.now();
  io.to(room.code).emit('cups_reracked', {
    targetIndex: room.gameState.currentTarget,
    positions: null, // null = no change
    gameState: getPublicGameState(room.gameState),
  });
  callback({ ok: true });
});
```

**Step 3: Commit**
```bash
git add src/network/events.js server/socket-handlers.js
git commit -m "feat: add rerack socket events and handlers"
```

---

### Task 4: Add rerack preset formations

**Files:**
- Create: `src/game/rerack-presets.js`

**Step 1: Create preset formations**

Each preset is a function that takes `cupCount` and returns an array of `{x, z}` offsets (relative to the triangle center, in local space — will be transformed to world space by the caller).

```js
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
```

**Step 2: Commit**
```bash
git add src/game/rerack-presets.js
git commit -m "feat: add rerack preset formations (triangle, diamond, line, zipper)"
```

---

### Task 5: Support dynamic cup positions in physics and rendering

**Files:**
- Modify: `src/game/cups.js` (add functions to reposition cups)
- Modify: `src/game/physics.js` (add function to rebuild cup colliders at new positions)

**Step 1: Add repositionCups to cups.js**

Add a new export to `src/game/cups.js` that moves existing cup meshes to new world positions:
```js
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
```

**Step 2: Add rebuildCupColliders to physics.js**

Add a new export to `src/game/physics.js`:
```js
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
    // Skip removed cups (check if original trigger was already null before this call)
    // We need the caller to tell us which cups are active — use presence in newWorldPositions
    if (posIdx >= newWorldPositions.length) {
      cupTriggers[playerIndex][ci] = null;
      break;
    }

    const pos = newWorldPositions[posIdx];
    cupTriggers[playerIndex][ci] = { position: { x: pos.x, y: CUP_HEIGHT / 2, z: pos.z } };

    // Build compound body (same as initPhysics)
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
```

**Step 3: Commit**
```bash
git add src/game/cups.js src/game/physics.js
git commit -m "feat: add dynamic cup repositioning for rerack"
```

---

### Task 6: Build rerack UI in game screen

**Files:**
- Modify: `src/screens/game.js` (add rerack UI phase)
- Modify: `src/game/camera-controller.js` (ensure setCameraOverhead works for rerack view)

**Step 1: Add rerack UI handler**

In `src/screens/game.js`, update `handleTurnPhase` to handle the `'reracking'` phase. When it's the current player's turn and phase is `'reracking'`:

1. Switch camera to overhead view of the target's cups
2. Show preset buttons at bottom of overlay
3. Show "Skip" button to go straight to throwing
4. Show "Confirm" button once a preset is selected or cups are dragged
5. On confirm: emit `RERACK_CUPS` with new positions
6. On skip: emit `SKIP_RERACK`

Add a `showRerackUI(targetIndex)` function that:
- Calculates the target's triangle bounding area (using `generatePlayerPositions` logic + convex hull)
- Renders preset buttons from `getAvailablePresets(activeCupCount)`
- On preset tap: transforms preset local positions to world positions (rotated/translated to target's area), animates cups to new positions
- Enables pointer drag on individual cups (constrained to bounding area)
- On confirm: collects final cup world positions, sends to server

**Step 2: Listen for `CUPS_RERACKED` event**

All clients (including spectators) listen for `cups_reracked`. When received:
- Call `repositionCups()` to move cup meshes
- Call `rebuildCupColliders()` to update physics
- Update local `gameState` from the event's `gameState`
- Transition to throwing phase

**Step 3: Update freeplay/test mode**

In `handleTestThrowResult` and the freeplay flow, handle the `'reracking'` phase locally (same UI, but resolve locally without server).

**Step 4: Commit**
```bash
git add src/screens/game.js
git commit -m "feat: add rerack UI with presets and drag-to-place"
```

---

### Task 7: Add rerack count to HUD

**Files:**
- Modify: `src/screens/game.js` (updateUI function)

**Step 1: Show rerack count in HUD**

In the `updateUI` function, add rerack info to the HUD. Below the throw counter, show:
```
Reracks: 2 remaining
```
Only show for the current player.

**Step 2: Commit**
```bash
git add src/screens/game.js
git commit -m "feat: show rerack count in game HUD"
```

---

## Phase 2: Async Persistent Games

### Task 8: Add SQLite persistence layer

**Files:**
- Create: `server/db.js`
- Modify: `package.json` (add better-sqlite3)

**Step 1: Install better-sqlite3**
```bash
npm install better-sqlite3
```

**Step 2: Create database module**

Create `server/db.js`:
```js
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'data', 'games.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'playing'
  );

  CREATE TABLE IF NOT EXISTS players (
    game_id TEXT NOT NULL,
    player_index INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    PRIMARY KEY (game_id, player_index),
    FOREIGN KEY (game_id) REFERENCES games(id)
  );
`);

// Prepared statements
const insertGame = db.prepare(
  'INSERT INTO games (id, state, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?)'
);
const updateGame = db.prepare(
  'UPDATE games SET state = ?, updated_at = ?, status = ? WHERE id = ?'
);
const getGame = db.prepare('SELECT * FROM games WHERE id = ?');
const insertPlayer = db.prepare(
  'INSERT INTO players (game_id, player_index, name, phone) VALUES (?, ?, ?, ?)'
);
const getPlayers = db.prepare('SELECT * FROM players WHERE game_id = ? ORDER BY player_index');
const getPlayerByPhone = db.prepare(
  'SELECT * FROM players WHERE game_id = ? AND phone = ?'
);

export function createGame(gameId, gameState, playerInfos) {
  const now = Date.now();
  const transaction = db.transaction(() => {
    insertGame.run(gameId, JSON.stringify(gameState), now, now, 'playing');
    for (const p of playerInfos) {
      insertPlayer.run(gameId, p.index, p.name, p.phone);
    }
  });
  transaction();
}

export function loadGame(gameId) {
  const row = getGame.get(gameId);
  if (!row) return null;
  return {
    id: row.id,
    state: JSON.parse(row.state),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
  };
}

export function saveGame(gameId, gameState) {
  const status = gameState.status || 'playing';
  updateGame.run(JSON.stringify(gameState), Date.now(), status, gameId);
}

export function getGamePlayers(gameId) {
  return getPlayers.all(gameId);
}

export function findPlayerByPhone(gameId, phone) {
  return getPlayerByPhone.get(gameId, phone);
}
```

**Step 3: Create data directory**
```bash
mkdir -p data
echo "*.db" >> data/.gitignore
```

**Step 4: Commit**
```bash
git add server/db.js data/.gitignore package.json package-lock.json
git commit -m "feat: add SQLite persistence layer"
```

---

### Task 9: Add Twilio SMS module

**Files:**
- Create: `server/sms.js`
- Modify: `package.json` (add twilio)

**Step 1: Install twilio**
```bash
npm install twilio
```

**Step 2: Create SMS module**

Create `server/sms.js`:
```js
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

let client = null;

function getClient() {
  if (!client && accountSid && authToken) {
    client = twilio(accountSid, authToken);
  }
  return client;
}

export async function sendSMS(to, body) {
  const c = getClient();
  if (!c) {
    console.log(`[SMS] Twilio not configured. Would send to ${to}: ${body}`);
    return;
  }
  try {
    await c.messages.create({ body, from: fromNumber, to });
    console.log(`[SMS] Sent to ${to}`);
  } catch (err) {
    console.error(`[SMS] Failed to send to ${to}:`, err.message);
  }
}

export async function sendGameInvite(phone, playerName, gameCode, baseUrl) {
  const url = `${baseUrl}/play/${gameCode}`;
  await sendSMS(phone, `Hey ${playerName}! You've been invited to Cup Pong. Play here: ${url}`);
}

export async function sendTurnNotification(phone, playerName, gameCode, baseUrl) {
  const url = `${baseUrl}/play/${gameCode}`;
  await sendSMS(phone, `Your turn in Cup Pong, ${playerName}! ${url}`);
}
```

**Step 3: Commit**
```bash
git add server/sms.js package.json package-lock.json
git commit -m "feat: add Twilio SMS module"
```

---

### Task 10: Add REST API endpoints

**Files:**
- Create: `server/api.js`
- Modify: `server.js` (mount API routes)

**Step 1: Create API router**

Create `server/api.js`:
```js
import express from 'express';
import { createGame, loadGame, saveGame, getGamePlayers, findPlayerByPhone } from './db.js';
import { createGameState, selectTarget, resolveThrow, rerackCups, skipRerack, getPublicGameState } from './game-logic.js';
import { sendGameInvite, sendTurnNotification } from './sms.js';
import { CUPS_PER_PLAYER, RERACKS_PER_PLAYER } from './constants.js';

const router = express.Router();

// Generate room-style codes
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
  return code;
}

// Create a new async game
router.post('/game', async (req, res) => {
  const { players } = req.body;
  // players: [{ name, phone }, { name, phone }, { name, phone }]
  if (!players || players.length !== 3) return res.status(400).json({ error: 'Need exactly 3 players' });

  const gameCode = generateCode();
  const gamePlayers = players.map((p, i) => ({
    id: p.phone, // Use phone as player ID in async mode
    name: p.name,
    index: i,
  }));

  const gameState = createGameState(gamePlayers);
  const playerInfos = players.map((p, i) => ({ index: i, name: p.name, phone: p.phone }));

  createGame(gameCode, gameState, playerInfos);

  // Send invites
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  for (const p of playerInfos) {
    await sendGameInvite(p.phone, p.name, gameCode, baseUrl);
  }

  // Also notify first player it's their turn
  await sendTurnNotification(playerInfos[0].phone, playerInfos[0].name, gameCode, baseUrl);

  res.json({ gameCode });
});

// Get game state
router.get('/game/:code', (req, res) => {
  const game = loadGame(req.params.code.toUpperCase());
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const players = getGamePlayers(game.id);

  res.json({
    gameCode: game.id,
    gameState: getPublicGameState(game.state),
    players: players.map(p => ({ name: p.name, index: p.player_index, phone: p.phone })),
    status: game.status,
  });
});

// Verify player identity (check phone matches a player in the game)
router.post('/game/:code/verify', (req, res) => {
  const { phone } = req.body;
  const code = req.params.code.toUpperCase();
  const game = loadGame(code);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const player = findPlayerByPhone(code, phone);
  if (!player) return res.status(403).json({ error: 'Phone number not in this game' });

  res.json({
    playerIndex: player.player_index,
    name: player.name,
    gameState: getPublicGameState(game.state),
  });
});

// Submit a game action
router.post('/game/:code/action', async (req, res) => {
  const { phone, action } = req.body;
  const code = req.params.code.toUpperCase();

  const game = loadGame(code);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status === 'finished') return res.status(400).json({ error: 'Game is finished' });

  const player = findPlayerByPhone(code, phone);
  if (!player) return res.status(403).json({ error: 'Not a player in this game' });

  const playerId = phone; // Phone is the player ID in async mode
  const gameState = game.state;
  let result;

  switch (action.type) {
    case 'select_target':
      result = selectTarget(gameState, playerId, action.targetIndex);
      break;
    case 'skip_rerack':
      result = skipRerack(gameState, playerId);
      break;
    case 'rerack':
      result = rerackCups(gameState, playerId, action.targetIndex, action.positions);
      break;
    case 'throw_result':
      // In async mode, client runs physics and reports result (same as real-time)
      // First transition to resolving phase
      gameState.turnPhase = 'resolving';
      result = resolveThrow(gameState, playerId, action.hit, action.cupIndex);
      break;
    default:
      return res.status(400).json({ error: 'Unknown action type' });
  }

  if (result.error) return res.status(400).json({ error: result.error });

  // Save updated state
  saveGame(code, gameState);

  // If turn changed, notify next player
  if (action.type === 'throw_result' && !result.gameOver) {
    const currentPlayer = gameState.players[gameState.currentTurnIndex];
    const allPlayers = getGamePlayers(code);
    const nextPlayerInfo = allPlayers.find(p => p.phone === currentPlayer.id);
    if (nextPlayerInfo) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      await sendTurnNotification(nextPlayerInfo.phone, nextPlayerInfo.name, code, baseUrl);
    }
  }

  res.json({
    result,
    gameState: getPublicGameState(gameState),
  });
});

export default router;
```

**Step 2: Mount API in server.js**

In `server.js`, add before the SPA fallback:
```js
import apiRouter from './server/api.js';
app.use(express.json());
app.use('/api', apiRouter);
```

**Step 3: Add `/play/:code` route to vite proxy and SPA fallback**

The SPA fallback in `server.js` already handles `*`, so `/play/CODE` will serve `index.html`. No change needed for production.

In `vite.config.js`, add a proxy for `/api`:
```js
'/api': {
  target: 'http://localhost:3000',
  changeOrigin: true,
},
```

**Step 4: Commit**
```bash
git add server/api.js server.js vite.config.js package.json package-lock.json
git commit -m "feat: add REST API for async games"
```

---

### Task 11: Create async game lobby screen

**Files:**
- Create: `src/screens/create-game.js`
- Modify: `src/screens/lobby.js` (add "Create Async Game" button)
- Modify: `src/main.js` (add /play/:code route handling)

**Step 1: Create the async game creation screen**

Create `src/screens/create-game.js` — a form with:
- 3 player rows, each with name + phone number inputs
- First row pre-filled with the host's name
- "Create Game" button that POSTs to `/api/game`
- On success: navigate to the game screen

**Step 2: Update lobby with new button**

In `src/screens/lobby.js`, add a "Create Async Game" button that navigates to the create-game screen.

**Step 3: Update main.js routing**

In `src/main.js`, handle the `/play/:code` URL pattern:
- Parse the code from the URL
- Show a phone verification screen (enter your phone number)
- POST to `/api/game/:code/verify`
- On success: load the game state and start the game screen in async mode

**Step 4: Commit**
```bash
git add src/screens/create-game.js src/screens/lobby.js src/main.js
git commit -m "feat: add async game creation and join flow"
```

---

### Task 12: Add async game mode to game screen

**Files:**
- Modify: `src/screens/game.js` (add async mode that uses REST instead of Socket.IO)

**Step 1: Add async mode flag and REST helpers**

At the top of game.js, add:
```js
let isAsyncMode = false;
let asyncGameCode = null;
let asyncPhone = null;
```

Add a helper to submit actions via REST:
```js
async function submitAsyncAction(action) {
  const response = await fetch(`/api/game/${asyncGameCode}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: asyncPhone, action }),
  });
  return response.json();
}
```

**Step 2: Update startGame to accept async params**

Modify `startGame` signature to accept an optional `asyncConfig`:
```js
export function startGame(canvasContainer, uiOverlay, initialGameState, playerIndex, asyncConfig) {
  if (asyncConfig) {
    isAsyncMode = true;
    asyncGameCode = asyncConfig.gameCode;
    asyncPhone = asyncConfig.phone;
  }
  // ... rest of init
}
```

**Step 3: Update game actions to use REST in async mode**

In `onMyThrow`, `showTargetSelector`, and the rerack UI:
- If `isAsyncMode`, use `submitAsyncAction()` instead of Socket.IO `emit()`
- After each action response, update local `gameState` from the response
- After throw resolves: show "waiting for [next player]" screen if it's no longer your turn

**Step 4: Add "waiting for turn" screen**

If the player opens the game and it's not their turn, show:
- Read-only 3D view of the table
- "Waiting for [name] to take their turn" message
- A refresh button to re-fetch game state

**Step 5: Commit**
```bash
git add src/screens/game.js
git commit -m "feat: add async game mode to game screen"
```

---

### Task 13: Handle game-over and edge cases

**Files:**
- Modify: `src/screens/game.js` (async game over)
- Modify: `server/api.js` (validation edge cases)

**Step 1: Async game over**

When the game finishes in async mode, show the same game-over screen but with a "Play Again" button that creates a new game with the same players (pre-filled form).

**Step 2: Server validation**

In `server/api.js`, add checks:
- Don't allow actions on finished games
- Don't allow actions from players when it's not their turn (already handled by game-logic, but add phone→playerId check)
- Rate limit: max 1 action per second per phone (prevent double-taps)

**Step 3: Commit**
```bash
git add src/screens/game.js server/api.js
git commit -m "feat: handle async game-over and edge cases"
```

---

## Implementation Order

The tasks should be implemented in order (1→13). Phase 1 (rerack, tasks 1-7) is independent and can be tested with freeplay mode. Phase 2 (async, tasks 8-13) builds on Phase 1 and adds persistence.

**Testing checkpoints:**
- After Task 4: Test presets generate valid positions in console
- After Task 6: Test full rerack flow in freeplay mode
- After Task 7: Verify HUD shows rerack count
- After Task 10: Test REST API with curl
- After Task 11: Test game creation + SMS delivery
- After Task 12: Test full async game flow end-to-end
