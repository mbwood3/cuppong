export function showCreateGame(container, { hostName, onGameCreated, onBack }) {
  container.innerHTML = `
    <div class="screen">
      <h1>Cup Pong</h1>
      <h2>Create Async Game</h2>
      <div id="create-game-form">
        <div class="player-form-row">
          <div style="font-size: 0.85rem; color: #888; margin-bottom: 4px;">Player 1 (You)</div>
          <input class="input" id="p0-name" placeholder="Your name" value="${hostName || ''}" maxlength="12" autocomplete="off" />
          <input class="input" id="p0-phone" placeholder="Your phone (e.g. +15551234567)" type="tel" autocomplete="off" />
        </div>
        <div class="player-form-row">
          <div style="font-size: 0.85rem; color: #888; margin-bottom: 4px;">Player 2</div>
          <input class="input" id="p1-name" placeholder="Name" maxlength="12" autocomplete="off" />
          <input class="input" id="p1-phone" placeholder="Phone number" type="tel" autocomplete="off" />
        </div>
        <div class="player-form-row">
          <div style="font-size: 0.85rem; color: #888; margin-bottom: 4px;">Player 3</div>
          <input class="input" id="p2-name" placeholder="Name" maxlength="12" autocomplete="off" />
          <input class="input" id="p2-phone" placeholder="Phone number" type="tel" autocomplete="off" />
        </div>
        <button class="btn btn-primary" id="btn-create-async">Create Game</button>
        <button class="btn btn-secondary" id="btn-back-lobby">Back</button>
        <div class="error-msg hidden" id="create-error"></div>
      </div>
    </div>
  `;

  const errorMsg = document.getElementById('create-error');

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
  }

  document.getElementById('btn-back-lobby').addEventListener('click', () => {
    onBack();
  });

  document.getElementById('btn-create-async').addEventListener('click', async () => {
    const players = [];
    for (let i = 0; i < 3; i++) {
      const name = document.getElementById(`p${i}-name`).value.trim();
      const phone = document.getElementById(`p${i}-phone`).value.trim();
      if (!name) return showError(`Enter name for Player ${i + 1}`);
      if (!phone) return showError(`Enter phone for Player ${i + 1}`);
      players.push({ name, phone });
    }

    // Disable button while creating
    const btn = document.getElementById('btn-create-async');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players }),
      });
      const data = await res.json();
      if (data.error) {
        showError(data.error);
        btn.disabled = false;
        btn.textContent = 'Create Game';
        return;
      }

      // Game created! Verify ourselves and start the game
      const verifyRes = await fetch(`/api/game/${data.gameCode}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: players[0].phone }),
      });
      const verifyData = await verifyRes.json();
      if (verifyData.error) {
        showError(verifyData.error);
        btn.disabled = false;
        btn.textContent = 'Create Game';
        return;
      }

      // Show the game code + share link before entering
      const shareUrl = `${window.location.origin}/play/${data.gameCode}`;
      container.innerHTML = `
        <div class="screen">
          <h1>Cup Pong</h1>
          <h2>Game Created!</h2>
          <div style="font-size: 2rem; font-weight: 800; letter-spacing: 0.3em; color: #e74c7a; margin: 16px 0;">
            ${data.gameCode}
          </div>
          <div style="font-size: 0.85rem; color: rgba(255,255,255,0.6); margin-bottom: 16px;">
            Share this link with the other players:
          </div>
          <div style="background: rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; word-break: break-all; font-size: 0.9rem; color: #fff;">
            ${shareUrl}
          </div>
          <button class="btn btn-secondary" id="btn-copy-link" style="margin-bottom: 16px;">Copy Link</button>
          <button class="btn btn-primary" id="btn-start-game">Start Playing</button>
        </div>
      `;

      document.getElementById('btn-copy-link').addEventListener('click', () => {
        navigator.clipboard.writeText(shareUrl).then(() => {
          document.getElementById('btn-copy-link').textContent = 'Copied!';
          setTimeout(() => {
            document.getElementById('btn-copy-link').textContent = 'Copy Link';
          }, 2000);
        }).catch(() => {
          // Fallback: select the text
          const range = document.createRange();
          const linkDiv = document.getElementById('btn-copy-link').previousElementSibling;
          range.selectNodeContents(linkDiv);
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(range);
        });
      });

      document.getElementById('btn-start-game').addEventListener('click', () => {
        onGameCreated({
          gameCode: data.gameCode,
          gameState: verifyData.gameState,
          playerIndex: verifyData.playerIndex,
          phone: players[0].phone,
        });
      });
    } catch (err) {
      showError('Network error: ' + err.message);
      btn.disabled = false;
      btn.textContent = 'Create Game';
    }
  });
}
