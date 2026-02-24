import { emit, setCurrentRoom } from '../network/socket.js';
import { EVENTS } from '../network/events.js';
import { PLAYER_COLORS, CUPS_PER_PLAYER } from '../shared/constants.js';

export function showLobby(container, { onRoomJoined, onFreeplay, onAsyncGame, prefillCode }) {
  const isJoining = !!prefillCode;

  container.innerHTML = `
    <div class="screen">
      <h1>Cup Pong</h1>
      <h2>3-Player Cutthroat</h2>
      <div id="lobby-main">
        <input class="input" id="player-name" placeholder="Your name" maxlength="12" autocomplete="off" />
        <div id="lobby-buttons">
          <button class="btn btn-primary" id="btn-create">Create Room</button>
          <button class="btn btn-secondary" id="btn-join-toggle">Join Room</button>
          <button class="btn btn-secondary" id="btn-freeplay" style="margin-top: 16px; border-color: rgba(255,255,255,0.1);">Practice (Freeplay)</button>
          <button class="btn btn-secondary" id="btn-async" style="margin-top: 8px; border-color: rgba(255,255,255,0.1);">Send Async Game</button>
        </div>
        <div id="join-section" class="${isJoining ? '' : 'hidden'}">
          <input class="input" id="room-code-input" placeholder="Room code" maxlength="4"
            value="${prefillCode || ''}" autocomplete="off" style="text-transform: uppercase; letter-spacing: 0.2em; font-size: 1.4rem;" />
          <button class="btn btn-primary" id="btn-join">Join</button>
        </div>
        <div class="error-msg hidden" id="error-msg"></div>
      </div>
    </div>
  `;

  const nameInput = document.getElementById('player-name');
  const joinToggle = document.getElementById('btn-join-toggle');
  const joinSection = document.getElementById('join-section');
  const codeInput = document.getElementById('room-code-input');
  const errorMsg = document.getElementById('error-msg');
  const lobbyButtons = document.getElementById('lobby-buttons');

  // Auto-focus
  nameInput.focus();

  if (isJoining) {
    lobbyButtons.classList.add('hidden');
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
  }

  function getName() {
    const name = nameInput.value.trim();
    if (!name) {
      showError('Enter your name');
      return null;
    }
    return name;
  }

  document.getElementById('btn-create').addEventListener('click', async () => {
    const name = getName();
    if (!name) return;

    const response = await emit(EVENTS.CREATE_ROOM, name);
    if (response.error) return showError(response.error);

    setCurrentRoom(response.roomCode, name, response.yourIndex);
    onRoomJoined({
      roomCode: response.roomCode,
      players: response.players,
      yourIndex: response.yourIndex,
      isHost: true,
      yourName: name,
    });
  });

  document.getElementById('btn-freeplay').addEventListener('click', () => {
    const fakeGameState = {
      players: [
        { id: 'freeplay-0', name: 'Player 1', index: 0, cups: new Array(CUPS_PER_PLAYER).fill(true), eliminated: false },
        { id: 'freeplay-1', name: 'Player 2', index: 1, cups: new Array(CUPS_PER_PLAYER).fill(true), eliminated: false },
        { id: 'freeplay-2', name: 'Player 3', index: 2, cups: new Array(CUPS_PER_PLAYER).fill(true), eliminated: false },
      ],
      currentTurnIndex: 0,
      currentTarget: null,
      throwNumber: 0,
      hitsThisTurn: 0,
      turnPhase: 'selecting',
      winnerId: null,
      status: 'playing',
    };
    onFreeplay(fakeGameState);
  });

  document.getElementById('btn-async').addEventListener('click', () => {
    const name = getName();
    if (!name) return;
    onAsyncGame(name);
  });

  joinToggle.addEventListener('click', () => {
    joinSection.classList.toggle('hidden');
    if (!joinSection.classList.contains('hidden')) {
      codeInput.focus();
    }
  });

  document.getElementById('btn-join').addEventListener('click', async () => {
    const name = getName();
    if (!name) return;
    const code = codeInput.value.trim().toUpperCase();
    if (code.length !== 4) return showError('Enter a 4-letter room code');

    const response = await emit(EVENTS.JOIN_ROOM, code, name);
    if (response.error) return showError(response.error);

    setCurrentRoom(response.roomCode, name, response.yourIndex);
    onRoomJoined({
      roomCode: response.roomCode,
      players: response.players,
      yourIndex: response.yourIndex,
      isHost: false,
      yourName: name,
    });
  });
}
