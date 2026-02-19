import { initScene, onAnimate, getScene, getCamera, getRenderer } from '../game/scene.js';
import { createTable } from '../game/table.js';
import { createCups, removeCup } from '../game/cups.js';
import { createBall, showBall, updateBallPosition, hideBall } from '../game/ball.js';
import { initPhysics, launchBall, stepPhysics, disableCupTrigger, stopSimulation } from '../game/physics.js';
import { initThrowControls, enableThrow, disableThrow, getThrowStartPosition } from '../game/throw.js';
import { initCameraController, setCameraOverhead, setCameraThrowView, setCameraSpectatorView, updateCamera } from '../game/camera-controller.js';
import { emit, on, off } from '../network/socket.js';
import { EVENTS } from '../network/events.js';
import { PLAYER_COLORS, PLAYER_COLOR_NAMES, CUPS_PER_PLAYER } from '../shared/constants.js';

const COLOR_HEX = PLAYER_COLORS.map(c => '#' + c.toString(16).padStart(6, '0'));

let gameState = null;
let myIndex = -1;
let cupMeshes = null;
let overlay = null;
let lastTime = 0;

export function startGame(canvasContainer, uiOverlay, initialGameState, playerIndex) {
  gameState = initialGameState;
  myIndex = playerIndex;
  overlay = uiOverlay;

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

  // Start with overhead view
  setCameraOverhead();

  // Animation loop
  lastTime = performance.now();
  onAnimate(() => {
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    updateCamera(dt);

    // Step physics if active
    const physResult = stepPhysics();
    if (physResult) {
      updateBallPosition(physResult.x, physResult.y, physResult.z);

      if (physResult.done) {
        // Ball finished - handle locally, then report to server
        // (handled by callbacks in launchBall)
      }
    }
  });

  // Listen for game events
  on(EVENTS.TARGET_SELECTED, onTargetSelected);
  on(EVENTS.BALL_THROWN, onBallThrown);
  on(EVENTS.THROW_RESOLVED, onThrowResolved);

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
  const socket = import.meta.hot ? null : null;
  // Get socket id from the network module
  return window.__socketId;
}

function handleTurnPhase() {
  const currentPlayer = gameState.players[gameState.currentTurnIndex];
  const isMyTurn = currentPlayer.id === getMyId();

  if (gameState.status === 'finished') {
    showGameOver();
    return;
  }

  if (gameState.turnPhase === 'selecting') {
    if (isMyTurn) {
      showTargetSelector();
      setCameraOverhead();
    } else {
      setCameraOverhead();
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
      setCameraSpectatorView(gameState.currentTurnIndex, gameState.currentTarget);
      disableThrow();
    }
  }
}

function showTargetSelector() {
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

      const response = await emit(EVENTS.SELECT_TARGET, targetIndex);
      if (response.error) {
        console.error('Select target error:', response.error);
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

  // Show ball at throw start position
  const startPos = getThrowStartPosition(gameState.currentTurnIndex, gameState.currentTarget);
  showBall(startPos.x, startPos.y, startPos.z);

  // Transform velocity based on camera/throw direction
  const transformedVelocity = transformVelocityForDirection(
    velocity,
    gameState.currentTurnIndex,
    gameState.currentTarget
  );

  // Send throw to server (broadcast to other players)
  await emit(EVENTS.THROW_BALL, transformedVelocity);

  // Run physics locally
  launchBall(
    startPos,
    transformedVelocity,
    null,
    // On hit
    (playerIndex, cupIndex) => {
      // Report hit to server
      emit(EVENTS.THROW_RESULT, { hit: true, cupIndex, targetIndex: playerIndex });
    },
    // On miss
    () => {
      emit(EVENTS.THROW_RESULT, { hit: false, cupIndex: null, targetIndex: null });
    }
  );
}

function transformVelocityForDirection(velocity, throwerIndex, targetIndex) {
  // The swipe gives velocity relative to screen (up = forward)
  // We need to rotate it to point from thrower toward target
  const angles = [
    Math.PI / 2,
    Math.PI / 2 + (2 * Math.PI / 3),
    Math.PI / 2 + (4 * Math.PI / 3),
  ];

  const throwerAngle = angles[throwerIndex];
  const targetAngle = angles[targetIndex];

  const fromX = Math.cos(throwerAngle) * 2.0;
  const fromZ = -Math.sin(throwerAngle) * 2.0;
  const toX = Math.cos(targetAngle) * 2.0;
  const toZ = -Math.sin(targetAngle) * 2.0;

  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const dirX = dx / dist;
  const dirZ = dz / dist;

  // Forward component (from swipe up/down mapped to dy)
  const forwardSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);

  // Perpendicular for left/right aiming
  const perpX = -dirZ;
  const perpZ = dirX;

  // Map: velocity.z is the forward component (swipe up = negative screen Y = forward)
  // velocity.x is the lateral component
  const worldVx = dirX * (-velocity.z) + perpX * velocity.x;
  const worldVz = dirZ * (-velocity.z) + perpZ * velocity.x;

  return { x: worldVx, y: velocity.y, z: worldVz };
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
    // Remove cup visually
    removeCup(cupMeshes, getScene(), data.targetIndex, data.cupIndex);
    disableCupTrigger(data.targetIndex, data.cupIndex);

    // Flash effect
    flashScreen(COLOR_HEX[gameState.currentTurnIndex]);
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
    window.location.reload();
  });
}
