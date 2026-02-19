import { MAX_PLAYERS, ROOM_CODE_LENGTH, ROOM_TIMEOUT_MS } from './constants.js';

const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const rooms = new Map();

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
  };
  rooms.set(code, room);
  return room;
}

export function joinRoom(code, socketId, playerName) {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };
  if (room.state !== 'waiting') return { error: 'Game already in progress' };
  if (room.players.length >= MAX_PLAYERS) return { error: 'Room is full' };
  if (room.players.some(p => p.id === socketId)) return { error: 'Already in room' };

  const player = { id: socketId, name: playerName, connected: true, index: room.players.length };
  room.players.push(player);
  return { room, player };
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

export function removePlayer(socketId) {
  for (const [code, room] of rooms.entries()) {
    const playerIndex = room.players.findIndex(p => p.id === socketId);
    if (playerIndex !== -1) {
      if (room.state === 'waiting') {
        room.players.splice(playerIndex, 1);
        // Reassign indices
        room.players.forEach((p, i) => p.index = i);
        if (room.players.length === 0) {
          rooms.delete(code);
          return { room: null, removed: true };
        }
        // Reassign host if needed
        if (room.hostId === socketId) {
          room.hostId = room.players[0].id;
        }
      } else {
        // Mark as disconnected during gameplay
        room.players[playerIndex].connected = false;
      }
      return { room, removed: false };
    }
  }
  return { room: null, removed: false };
}

export function reconnectPlayer(code, socketId, playerName) {
  const room = rooms.get(code);
  if (!room) return null;
  const player = room.players.find(p => p.name === playerName && !p.connected);
  if (player) {
    player.id = socketId;
    player.connected = true;
    return { room, player };
  }
  return null;
}

// Cleanup stale rooms periodically
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.createdAt > ROOM_TIMEOUT_MS) {
      rooms.delete(code);
    }
  }
}, 60000);
