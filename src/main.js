import { connect } from './network/socket.js';
import { showLobby } from './screens/lobby.js';
import { showWaitingRoom } from './screens/waiting-room.js';
import { startGame } from './screens/game.js';

// Connect to server (also sets window.__socketId on connect)
connect();

const screenContainer = document.getElementById('screen-container');
const canvasContainer = document.getElementById('game-canvas-container');
const uiOverlay = document.getElementById('ui-overlay');

// Parse URL for room code
const pathMatch = window.location.pathname.match(/^\/join\/([A-Za-z0-9]{4})$/);
const prefillCode = pathMatch ? pathMatch[1].toUpperCase() : null;

// Start with lobby
showLobby(screenContainer, {
  prefillCode,
  onRoomJoined: (roomInfo) => {
    showWaitingRoom(screenContainer, {
      roomCode: roomInfo.roomCode,
      players: roomInfo.players,
      yourIndex: roomInfo.yourIndex,
      isHost: roomInfo.isHost,
      onGameStart: (gameState) => {
        startGame(canvasContainer, uiOverlay, gameState, roomInfo.yourIndex);
      },
    });
  },
});
