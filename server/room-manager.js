import { MAX_PLAYERS, ROOM_CODE_LENGTH, ROOM_TIMEOUT_MS } from './constants.js';

const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const rooms = new Map();
// Track pending removals so we can cancel if socket reconnects quickly
const pendingRemovals = new Map(); // socketId -> timeoutId

function generateRoomCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += CHARS[Math.floor(Math.random() * CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

export function createRoom(hostSocketId, hostName) {
  const code = generateRoomCode();
  const room = {
    code,
    players: [
      { id: hostSocketId, name: hostName, connected: true, index: 0 },
    ],
    hostId: hostSocketId,
    state: 'waiting', // waiting | playing | finished
    gameState: null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

export function joinRoom(code, socketId, playerName) {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };
  if (room.state !== 'waiting') return { error: 'Game already in progress' };

  // Check if this player is reconnecting (same name, currently disconnected)
  const disconnectedPlayer = room.players.find(p => p.name === playerName && !p.connected);
  if (disconnectedPlayer) {
    // Cancel any pending removal
    if (pendingRemovals.has(disconnectedPlayer.id)) {
      clearTimeout(pendingRemovals.get(disconnectedPlayer.id));
      pendingRemovals.delete(disconnectedPlayer.id);
    }
    // Update socket ID and mark connected
    disconnectedPlayer.id = socketId;
    disconnectedPlayer.connected = true;
    room.lastActivity = Date.now();
    return { room, player: disconnectedPlayer, isReconnect: true };
  }

  // If a connected player with the same name exists, reject (no duplicate names)
  const connectedDupe = room.players.find(p => p.name === playerName && p.connected);
  if (connectedDupe) return { error: 'A player with that name is already in the room' };

  if (room.players.length >= MAX_PLAYERS) return { error: 'Room is full' };
  if (room.players.some(p => p.id === socketId)) return { error: 'Already in room' };

  const player = { id: socketId, name: playerName, connected: true, index: room.players.length };
  room.players.push(player);
  room.lastActivity = Date.now();
  return { room, player, isReconnect: false };
}

export function getRoom(code) {
  return rooms.get(code);
}

export function getRoomByPlayerId(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some(p => p.id === socketId)) {
      return room;
    }
  }
  return null;
}

// Mark player as disconnected but DON'T remove immediately.
// In waiting state, give them time to reconnect (mobile tab switching, etc.)
export function handleDisconnect(socketId) {
  for (const [code, room] of rooms.entries()) {
    const playerIndex = room.players.findIndex(p => p.id === socketId);
    if (playerIndex !== -1) {
      // Always mark as disconnected first
      room.players[playerIndex].connected = false;
      console.log(`Player "${room.players[playerIndex].name}" disconnected from room ${code} (state: ${room.state})`);

      if (room.state === 'waiting') {
        // Give them 15 seconds to reconnect before actually removing
        const timeoutId = setTimeout(() => {
          pendingRemovals.delete(socketId);
          const player = room.players.find(p => p.id === socketId);
          if (player && !player.connected) {
            console.log(`Removing player "${player.name}" from room ${code} (didn't reconnect)`);
            room.players.splice(room.players.indexOf(player), 1);
            // Reassign indices
            room.players.forEach((p, i) => p.index = i);
            if (room.players.length === 0) {
              rooms.delete(code);
              return;
            }
            // Reassign host if needed
            if (room.hostId === socketId) {
              room.hostId = room.players[0].id;
            }
          }
        }, 15000);
        pendingRemovals.set(socketId, timeoutId);
      }

      return { room, removed: false };
    }
  }
  return { room: null, removed: false };
}

// Called when a socket reconnects (new socket ID) and wants to rejoin
export function reconnectPlayer(code, socketId, playerName) {
  const room = rooms.get(code);
  if (!room) return null;
  const player = room.players.find(p => p.name === playerName && !p.connected);
  if (player) {
    // Cancel pending removal
    if (pendingRemovals.has(player.id)) {
      clearTimeout(pendingRemovals.get(player.id));
      pendingRemovals.delete(player.id);
    }
    player.id = socketId;
    player.connected = true;
    room.lastActivity = Date.now();
    return { room, player };
  }
  return null;
}

// Update socket ID for a player (used when socket reconnects with new ID)
export function updatePlayerSocketId(oldSocketId, newSocketId) {
  for (const room of rooms.values()) {
    const player = room.players.find(p => p.id === oldSocketId);
    if (player) {
      // Cancel pending removal for old socket
      if (pendingRemovals.has(oldSocketId)) {
        clearTimeout(pendingRemovals.get(oldSocketId));
        pendingRemovals.delete(oldSocketId);
      }
      player.id = newSocketId;
      player.connected = true;
      return { room, player };
    }
  }
  return null;
}

// Cleanup stale rooms periodically (based on last activity, not creation time)
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    const timeout = room.state === 'waiting' ? ROOM_TIMEOUT_MS : ROOM_TIMEOUT_MS * 2;
    if (now - room.lastActivity > timeout) {
      console.log(`Cleaning up stale room ${code} (inactive for ${Math.round((now - room.lastActivity) / 60000)} min)`);
      rooms.delete(code);
    }
  }
}, 60000);
