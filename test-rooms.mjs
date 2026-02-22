// Quick integration test for room join/disconnect/reconnect logic
// Run with: node test-rooms.mjs

import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';

// Import server modules
import { setupSocketHandlers } from './server/socket-handlers.js';

const PORT = 4567;

// Create test server
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingTimeout: 30000,
  pingInterval: 25000,
});
setupSocketHandlers(io);

httpServer.listen(PORT, async () => {
  console.log(`Test server on port ${PORT}`);

  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) {
      console.log(`  ✅ ${msg}`);
      passed++;
    } else {
      console.log(`  ❌ ${msg}`);
      failed++;
    }
  }

  function makeClient() {
    return ioClient(`http://localhost:${PORT}`, {
      transports: ['websocket'],
      forceNew: true,
    });
  }

  function waitForConnect(client) {
    return new Promise(resolve => client.on('connect', resolve));
  }

  function emitCb(client, event, ...args) {
    return new Promise(resolve => {
      client.emit(event, ...args, (response) => resolve(response));
    });
  }

  function waitForEvent(client, event) {
    return new Promise(resolve => {
      client.once(event, resolve);
    });
  }

  try {
    // ---- TEST 1: Basic 3-player join ----
    console.log('\n--- TEST 1: Three players join a room ---');
    const c1 = makeClient();
    const c2 = makeClient();
    const c3 = makeClient();
    await Promise.all([waitForConnect(c1), waitForConnect(c2), waitForConnect(c3)]);

    // Player 1 creates room
    const createRes = await emitCb(c1, 'create_room', 'Alice');
    assert(createRes.roomCode && createRes.roomCode.length === 4, `Room created: ${createRes.roomCode}`);
    assert(createRes.players.length === 1, `Creator sees 1 player`);
    assert(createRes.players[0].connected === true, `Creator's connected status is true`);

    const roomCode = createRes.roomCode;

    // Player 2 joins - Player 1 should get notified
    const p1JoinedPromise = waitForEvent(c1, 'player_joined');
    const joinRes2 = await emitCb(c2, 'join_room', roomCode, 'Bob');
    const p1JoinedData = await p1JoinedPromise;

    assert(!joinRes2.error, `Bob joined without error`);
    assert(joinRes2.players.length === 2, `Bob sees 2 players`);
    assert(p1JoinedData.players.length === 2, `Alice notified: sees 2 players`);
    assert(p1JoinedData.players.every(p => p.connected === true), `All players show as connected`);

    // Player 3 joins - both Player 1 and Player 2 should get notified
    const p1Joined2Promise = waitForEvent(c1, 'player_joined');
    const p2Joined2Promise = waitForEvent(c2, 'player_joined');
    const joinRes3 = await emitCb(c3, 'join_room', roomCode, 'Charlie');
    const [p1Joined2Data, p2Joined2Data] = await Promise.all([p1Joined2Promise, p2Joined2Promise]);

    assert(!joinRes3.error, `Charlie joined without error`);
    assert(joinRes3.players.length === 3, `Charlie sees 3 players`);
    assert(p1Joined2Data.players.length === 3, `Alice notified: sees 3 players`);
    assert(p2Joined2Data.players.length === 3, `Bob notified: sees 3 players`);

    // ---- TEST 2: Duplicate name rejection ----
    console.log('\n--- TEST 2: Duplicate name rejected ---');
    const c4 = makeClient();
    await waitForConnect(c4);
    const dupeRes = await emitCb(c4, 'join_room', roomCode, 'Alice');
    assert(dupeRes.error && dupeRes.error.includes('already in the room'), `Duplicate "Alice" rejected: ${dupeRes.error}`);
    c4.disconnect();

    // ---- TEST 3: Full room rejection ----
    console.log('\n--- TEST 3: Full room rejected ---');
    const c5 = makeClient();
    await waitForConnect(c5);
    const fullRes = await emitCb(c5, 'join_room', roomCode, 'David');
    assert(fullRes.error && fullRes.error.includes('full'), `4th player rejected: ${fullRes.error}`);
    c5.disconnect();

    // ---- TEST 4: Disconnect and reconnect ----
    console.log('\n--- TEST 4: Disconnect and reconnect ---');
    // Bob disconnects
    const p1DisconnectPromise = waitForEvent(c1, 'player_disconnected');
    c2.disconnect();
    const disconnectData = await p1DisconnectPromise;
    assert(disconnectData.players.length === 3, `After disconnect: still 3 players in list`);
    const bobInList = disconnectData.players.find(p => p.name === 'Bob');
    assert(bobInList && bobInList.connected === false, `Bob shows as disconnected`);

    // Bob reconnects with new socket
    const c2b = makeClient();
    await waitForConnect(c2b);
    const p1ReconnectPromise = waitForEvent(c1, 'player_reconnected');
    const rejoinRes = await emitCb(c2b, 'join_room', roomCode, 'Bob');
    const reconnectData = await p1ReconnectPromise;

    assert(!rejoinRes.error, `Bob rejoined without error`);
    assert(rejoinRes.players.length === 3, `Bob sees 3 players after rejoin`);
    assert(reconnectData.players.length === 3, `Alice notified: 3 players after reconnect`);
    assert(reconnectData.players.every(p => p.connected === true), `All players connected after reconnect`);

    // ---- TEST 5: Each player's index stays consistent ----
    console.log('\n--- TEST 5: Player indices stable ---');
    assert(rejoinRes.yourIndex === 1, `Bob's index is still 1 after reconnect`);
    const aliceInList = rejoinRes.players.find(p => p.name === 'Alice');
    const charlieInList = rejoinRes.players.find(p => p.name === 'Charlie');
    assert(aliceInList && aliceInList.index === 0, `Alice is index 0`);
    assert(charlieInList && charlieInList.index === 2, `Charlie is index 2`);

    // Cleanup
    c1.disconnect();
    c2b.disconnect();
    c3.disconnect();

    // ---- Summary ----
    console.log(`\n============================`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log(`============================\n`);

  } catch (err) {
    console.error('Test error:', err);
  }

  httpServer.close();
  process.exit(failed > 0 ? 1 : 0);
});
