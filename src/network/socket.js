import { io } from 'socket.io-client';
import { EVENTS } from './events.js';

let socket = null;
// Track current room for auto-rejoin on reconnect
let currentRoom = null; // { code, playerName, yourIndex }

export function setCurrentRoom(code, playerName, yourIndex) {
  currentRoom = code ? { code, playerName, yourIndex } : null;
}

export function getCurrentRoom() {
  return currentRoom;
}

export function connect() {
  if (socket) return socket;
  socket = io(window.location.origin, {
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });
  socket.on('connect', () => {
    console.log('Connected to server:', socket.id);
    window.__socketId = socket.id;

    // Auto-rejoin room on reconnect (mobile tab switch, network hiccup)
    if (currentRoom && socket.recovered === false) {
      console.log(`Reconnected - rejoining room ${currentRoom.code} as ${currentRoom.playerName}`);
      socket.emit('rejoin_room', currentRoom.code, currentRoom.playerName, (response) => {
        if (response.error) {
          console.warn('Failed to rejoin room:', response.error);
        } else {
          console.log('Successfully rejoined room', currentRoom.code);
        }
      });
    }
  });
  socket.on('connect_error', (err) => console.error('Socket connect error:', err.message));
  socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
    // Don't clear currentRoom - we want to rejoin on reconnect
  });
  return socket;
}

export function getSocket() {
  if (!socket) connect();
  return socket;
}

// emit with any number of data args, callback is always last
export function emit(event, ...args) {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (!s.connected) {
      // Wait for connection before emitting
      s.once('connect', () => {
        const cleanArgs = args.filter(a => a !== null && a !== undefined);
        s.emit(event, ...cleanArgs, (response) => {
          resolve(response);
        });
      });
      // Timeout after 10 seconds
      setTimeout(() => resolve({ error: 'Connection timeout' }), 10000);
      return;
    }
    // Filter out null/undefined to avoid sending garbage
    const cleanArgs = args.filter(a => a !== null && a !== undefined);
    s.emit(event, ...cleanArgs, (response) => {
      resolve(response);
    });
  });
}

export function on(event, callback) {
  getSocket().on(event, callback);
}

export function off(event, callback) {
  getSocket().off(event, callback);
}
