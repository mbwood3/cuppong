import {
  createRoom,
  joinRoom,
  getRoom,
  getRoomByPlayerId,
  removePlayer,
} from './room-manager.js';
import {
  createGameState,
  selectTarget,
  startThrow,
  resolveThrow,
  getPublicGameState,
} from './game-logic.js';
import { MAX_PLAYERS } from './constants.js';

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('create_room', (playerName, callback) => {
      const room = createRoom(socket.id, playerName);
      socket.join(room.code);
      callback({
        roomCode: room.code,
        players: room.players.map(p => ({ name: p.name, index: p.index })),
        yourIndex: 0,
      });
    });

    socket.on('join_room', (roomCode, playerName, callback) => {
      const code = roomCode.toUpperCase();
      const result = joinRoom(code, socket.id, playerName);
      if (result.error) {
        callback({ error: result.error });
        return;
      }
      socket.join(code);
      // Notify existing players
      socket.to(code).emit('player_joined', {
        name: playerName,
        index: result.player.index,
      });
      callback({
        roomCode: code,
        players: result.room.players.map(p => ({ name: p.name, index: p.index })),
        yourIndex: result.player.index,
      });
    });

    socket.on('start_game', (...args) => {
      const callback = args.find(a => typeof a === 'function') || (() => {});
      const room = getRoomByPlayerId(socket.id);
      if (!room) return callback({ error: 'Not in a room' });
      if (room.hostId !== socket.id) return callback({ error: 'Only host can start' });
      if (room.players.length < MAX_PLAYERS) return callback({ error: `Need ${MAX_PLAYERS} players` });

      room.state = 'playing';
      room.gameState = createGameState(room.players);
      const publicState = getPublicGameState(room.gameState);
      io.to(room.code).emit('game_started', publicState);
      callback({ ok: true });
    });

    socket.on('select_target', (targetIndex, callback) => {
      const room = getRoomByPlayerId(socket.id);
      if (!room || !room.gameState) return callback({ error: 'No active game' });

      const result = selectTarget(room.gameState, socket.id, targetIndex);
      if (result.error) return callback({ error: result.error });

      io.to(room.code).emit('target_selected', {
        throwerIndex: room.gameState.currentTurnIndex,
        targetIndex,
      });
      callback({ ok: true });
    });

    socket.on('throw_ball', (velocity, callback) => {
      const room = getRoomByPlayerId(socket.id);
      if (!room || !room.gameState) return callback({ error: 'No active game' });

      const result = startThrow(room.gameState, socket.id);
      if (result.error) return callback({ error: result.error });

      // Broadcast throw to all players so spectators can animate
      socket.to(room.code).emit('ball_thrown', {
        throwerIndex: room.gameState.currentTurnIndex,
        targetIndex: room.gameState.currentTarget,
        velocity,
      });
      callback({ ok: true });
    });

    socket.on('throw_result', (data, callback) => {
      const room = getRoomByPlayerId(socket.id);
      if (!room || !room.gameState) return callback({ error: 'No active game' });

      const result = resolveThrow(room.gameState, socket.id, data.hit, data.cupIndex);
      if (result.error) return callback({ error: result.error });

      // Broadcast result to all players
      io.to(room.code).emit('throw_resolved', {
        hit: result.hit,
        cupIndex: result.cupIndex,
        targetIndex: data.hit ? room.gameState.currentTarget ?? data.targetIndex : null,
        eliminated: result.eliminated,
        ballsBack: result.ballsBack,
        gameOver: result.gameOver,
        winnerId: result.winnerId,
        gameState: getPublicGameState(room.gameState),
      });
      callback({ ok: true });
    });

    socket.on('disconnect', () => {
      console.log(`Player disconnected: ${socket.id}`);
      const { room } = removePlayer(socket.id);
      if (room) {
        io.to(room.code).emit('player_disconnected', {
          players: room.players.map(p => ({
            name: p.name,
            index: p.index,
            connected: p.connected,
          })),
        });
      }
    });
  });
}
