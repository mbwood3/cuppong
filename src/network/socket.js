import { io } from 'socket.io-client';
import { EVENTS } from './events.js';

let socket = null;

export function connect() {
  if (socket) return socket;
  socket = io(window.location.origin, {
    transports: ['polling', 'websocket'],
  });
  socket.on('connect', () => {
    console.log('Connected to server:', socket.id);
    window.__socketId = socket.id;
  });
  socket.on('connect_error', (err) => console.error('Socket connect error:', err.message));
  socket.on('disconnect', (reason) => console.log('Disconnected from server:', reason));
  return socket;
}

export function getSocket() {
  if (!socket) connect();
  return socket;
}

// emit with any number of data args, callback is always last
export function emit(event, ...args) {
  return new Promise((resolve) => {
    // Filter out null/undefined to avoid sending garbage
    const cleanArgs = args.filter(a => a !== null && a !== undefined);
    getSocket().emit(event, ...cleanArgs, (response) => {
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
