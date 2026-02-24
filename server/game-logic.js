import { CUPS_PER_PLAYER, THROWS_PER_TURN, RERACKS_PER_PLAYER } from './constants.js';

export function createGameState(players) {
  return {
    players: players.map((p, i) => ({
      id: p.id,
      name: p.name,
      index: i,
      cups: new Array(CUPS_PER_PLAYER).fill(true), // true = standing
      eliminated: false,
      reracksRemaining: RERACKS_PER_PLAYER,
      cupPositions: null, // null = use default positions; array of {x, z} when reracked
    })),
    currentTurnIndex: 0,
    currentTarget: null,
    throwNumber: 0, // 0 or 1 (two throws per turn)
    hitsThisTurn: 0,
    turnPhase: 'selecting', // selecting | throwing | resolving
    winnerId: null,
    status: 'playing',
  };
}

export function selectTarget(gameState, playerId, targetIndex) {
  const currentPlayer = gameState.players[gameState.currentTurnIndex];
  if (currentPlayer.id !== playerId) return { error: 'Not your turn' };
  if (gameState.turnPhase !== 'selecting') return { error: 'Not in selection phase' };

  const target = gameState.players[targetIndex];
  if (!target) return { error: 'Invalid target' };
  if (target.eliminated) return { error: 'Target already eliminated' };
  if (target.id === playerId) return { error: 'Cannot target yourself' };

  gameState.currentTarget = targetIndex;
  gameState.turnPhase = 'throwing';
  return { ok: true };
}

export function startThrow(gameState, playerId) {
  const currentPlayer = gameState.players[gameState.currentTurnIndex];
  if (currentPlayer.id !== playerId) return { error: 'Not your turn' };
  if (gameState.turnPhase !== 'throwing') return { error: 'Not in throwing phase' };

  gameState.turnPhase = 'resolving';
  return { ok: true };
}

export function resolveThrow(gameState, playerId, hit, cupIndex) {
  const currentPlayer = gameState.players[gameState.currentTurnIndex];
  if (currentPlayer.id !== playerId) return { error: 'Not your turn' };
  if (gameState.turnPhase !== 'resolving') return { error: 'Not in resolving phase' };

  const result = { hit: false, cupIndex: null, eliminated: null, ballsBack: false, gameOver: false, winnerId: null };

  if (hit && cupIndex != null) {
    const target = gameState.players[gameState.currentTarget];
    if (target && target.cups[cupIndex]) {
      target.cups[cupIndex] = false;
      result.hit = true;
      result.cupIndex = cupIndex;
      gameState.hitsThisTurn++;

      // Check elimination
      if (target.cups.every(c => !c)) {
        target.eliminated = true;
        result.eliminated = target.index;

        // Check win condition
        const remaining = gameState.players.filter(p => !p.eliminated);
        if (remaining.length === 1) {
          gameState.winnerId = remaining[0].id;
          gameState.status = 'finished';
          result.gameOver = true;
          result.winnerId = remaining[0].id;
          return result;
        }
      }
    }
  }

  gameState.throwNumber++;

  if (gameState.throwNumber >= THROWS_PER_TURN) {
    // Check balls back
    if (gameState.hitsThisTurn >= THROWS_PER_TURN) {
      // Balls back! Reset for more throws
      gameState.throwNumber = 0;
      gameState.hitsThisTurn = 0;
      gameState.turnPhase = 'selecting';
      gameState.currentTarget = null;
      result.ballsBack = true;
    } else {
      // Turn over, advance to next player
      advanceTurn(gameState);
    }
  } else {
    // Still have throws left this turn
    gameState.turnPhase = 'selecting';
    gameState.currentTarget = null;
  }

  return result;
}

function advanceTurn(gameState) {
  gameState.throwNumber = 0;
  gameState.hitsThisTurn = 0;
  gameState.currentTarget = null;

  let nextIndex = (gameState.currentTurnIndex + 1) % gameState.players.length;
  while (gameState.players[nextIndex].eliminated) {
    nextIndex = (nextIndex + 1) % gameState.players.length;
  }
  gameState.currentTurnIndex = nextIndex;
  gameState.turnPhase = 'selecting';
}

export function getPublicGameState(gameState) {
  return {
    players: gameState.players.map(p => ({
      id: p.id,
      name: p.name,
      index: p.index,
      cups: [...p.cups],
      eliminated: p.eliminated,
      reracksRemaining: p.reracksRemaining,
      cupPositions: p.cupPositions ? [...p.cupPositions] : null,
    })),
    currentTurnIndex: gameState.currentTurnIndex,
    currentTarget: gameState.currentTarget,
    throwNumber: gameState.throwNumber,
    hitsThisTurn: gameState.hitsThisTurn,
    turnPhase: gameState.turnPhase,
    winnerId: gameState.winnerId,
    status: gameState.status,
  };
}
