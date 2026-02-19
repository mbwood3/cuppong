import { emit, on, off } from '../network/socket.js';
import { EVENTS } from '../network/events.js';
import { PLAYER_COLORS, MAX_PLAYERS } from '../shared/constants.js';

const COLOR_HEX = PLAYER_COLORS.map(c => '#' + c.toString(16).padStart(6, '0'));

export function showWaitingRoom(container, { roomCode, players, yourIndex, isHost, onGameStart }) {
  let currentPlayers = [...players];

  function render() {
    container.innerHTML = `
      <div class="screen">
        <h1>Cup Pong</h1>
        <p style="color: #888; margin-bottom: 8px;">Share this code with friends:</p>
        <div class="room-code">${roomCode}</div>
        <button class="btn btn-secondary" id="btn-share" style="margin-bottom: 24px;">
          Copy Invite Link
        </button>
        <ul class="player-list">
          ${currentPlayers.map((p, i) => `
            <li>
              <span class="player-dot" style="background: ${COLOR_HEX[p.index]}"></span>
              <span>${p.name}</span>
              ${p.index === 0 ? '<span class="player-label">Host</span>' : ''}
            </li>
          `).join('')}
          ${currentPlayers.length < MAX_PLAYERS ? `
            <li style="opacity: 0.4;">
              <span class="player-dot" style="background: #555"></span>
              <span>Waiting for player${currentPlayers.length < 2 ? 's' : ''}...</span>
            </li>
          ` : ''}
        </ul>
        ${isHost && currentPlayers.length === MAX_PLAYERS ? `
          <button class="btn btn-primary" id="btn-start">Start Game</button>
        ` : ''}
        ${isHost && currentPlayers.length < MAX_PLAYERS ? `
          <p style="color: #666; font-size: 0.85rem;">Waiting for ${MAX_PLAYERS - currentPlayers.length} more player${MAX_PLAYERS - currentPlayers.length > 1 ? 's' : ''}</p>
        ` : ''}
        ${!isHost ? `
          <p style="color: #666; font-size: 0.85rem;">Waiting for host to start...</p>
        ` : ''}
      </div>
    `;

    // Share button
    document.getElementById('btn-share')?.addEventListener('click', async () => {
      const url = `${window.location.origin}/join/${roomCode}`;
      try {
        if (navigator.share) {
          await navigator.share({ title: 'Cup Pong', text: `Join my Cup Pong game!`, url });
        } else {
          await navigator.clipboard.writeText(url);
          const btn = document.getElementById('btn-share');
          btn.textContent = 'Copied!';
          setTimeout(() => btn.textContent = 'Copy Invite Link', 2000);
        }
      } catch (e) {
        // Fallback: just copy
        try {
          await navigator.clipboard.writeText(url);
        } catch (e2) {}
      }
    });

    // Start button
    document.getElementById('btn-start')?.addEventListener('click', async () => {
      const response = await emit(EVENTS.START_GAME, null);
      if (response.error) console.error(response.error);
    });
  }

  function onPlayerJoined(data) {
    currentPlayers.push(data);
    render();
  }

  function onGameStarted(gameState) {
    // Clean up listeners
    off(EVENTS.PLAYER_JOINED, onPlayerJoined);
    off(EVENTS.GAME_STARTED, onGameStarted);
    onGameStart(gameState);
  }

  on(EVENTS.PLAYER_JOINED, onPlayerJoined);
  on(EVENTS.GAME_STARTED, onGameStarted);

  render();
}
