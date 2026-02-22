import { emit, on, off } from '../network/socket.js';
import { EVENTS } from '../network/events.js';
import { PLAYER_COLORS, MAX_PLAYERS } from '../shared/constants.js';

const COLOR_HEX = PLAYER_COLORS.map(c => '#' + c.toString(16).padStart(6, '0'));

export function showWaitingRoom(container, { roomCode, players, yourIndex, isHost, onGameStart }) {
  let currentPlayers = [...players];
  let cleaned = false;

  // Helper: update players from server data (always use server as source of truth)
  function syncPlayers(serverPlayers) {
    if (Array.isArray(serverPlayers) && serverPlayers.length > 0) {
      currentPlayers = serverPlayers;
      console.log('[WaitingRoom] Synced players:', currentPlayers.map(p => `${p.name}(${p.connected !== false ? 'on' : 'off'})`).join(', '));
      render();
    }
  }

  function render() {
    const connectedCount = currentPlayers.filter(p => p.connected !== false).length;
    container.innerHTML = `
      <div class="screen">
        <h1>Cup Pong</h1>
        <p style="color: #888; margin-bottom: 8px;">Share this code with friends:</p>
        <div class="room-code">${roomCode}</div>
        <button class="btn btn-secondary" id="btn-share" style="margin-bottom: 24px;">
          Copy Invite Link
        </button>
        <ul class="player-list">
          ${currentPlayers.map((p) => `
            <li ${p.connected === false ? 'style="opacity: 0.5;"' : ''}>
              <span class="player-dot" style="background: ${COLOR_HEX[p.index] || '#555'}"></span>
              <span>${p.name}</span>
              ${p.index === 0 ? '<span class="player-label">Host</span>' : ''}
              ${p.connected === false ? '<span style="font-size: 0.8rem; color: #888;">(reconnecting...)</span>' : ''}
            </li>
          `).join('')}
          ${currentPlayers.length < MAX_PLAYERS ? `
            <li style="opacity: 0.4;">
              <span class="player-dot" style="background: #555"></span>
              <span>Waiting for player${currentPlayers.length < 2 ? 's' : ''}...</span>
            </li>
          ` : ''}
        </ul>
        ${isHost && connectedCount === MAX_PLAYERS ? `
          <button class="btn btn-primary" id="btn-start">Start Game</button>
        ` : ''}
        ${isHost && connectedCount < MAX_PLAYERS ? `
          <p style="color: #666; font-size: 0.85rem;">Waiting for ${MAX_PLAYERS - connectedCount} more player${MAX_PLAYERS - connectedCount > 1 ? 's' : ''}</p>
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
          if (btn) {
            btn.textContent = 'Copied!';
            setTimeout(() => { if (btn) btn.textContent = 'Copy Invite Link'; }, 2000);
          }
        }
      } catch (e) {
        try { await navigator.clipboard.writeText(url); } catch (e2) {}
      }
    });

    // Start button
    document.getElementById('btn-start')?.addEventListener('click', async () => {
      const response = await emit(EVENTS.START_GAME, null);
      if (response.error) console.error('Start game error:', response.error);
    });
  }

  function onPlayerJoined(data) {
    console.log('[WaitingRoom] player_joined event:', data);
    syncPlayers(data.players);
  }

  function onPlayerDisconnected(data) {
    console.log('[WaitingRoom] player_disconnected event:', data);
    syncPlayers(data.players);
  }

  function onPlayerReconnected(data) {
    console.log('[WaitingRoom] player_reconnected event:', data);
    syncPlayers(data.players);
  }

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    off(EVENTS.PLAYER_JOINED, onPlayerJoined);
    off(EVENTS.PLAYER_DISCONNECTED, onPlayerDisconnected);
    off(EVENTS.PLAYER_RECONNECTED, onPlayerReconnected);
    off(EVENTS.GAME_STARTED, onGameStarted);
  }

  function onGameStarted(gameState) {
    cleanup();
    onGameStart(gameState);
  }

  on(EVENTS.PLAYER_JOINED, onPlayerJoined);
  on(EVENTS.PLAYER_DISCONNECTED, onPlayerDisconnected);
  on(EVENTS.PLAYER_RECONNECTED, onPlayerReconnected);
  on(EVENTS.GAME_STARTED, onGameStarted);

  render();
}
