import { io } from 'socket.io-client';
import { EVENTS } from './events.js';

let socket = null;
// Track current room for auto-rejoin on reconnect
let currentRoom = null; // { code, playerName, yourIndex }
let hasConnectedBefore = false; // Track if this is a reconnect vs first connect

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
    console.log('Connected to server:', socket.id, hasConnectedBefore ? '(reconnect)' : '(first connect)');
    window.__socketId = socket.id;

    // Auto-rejoin room ONLY on actual reconnects (not first connect)
    if (currentRoom && hasConnectedBefore) {
      console.log(`Reconnected - rejoining room ${currentRoom.code} as ${currentRoom.playerName}`);
      socket.emit('rejoin_room', currentRoom.code, currentRoom.playerName, (response) => {
        if (response && response.error) {
          console.warn('Failed to rejoin room:', response.error);
        } else {
          console.log('Successfully rejoined room', currentRoom.code);
        }
      });
    }

    hasConnectedBefore = true;
  });
  socket.on('connect_error', (err) => console.error('Socket connect error:', err.message));
  socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
    // Don't clear currentRoom - we want to rejoin on reconnect
  });

  // iOS aggressively suspends background tabs, killing the WebSocket.
  // When the tab comes back to foreground, proactively reconnect.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && socket) {
      console.log('[Socket] Tab became visible, checking connection...');
      if (!socket.connected) {
        console.log('[Socket] Disconnected — forcing reconnect');
        socket.connect();
      }
    }
  });

  return socket;
}

export function getSocket() {
  if (!socket) connect();
  return socket;
}

// emit with any number of data args, callback is always last
export function emit(event, ...args) {
  return new Promise((resolve) => {
    const s = getSocket();
    // Filter out null/undefined to avoid sending garbage
    const cleanArgs = args.filter(a => a !== null && a !== undefined);

    const doEmit = () => {
      console.log(`[Socket] Emitting ${event}`, cleanArgs.length ? cleanArgs : '(no args)');
      s.emit(event, ...cleanArgs, (response) => {
        console.log(`[Socket] ${event} response:`, response);
        resolve(response);
      });
    };

    if (!s.connected) {
      console.log(`[Socket] Not connected, waiting to emit ${event}...`);
      // Wait for connection before emitting
      const onConnect = () => {
        clearTimeout(timer);
        doEmit();
      };
      s.once('connect', onConnect);
      // Timeout after 10 seconds
      const timer = setTimeout(() => {
        s.off('connect', onConnect);
        console.warn(`[Socket] Timeout waiting to emit ${event}`);
        resolve({ error: 'Connection timeout' });
      }, 10000);
      return;
    }
    doEmit();
  });
}

export function on(event, callback) {
  getSocket().on(event, callback);
}

export function off(event, callback) {
  getSocket().off(event, callback);
}
