import express from 'express';
import { createGame, loadGame, saveGame, getGamePlayers, findPlayerByPhone } from './db.js';
import { createGameState, selectTarget, resolveThrow, rerackCups, skipRerack, getPublicGameState } from './game-logic.js';
import { sendGameInvite, sendTurnNotification } from './sms.js';
import { CUPS_PER_PLAYER, RERACKS_PER_PLAYER } from './constants.js';

const router = express.Router();

// Simple rate limiter: max 1 action per second per phone
const actionTimestamps = new Map();
function checkRateLimit(phone) {
  const now = Date.now();
  const last = actionTimestamps.get(phone) || 0;
  if (now - last < 1000) return false;
  actionTimestamps.set(phone, now);
  return true;
}

// Generate room-style codes
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
  return code;
}

// Create a new async game
router.post('/game', async (req, res) => {
  const { players } = req.body;
  // players: [{ name, phone }, { name, phone }, { name, phone }]
  if (!players || players.length !== 3) return res.status(400).json({ error: 'Need exactly 3 players' });

  const gameCode = generateCode();
  const gamePlayers = players.map((p, i) => ({
    id: p.phone, // Use phone as player ID in async mode
    name: p.name,
    index: i,
  }));

  const gameState = createGameState(gamePlayers);
  const playerInfos = players.map((p, i) => ({ index: i, name: p.name, phone: p.phone }));

  createGame(gameCode, gameState, playerInfos);

  // Send invites
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  for (const p of playerInfos) {
    await sendGameInvite(p.phone, p.name, gameCode, baseUrl);
  }

  // Also notify first player it's their turn
  await sendTurnNotification(playerInfos[0].phone, playerInfos[0].name, gameCode, baseUrl);

  res.json({ gameCode });
});

// Get game state
router.get('/game/:code', (req, res) => {
  const game = loadGame(req.params.code.toUpperCase());
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const players = getGamePlayers(game.id);

  res.json({
    gameCode: game.id,
    gameState: getPublicGameState(game.state),
    players: players.map(p => ({ name: p.name, index: p.player_index, phone: p.phone })),
    status: game.status,
  });
});

// Verify player identity (check phone matches a player in the game)
router.post('/game/:code/verify', (req, res) => {
  const { phone } = req.body;
  const code = req.params.code.toUpperCase();
  const game = loadGame(code);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const player = findPlayerByPhone(code, phone);
  if (!player) return res.status(403).json({ error: 'Phone number not in this game' });

  res.json({
    playerIndex: player.player_index,
    name: player.name,
    gameState: getPublicGameState(game.state),
  });
});

// Submit a game action
router.post('/game/:code/action', async (req, res) => {
  const { phone, action } = req.body;
  const code = req.params.code.toUpperCase();

  const game = loadGame(code);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status === 'finished') return res.status(400).json({ error: 'Game is finished' });

  const player = findPlayerByPhone(code, phone);
  if (!player) return res.status(403).json({ error: 'Not a player in this game' });

  if (!checkRateLimit(phone)) {
    return res.status(429).json({ error: 'Too many actions. Please wait.' });
  }

  const playerId = phone; // Phone is the player ID in async mode
  const gameState = game.state;

  // Verify it's this player's turn
  const currentPlayer = gameState.players[gameState.currentTurnIndex];
  if (currentPlayer.id !== phone) {
    return res.status(403).json({ error: 'Not your turn' });
  }
  let result;

  switch (action.type) {
    case 'select_target':
      result = selectTarget(gameState, playerId, action.targetIndex);
      break;
    case 'skip_rerack':
      result = skipRerack(gameState, playerId);
      break;
    case 'rerack':
      result = rerackCups(gameState, playerId, action.targetIndex, action.positions);
      break;
    case 'throw_result':
      // In async mode, client runs physics and reports result (same as real-time)
      // First transition to resolving phase
      gameState.turnPhase = 'resolving';
      result = resolveThrow(gameState, playerId, action.hit, action.cupIndex);
      break;
    default:
      return res.status(400).json({ error: 'Unknown action type' });
  }

  if (result.error) return res.status(400).json({ error: result.error });

  // Save updated state
  saveGame(code, gameState);

  // If turn changed, notify next player
  if (action.type === 'throw_result' && !result.gameOver) {
    const currentPlayer = gameState.players[gameState.currentTurnIndex];
    const allPlayers = getGamePlayers(code);
    const nextPlayerInfo = allPlayers.find(p => p.phone === currentPlayer.id);
    if (nextPlayerInfo) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      await sendTurnNotification(nextPlayerInfo.phone, nextPlayerInfo.name, code, baseUrl);
    }
  }

  res.json({
    result,
    gameState: getPublicGameState(gameState),
  });
});

export default router;
