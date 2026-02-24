import { initScene, onAnimate, getScene, getCamera, getRenderer } from '../game/scene.js';
import { createTable } from '../game/table.js';
import { createCups, removeCup, getCupWorldPosition, repositionCups } from '../game/cups.js';
import { createBall, showBall, updateBallPosition, hideBall } from '../game/ball.js';
import { initPhysics, launchBall, stepPhysics, disableCupTrigger, stopSimulation, rebuildCupColliders } from '../game/physics.js';
import { initThrowControls, enableThrow, disableThrow, getThrowStartPosition } from '../game/throw.js';
import { initCameraController, setCameraOverhead, setCameraThrowView, setCameraSpectatorView, setCameraPlayerView, updateCamera } from '../game/camera-controller.js';
import { initHitEffects, playCupHitEffect, updateHitEffects, cameraShake } from '../game/hit-effects.js';
import { emit, on, off } from '../network/socket.js';
import { EVENTS } from '../network/events.js';
import { PLAYER_COLORS, PLAYER_COLOR_NAMES, CUPS_PER_PLAYER, THROWS_PER_TURN, PLAYER_ANGLES, PLAYER_DISTANCE } from '../shared/constants.js';
import { getCupTriangleCenter } from '../game/cups.js';
import { getAvailablePresets } from '../game/rerack-presets.js';

const COLOR_HEX = PLAYER_COLORS.map(c => '#' + c.toString(16).padStart(6, '0'));

let gameState = null;
let myIndex = -1;
let cupMeshes = null;
let overlay = null;
let lastTime = 0;
let isTestMode = false;
let isFreeplay = false;
let isAsyncMode = false;
let asyncGameCode = null;
let asyncPhone = null;

async function submitAsyncAction(action) {
  const response = await fetch(`/api/game/${asyncGameCode}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: asyncPhone, action }),
  });
  return response.json();
}


export function startGame(canvasContainer, uiOverlay, initialGameState, playerIndex, asyncConfig) {
  gameState = initialGameState;
  myIndex = playerIndex;
  overlay = uiOverlay;
  isTestMode = new URLSearchParams(window.location.search).has('test');
  isFreeplay = !!window.__freeplay;

  if (asyncConfig) {
    isAsyncMode = true;
    asyncGameCode = asyncConfig.gameCode;
    asyncPhone = asyncConfig.phone;
  }

  // Hide screen container, show game
  document.getElementById('screen-container').classList.add('hidden');

  // Init 3D scene
  const { scene, camera, renderer } = initScene(canvasContainer);

  // Build the world
  createTable(scene);
  cupMeshes = createCups(scene);
  createBall(scene);
  initPhysics();
  initThrowControls(renderer.domElement, scene);
  initCameraController(camera);
  initHitEffects(scene);

  // Start with player's behind-view (Game Pigeon style)
  setCameraPlayerView(myIndex);

  // Animation loop
  lastTime = performance.now();
  onAnimate(() => {
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    updateCamera(dt);
    updateHitEffects();

    // Step physics if active
    const physResult = stepPhysics();
    if (physResult) {
      updateBallPosition(physResult.x, physResult.y, physResult.z);
    }
  });

  // Listen for game events (only in multiplayer mode)
  if (!isTestMode && !isFreeplay && !isAsyncMode) {
    on(EVENTS.TARGET_SELECTED, onTargetSelected);
    on(EVENTS.BALL_THROWN, onBallThrown);
    on(EVENTS.THROW_RESOLVED, onThrowResolved);
    on(EVENTS.CUPS_RERACKED, onCupsReracked);
  }

  // Initial UI update
  updateUI();
  handleTurnPhase();
}

function updateUI() {
  if (!overlay) return;

  const currentPlayer = gameState.players[gameState.currentTurnIndex];
  const isMyTurn = currentPlayer.id === getMyId();

  // Only update the HUD elements, don't wipe overlay (preserves target selector etc.)
  let hudEl = overlay.querySelector('.hud');
  if (!hudEl) {
    hudEl = document.createElement('div');
    hudEl.className = 'hud';
    overlay.prepend(hudEl);
  }

  hudEl.innerHTML = `
    <div class="hud-top">
      <div class="turn-indicator" style="color: ${COLOR_HEX[gameState.currentTurnIndex]}">
        ${isMyTurn ? 'Your turn!' : `${currentPlayer.name}'s turn`}
      </div>
      <div class="throw-counter">
        Throw ${gameState.throwNumber + 1} of 2
        ${gameState.hitsThisTurn > 0 ? ` | ${gameState.hitsThisTurn} hit` : ''}
      </div>
      ${isMyTurn && currentPlayer.reracksRemaining > 0 ? `
        <div class="rerack-counter" style="font-size: 0.8rem; opacity: 0.7;">
          Reracks: ${currentPlayer.reracksRemaining} remaining
        </div>
      ` : ''}
    </div>
    <div class="hud-bottom">
      <div class="cup-counts">
        ${gameState.players.map((p, i) => {
          const cupsLeft = p.cups.filter(c => c).length;
          return `
            <div class="cup-count-item" style="opacity: ${p.eliminated ? 0.3 : 1}">
              <div class="cup-count-number" style="color: ${COLOR_HEX[i]}">${cupsLeft}</div>
              <div>${p.name}${p.eliminated ? ' (out)' : ''}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function getMyId() {
  return window.__socketId;
}

function handleTurnPhase() {
  const currentPlayer = gameState.players[gameState.currentTurnIndex];

  // In freeplay, we control all players — switch identity to current player
  if (isFreeplay) {
    myIndex = gameState.currentTurnIndex;
    window.__socketId = currentPlayer.id;
  }

  const isMyTurn = currentPlayer.id === getMyId();

  if (gameState.status === 'finished') {
    showGameOver();
    return;
  }

  if (gameState.turnPhase === 'selecting') {
    if (isMyTurn) {
      showTargetSelector();
      setCameraPlayerView(myIndex);
    } else {
      if (isAsyncMode) {
        showWaitingForTurn();
        return;
      }
      setCameraPlayerView(myIndex);
      disableThrow();
    }
  } else if (gameState.turnPhase === 'throwing') {
    if (isMyTurn) {
      // Show throw view and enable swipe
      setCameraThrowView(gameState.currentTurnIndex, gameState.currentTarget);
      setTimeout(() => {
        showSwipeHint();
        enableThrow((velocity) => {
          onMyThrow(velocity);
        });
      }, 600); // wait for camera transition
    } else {
      if (isAsyncMode) {
        showWaitingForTurn();
        return;
      }
      setCameraSpectatorView(gameState.currentTurnIndex, gameState.currentTarget);
      disableThrow();
    }
  } else if (gameState.turnPhase === 'reracking') {
    if (isMyTurn) {
      showRerackUI(gameState.currentTarget);
    } else {
      // Other players: just show "Player is reracking" message
      setCameraOverhead();
      disableThrow();
    }
  }
}

function showTargetSelector() {
  // Remove existing selector if present
  const existing = overlay.querySelector('.target-selector');
  if (existing) existing.remove();

  const opponents = gameState.players.filter((p, i) =>
    i !== myIndex && !p.eliminated
  );

  let html = `
    <div class="target-selector">
      <h3>Choose your target</h3>
      ${opponents.map(p => `
        <button class="btn btn-target" style="background: ${COLOR_HEX[p.index]}22; border: 2px solid ${COLOR_HEX[p.index]}"
          data-target="${p.index}">
          ${p.name} (${p.cups.filter(c => c).length} cups)
        </button>
      `).join('')}
    </div>
  `;

  // Append to overlay
  const selectorDiv = document.createElement('div');
  selectorDiv.innerHTML = html;
  const selector = selectorDiv.firstElementChild;
  overlay.appendChild(selector);

  selector.querySelectorAll('[data-target]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetIndex = parseInt(btn.dataset.target);
      selector.remove();

      if (isTestMode || isFreeplay) {
        // Handle locally in test/freeplay mode
        gameState.currentTarget = targetIndex;
        const currentPlayer = gameState.players[gameState.currentTurnIndex];
        if (currentPlayer.reracksRemaining > 0) {
          gameState.turnPhase = 'reracking';
        } else {
          gameState.turnPhase = 'throwing';
        }
        updateUI();
        handleTurnPhase();
      } else if (isAsyncMode) {
        const data = await submitAsyncAction({ type: 'select_target', targetIndex });
        if (data.error) {
          console.error('Select target error:', data.error);
          return;
        }
        gameState = data.gameState;
        updateUI();
        handleTurnPhase();
      } else {
        const response = await emit(EVENTS.SELECT_TARGET, targetIndex);
        if (response.error) {
          console.error('Select target error:', response.error);
        }
      }
    });
  });
}

function showSwipeHint() {
  const existing = overlay.querySelector('.swipe-hint');
  if (existing) existing.remove();

  const hint = document.createElement('div');
  hint.className = 'swipe-hint';
  hint.innerHTML = 'Swipe up to throw';
  overlay.appendChild(hint);
}

function hideSwipeHint() {
  const hint = overlay.querySelector('.swipe-hint');
  if (hint) hint.remove();
}

async function onMyThrow(velocity) {
  disableThrow();
  hideSwipeHint();

  // Unlock audio context during user gesture (iOS Safari requires this)
  unlockAudio();

  // Show ball at throw start position
  const startPos = getThrowStartPosition(gameState.currentTurnIndex, gameState.currentTarget);
  showBall(startPos.x, startPos.y, startPos.z);

  // Transform velocity based on camera/throw direction
  const transformedVelocity = transformVelocityForDirection(
    velocity,
    gameState.currentTurnIndex,
    gameState.currentTarget
  );

  if (isTestMode || isFreeplay) {
    // In test/freeplay mode, run physics locally and handle result directly
    launchBall(
      startPos,
      transformedVelocity,
      null,
      // On hit
      (playerIndex, cupIndex) => {
        handleTestThrowResult(true, playerIndex, cupIndex);
      },
      // On miss
      () => {
        handleTestThrowResult(false, null, null);
      }
    );
  } else if (isAsyncMode) {
    // Async mode: run physics locally, then report result via REST
    launchBall(
      startPos,
      transformedVelocity,
      null,
      // On hit
      async (playerIndex, cupIndex) => {
        const data = await submitAsyncAction({
          type: 'throw_result',
          hit: true,
          cupIndex,
        });
        if (!data.error) {
          handleAsyncThrowResult(data, true, playerIndex, cupIndex);
        }
      },
      // On miss
      async () => {
        const data = await submitAsyncAction({
          type: 'throw_result',
          hit: false,
          cupIndex: null,
        });
        if (!data.error) {
          handleAsyncThrowResult(data, false, null, null);
        }
      }
    );
  } else {
    // Send throw to server (broadcast to other players)
    await emit(EVENTS.THROW_BALL, transformedVelocity);

    // Run physics locally
    launchBall(
      startPos,
      transformedVelocity,
      null,
      // On hit
      (playerIndex, cupIndex) => {
        emit(EVENTS.THROW_RESULT, { hit: true, cupIndex, targetIndex: playerIndex });
      },
      // On miss
      () => {
        emit(EVENTS.THROW_RESULT, { hit: false, cupIndex: null, targetIndex: null });
      }
    );
  }
}

function handleTestThrowResult(hit, targetPlayerIndex, cupIndex) {
  // Resolve throw locally in test mode (mirrors server game-logic.js)
  const result = { hit: false, cupIndex: null, ballsBack: false, gameOver: false, winnerId: null };

  if (hit && cupIndex != null && targetPlayerIndex != null) {
    const target = gameState.players[targetPlayerIndex];
    if (target && target.cups[cupIndex]) {
      target.cups[cupIndex] = false;
      result.hit = true;
      result.cupIndex = cupIndex;
      gameState.hitsThisTurn++;

      // Remove cup visually + play hit effects
      const cupPos = getCupWorldPosition(targetPlayerIndex, cupIndex);
      removeCup(cupMeshes, getScene(), targetPlayerIndex, cupIndex);
      disableCupTrigger(targetPlayerIndex, cupIndex);
      flashScreen(COLOR_HEX[gameState.currentTurnIndex]);
      showHitText();
      if (cupPos) {
        playCupHitEffect(cupPos.x, cupPos.y, cupPos.z, PLAYER_COLORS[targetPlayerIndex]);
        cameraShake(getCamera());
      }

      // Check elimination
      if (target.cups.every(c => !c)) {
        target.eliminated = true;
        const remaining = gameState.players.filter(p => !p.eliminated);
        if (remaining.length === 1) {
          gameState.winnerId = remaining[0].id;
          gameState.status = 'finished';
          result.gameOver = true;
          result.winnerId = remaining[0].id;
        }
      }
    }
  }

  gameState.throwNumber++;

  if (result.gameOver) {
    setTimeout(() => {
      hideBall();
      updateUI();
      showGameOver();
    }, 800);
    return;
  }

  if (gameState.throwNumber >= THROWS_PER_TURN) {
    if (gameState.hitsThisTurn >= THROWS_PER_TURN) {
      // Balls back
      gameState.throwNumber = 0;
      gameState.hitsThisTurn = 0;
      gameState.turnPhase = 'selecting';
      gameState.currentTarget = null;
      setTimeout(() => {
        hideBall();
        showBallsBack();
        setTimeout(() => {
          updateUI();
          handleTurnPhase();
        }, 1500);
      }, 800);
    } else {
      // Turn over — advance to next player
      gameState.throwNumber = 0;
      gameState.hitsThisTurn = 0;
      gameState.currentTarget = null;
      gameState.turnPhase = 'selecting';
      // Advance turn to next non-eliminated player
      let nextIndex = (gameState.currentTurnIndex + 1) % gameState.players.length;
      while (gameState.players[nextIndex].eliminated) {
        nextIndex = (nextIndex + 1) % gameState.players.length;
      }
      gameState.currentTurnIndex = nextIndex;
      setTimeout(() => {
        hideBall();
        updateUI();
        handleTurnPhase();
      }, 800);
    }
  } else {
    // Still have throws left
    gameState.turnPhase = 'selecting';
    gameState.currentTarget = null;
    setTimeout(() => {
      hideBall();
      updateUI();
      handleTurnPhase();
    }, 800);
  }
}

function handleAsyncThrowResult(data, hit, targetPlayerIndex, cupIndex) {
  gameState = data.gameState;

  if (hit && cupIndex != null && targetPlayerIndex != null) {
    // Remove cup visually + play hit effects
    const cupPos = getCupWorldPosition(targetPlayerIndex, cupIndex);
    removeCup(cupMeshes, getScene(), targetPlayerIndex, cupIndex);
    disableCupTrigger(targetPlayerIndex, cupIndex);
    flashScreen(COLOR_HEX[myIndex]);
    showHitText();
    if (cupPos) {
      playCupHitEffect(cupPos.x, cupPos.y, cupPos.z, PLAYER_COLORS[targetPlayerIndex]);
      cameraShake(getCamera());
    }
  }

  setTimeout(() => {
    hideBall();

    if (data.result && data.result.gameOver) {
      updateUI();
      showGameOver();
      return;
    }

    if (data.result && data.result.ballsBack) {
      showBallsBack();
      setTimeout(() => {
        updateUI();
        handleTurnPhase();
      }, 1500);
      return;
    }

    // Check if it's still our turn
    const currentPlayer = gameState.players[gameState.currentTurnIndex];
    if (currentPlayer.id === getMyId()) {
      updateUI();
      handleTurnPhase();
    } else {
      // Turn is over, show waiting screen
      updateUI();
      showWaitingForTurn();
    }
  }, 800);
}

function showWaitingForTurn() {
  const currentPlayer = gameState.players[gameState.currentTurnIndex];

  // Remove any selectors/hints
  const selector = overlay.querySelector('.target-selector');
  if (selector) selector.remove();
  const hint = overlay.querySelector('.swipe-hint');
  if (hint) hint.remove();

  disableThrow();
  setCameraPlayerView(myIndex);

  // Show waiting message
  const existing = overlay.querySelector('.waiting-turn');
  if (existing) existing.remove();

  const waitDiv = document.createElement('div');
  waitDiv.className = 'waiting-turn';
  waitDiv.style.cssText = `
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    text-align: center; z-index: 30; pointer-events: auto;
  `;
  waitDiv.innerHTML = `
    <div style="font-size: 1.4rem; font-weight: 700; color: #fff; margin-bottom: 12px; text-shadow: 0 2px 8px rgba(0,0,0,0.8);">
      Waiting for ${currentPlayer.name}
    </div>
    <div style="font-size: 0.9rem; color: rgba(255,255,255,0.6); margin-bottom: 20px;">
      They'll get a text when it's their turn
    </div>
    <button class="btn btn-secondary" id="btn-refresh-game" style="max-width: 200px; margin: 0 auto;">
      Refresh
    </button>
  `;
  overlay.appendChild(waitDiv);

  document.getElementById('btn-refresh-game').addEventListener('click', async () => {
    try {
      const res = await fetch(`/api/game/${asyncGameCode}`);
      const data = await res.json();
      if (data.error) return;

      gameState = data.gameState;

      // Remove waiting div
      waitDiv.remove();
      updateUI();

      // Check if it's now our turn
      const cur = gameState.players[gameState.currentTurnIndex];
      if (cur.id === getMyId()) {
        handleTurnPhase();
      } else {
        showWaitingForTurn();
      }
    } catch (err) {
      console.error('Refresh error:', err);
    }
  });
}

function transformVelocityForDirection(velocity, throwerIndex, targetIndex) {
  // The camera is on the TARGET's radial axis (see camera-controller.js).
  // "Swipe up" on screen = forward = along the target's axis TOWARD the target cups.
  // The target's axis: from target player through center (towardCenter direction).
  // Camera looks in the OPPOSITE direction (from beyond center back toward cups),
  // so "forward" from camera's perspective = NEGATIVE towardCenter = toward the target cups.
  const targetAngle = PLAYER_ANGLES[targetIndex];

  // towardCenter = direction from target player toward table center (triangle tip direction)
  const towardCenterX = -Math.cos(targetAngle);
  const towardCenterZ = Math.sin(targetAngle);

  // "Forward" from the camera = toward the target cups = opposite of towardCenter
  // (camera is past center looking back at cups)
  const forwardX = -towardCenterX;
  const forwardZ = -towardCenterZ;

  // Perpendicular for left/right aiming
  const perpX = -forwardZ;
  const perpZ = forwardX;

  // Map: velocity.z is the forward component (swipe up = negative screen Y = forward)
  // velocity.x is the lateral component
  const worldVx = forwardX * (-velocity.z) + perpX * velocity.x;
  const worldVz = forwardZ * (-velocity.z) + perpZ * velocity.x;

  return { x: worldVx, y: velocity.y, z: worldVz };
}

function transformLocalToWorld(localPositions, playerIndex) {
  const center = getCupTriangleCenter(playerIndex);
  const angle = PLAYER_ANGLES[playerIndex];

  // towardCenter direction (triangle tip points this way)
  const towardCenterX = -Math.cos(angle);
  const towardCenterZ = Math.sin(angle);

  // Perpendicular direction
  const perpX = -towardCenterZ;
  const perpZ = towardCenterX;

  return localPositions.map(pos => ({
    x: center.x + perpX * pos.x + towardCenterX * pos.z,
    z: center.z + perpZ * pos.x + towardCenterZ * pos.z,
  }));
}

function showRerackUI(targetIndex) {
  const target = gameState.players[targetIndex];
  const activeCupCount = target.cups.filter(c => c).length;
  const presets = getAvailablePresets(activeCupCount);

  // Switch to overhead view centered on target's cups
  setCameraOverhead();

  // Track current positions for confirm
  let currentPositions = null;

  // Remove any existing rerack UI
  const existingUI = overlay.querySelector('.rerack-ui');
  if (existingUI) existingUI.remove();

  const rerackDiv = document.createElement('div');
  rerackDiv.className = 'rerack-ui';
  rerackDiv.style.cssText = `
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    z-index: 20; pointer-events: auto;
  `;

  // Label
  const label = document.createElement('div');
  label.textContent = `Rerack ${target.name}'s cups`;
  label.style.cssText = 'color: #fff; font-size: 1.2rem; font-weight: 700; text-shadow: 0 1px 4px rgba(0,0,0,0.7);';
  rerackDiv.appendChild(label);

  // Preset buttons row
  const presetsRow = document.createElement('div');
  presetsRow.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;';

  for (const preset of presets) {
    const btn = document.createElement('button');
    btn.textContent = preset.name;
    btn.className = 'btn btn-target';
    btn.style.cssText = 'padding: 8px 16px; font-size: 0.9rem; min-width: 80px;';
    btn.addEventListener('click', () => {
      // Generate positions from preset, transform to world space
      const localPositions = preset.fn(activeCupCount);
      const worldPositions = transformLocalToWorld(localPositions, targetIndex);
      currentPositions = worldPositions;

      // Animate cups to new positions
      repositionCups(cupMeshes, getScene(), targetIndex, worldPositions);
      rebuildCupColliders(targetIndex, worldPositions);

      // Show confirm button
      confirmBtn.style.display = 'inline-block';
    });
    presetsRow.appendChild(btn);
  }
  rerackDiv.appendChild(presetsRow);

  // Action buttons
  const actionRow = document.createElement('div');
  actionRow.style.cssText = 'display: flex; gap: 12px;';

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Confirm';
  confirmBtn.className = 'btn btn-primary';
  confirmBtn.style.cssText = 'padding: 10px 24px; display: none;';
  confirmBtn.addEventListener('click', async () => {
    rerackDiv.remove();

    if (isTestMode || isFreeplay) {
      // Apply locally
      const currentPlayer = gameState.players[gameState.currentTurnIndex];
      target.cupPositions = currentPositions;
      currentPlayer.reracksRemaining--;
      gameState.turnPhase = 'throwing';
      updateUI();
      handleTurnPhase();
    } else if (isAsyncMode) {
      const data = await submitAsyncAction({
        type: 'rerack',
        targetIndex,
        positions: currentPositions,
      });
      if (!data.error) {
        gameState = data.gameState;
        updateUI();
        handleTurnPhase();
      }
    } else {
      // Send to server
      await emit(EVENTS.RERACK_CUPS, {
        targetIndex,
        positions: currentPositions,
      });
    }
  });
  actionRow.appendChild(confirmBtn);

  const skipBtn = document.createElement('button');
  skipBtn.textContent = 'Skip';
  skipBtn.className = 'btn';
  skipBtn.style.cssText = 'padding: 10px 24px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); color: #fff;';
  skipBtn.addEventListener('click', async () => {
    rerackDiv.remove();

    if (isTestMode || isFreeplay) {
      gameState.turnPhase = 'throwing';
      updateUI();
      handleTurnPhase();
    } else if (isAsyncMode) {
      const data = await submitAsyncAction({ type: 'skip_rerack' });
      if (!data.error) {
        gameState = data.gameState;
        updateUI();
        handleTurnPhase();
      }
    } else {
      await emit(EVENTS.SKIP_RERACK);
    }
  });
  actionRow.appendChild(skipBtn);

  rerackDiv.appendChild(actionRow);
  overlay.appendChild(rerackDiv);
}

// Event handlers for other players' actions
function onTargetSelected(data) {
  gameState.currentTarget = data.targetIndex;
  gameState.turnPhase = 'throwing';
  updateUI();
  handleTurnPhase();
}

function onBallThrown(data) {
  // Spectator: animate the ball
  const startPos = getThrowStartPosition(data.throwerIndex, data.targetIndex);
  showBall(startPos.x, startPos.y, startPos.z);

  // Run physics locally for visual
  launchBall(
    startPos,
    data.velocity,
    null,
    () => {}, // Hit callback - server will tell us the result
    () => {}  // Miss callback
  );
}

function onThrowResolved(data) {
  stopSimulation();

  // Update game state
  gameState = data.gameState;

  if (data.hit) {
    // Remove cup visually + play hit effects
    const cupPos = getCupWorldPosition(data.targetIndex, data.cupIndex);
    removeCup(cupMeshes, getScene(), data.targetIndex, data.cupIndex);
    disableCupTrigger(data.targetIndex, data.cupIndex);
    flashScreen(COLOR_HEX[gameState.currentTurnIndex]);
    showHitText();
    if (cupPos) {
      playCupHitEffect(cupPos.x, cupPos.y, cupPos.z, PLAYER_COLORS[data.targetIndex]);
      cameraShake(getCamera());
    }
  }

  // Hide ball after a short delay
  setTimeout(() => {
    hideBall();

    if (data.gameOver) {
      gameState.status = 'finished';
      gameState.winnerId = data.winnerId;
      updateUI();
      showGameOver();
      return;
    }

    if (data.ballsBack) {
      showBallsBack();
      setTimeout(() => {
        updateUI();
        handleTurnPhase();
      }, 1500);
    } else {
      updateUI();
      handleTurnPhase();
    }
  }, 800);
}

function onCupsReracked(data) {
  gameState = data.gameState;

  if (data.positions) {
    // Cups were repositioned
    repositionCups(cupMeshes, getScene(), data.targetIndex, data.positions);
    rebuildCupColliders(data.targetIndex, data.positions);
  }

  // Remove rerack UI if present
  const rerackUI = overlay.querySelector('.rerack-ui');
  if (rerackUI) rerackUI.remove();

  updateUI();
  handleTurnPhase();
}

const HIT_PHRASES = [
  'NAUGHTY BOY!',
];

// --- Audio system using Web Audio API (works on iOS Safari) ---
let audioCtx = null;

function unlockAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function speakPhrase(text) {
  // Primary: use speechSynthesis (works on desktop, Android)
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.1;
    utter.pitch = 1.2;
    utter.volume = 1;
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utter);
  }

  // Fallback: always play a "hit" chime via Web Audio (guaranteed on iOS)
  playHitChime();
}

function playHitChime() {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const now = audioCtx.currentTime;

  // Two-tone chime: rising notes for a satisfying "ding-ding!"
  const notes = [880, 1174.66]; // A5, D6
  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, now + i * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now + i * 0.12);
    osc.stop(now + i * 0.12 + 0.35);
  });
}

function showHitText() {
  const phrase = HIT_PHRASES[Math.floor(Math.random() * HIT_PHRASES.length)];
  speakPhrase(phrase);

  const el = document.createElement('div');
  el.textContent = phrase;
  el.style.cssText = `
    position: absolute; top: 30%; left: 50%; transform: translate(-50%, -50%) scale(0.5);
    font-size: 3rem; font-weight: 900; color: #fff; text-shadow: 0 0 20px rgba(255,100,50,0.9), 0 0 40px rgba(255,50,0,0.5);
    z-index: 30; pointer-events: none; opacity: 0;
    transition: transform 0.3s cubic-bezier(0.2, 1.5, 0.4, 1), opacity 0.3s ease-out;
  `;
  overlay.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%, -50%) scale(1)';
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%, -50%) scale(1.3)';
      setTimeout(() => el.remove(), 400);
    }, 800);
  });
}

function flashScreen(color) {
  const flash = document.createElement('div');
  flash.style.cssText = `
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    background: ${color}; opacity: 0.3; z-index: 25;
    pointer-events: none; transition: opacity 0.5s;
  `;
  overlay.appendChild(flash);
  requestAnimationFrame(() => {
    flash.style.opacity = '0';
    setTimeout(() => flash.remove(), 500);
  });
}

function showBallsBack() {
  const banner = document.createElement('div');
  banner.className = 'balls-back-banner';
  banner.textContent = 'BALLS BACK!';
  overlay.appendChild(banner);
  setTimeout(() => banner.remove(), 1500);

  // Haptic feedback
  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
}

function showGameOver() {
  const winner = gameState.players.find(p => p.id === gameState.winnerId);
  if (!winner) return;

  const html = `
    <div class="game-over-overlay">
      <h1>Game Over!</h1>
      <div class="winner-name" style="color: ${COLOR_HEX[winner.index]}">${winner.name} wins!</div>
      <button class="btn btn-primary" id="btn-play-again" style="max-width: 200px;">Play Again</button>
    </div>
  `;

  overlay.innerHTML = html;

  document.getElementById('btn-play-again')?.addEventListener('click', () => {
    if (isAsyncMode) {
      // Go back to lobby with the game code context cleared
      window.location.href = '/';
    } else {
      window.location.reload();
    }
  });
}
