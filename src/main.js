import { connect } from './network/socket.js';
import { showLobby } from './screens/lobby.js';
import { showWaitingRoom } from './screens/waiting-room.js';
import { showCreateGame } from './screens/create-game.js';
import { startGame } from './screens/game.js';
import { CUPS_PER_PLAYER } from './shared/constants.js';

const screenContainer = document.getElementById('screen-container');
const canvasContainer = document.getElementById('game-canvas-container');
const uiOverlay = document.getElementById('ui-overlay');

// Test mode: ?test to skip lobby and jump straight into game
if (new URLSearchParams(window.location.search).has('test')) {
  window.__socketId = 'test-player-0';
  window.__freeplay = true; // Play as all 3 players in test mode
  screenContainer.classList.add('hidden');
  const fakeGameState = {
    players: [
      { id: 'test-player-0', name: 'You', index: 0, cups: new Array(CUPS_PER_PLAYER).fill(true), eliminated: false },
      { id: 'test-player-1', name: 'Bot 1', index: 1, cups: new Array(CUPS_PER_PLAYER).fill(true), eliminated: false },
      { id: 'test-player-2', name: 'Bot 2', index: 2, cups: new Array(CUPS_PER_PLAYER).fill(true), eliminated: false },
    ],
    currentTurnIndex: 0,
    currentTarget: null,
    throwNumber: 0,
    hitsThisTurn: 0,
    turnPhase: 'selecting',
    winnerId: null,
    status: 'playing',
  };
  startGame(canvasContainer, uiOverlay, fakeGameState, 0);
} else {
  // Check for async game join URL: /play/:code
  const playMatch = window.location.pathname.match(/^\/play\/([A-Za-z0-9]{4})$/);
  if (playMatch) {
    // Async game join: show phone verification
    showPhoneVerify(screenContainer, playMatch[1].toUpperCase());
  } else {
    // Normal flow: connect + lobby
    connect();

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
      onFreeplay: (fakeGameState) => {
        // In freeplay, set socketId to player 0 and mark as test mode
        window.__socketId = 'freeplay-0';
        window.__freeplay = true;
        screenContainer.classList.add('hidden');
        startGame(canvasContainer, uiOverlay, fakeGameState, 0);
      },
      onAsyncGame: (hostName) => {
        showCreateGame(screenContainer, {
          hostName,
          onGameCreated: ({ gameCode, gameState, playerIndex, phone }) => {
            window.__socketId = phone;
            window.__asyncMode = true;
            screenContainer.classList.add('hidden');
            startGame(canvasContainer, uiOverlay, gameState, playerIndex, {
              gameCode,
              phone,
            });
          },
          onBack: () => {
            window.location.reload();
          },
        });
      },
    });
  }
}

function showPhoneVerify(container, gameCode) {
  container.innerHTML = `
    <div class="screen">
      <h1>Cup Pong</h1>
      <h2>Join Game ${gameCode}</h2>
      <input class="input" id="verify-phone" placeholder="Your phone number" type="tel" autocomplete="off" />
      <button class="btn btn-primary" id="btn-verify">Join Game</button>
      <div class="error-msg hidden" id="verify-error"></div>
    </div>
  `;

  document.getElementById('btn-verify').addEventListener('click', async () => {
    const phone = document.getElementById('verify-phone').value.trim();
    if (!phone) {
      document.getElementById('verify-error').textContent = 'Enter your phone number';
      document.getElementById('verify-error').classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch(`/api/game/${gameCode}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.error) {
        document.getElementById('verify-error').textContent = data.error;
        document.getElementById('verify-error').classList.remove('hidden');
        return;
      }

      // Set identity for async mode
      window.__socketId = phone;
      window.__asyncMode = true;

      screenContainer.classList.add('hidden');
      startGame(canvasContainer, uiOverlay, data.gameState, data.playerIndex, {
        gameCode,
        phone,
      });
    } catch (err) {
      document.getElementById('verify-error').textContent = 'Network error';
      document.getElementById('verify-error').classList.remove('hidden');
    }
  });
}
