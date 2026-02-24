import {
  createRoom,
  joinRoom,
  getRoom,
  getRoomByPlayerId,
  handleDisconnect,
  reconnectPlayer,
} from './room-manager.js';
import {
  createGameState,
  selectTarget,
  startThrow,
  resolveThrow,
  rerackCups,
  skipRerack,
  getPublicGameState,
} from './game-logic.js';
import { MAX_PLAYERS } from './constants.js';

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('create_room', (playerName, callback) => {
      const room = createRoom(socket.id, playerName);
      socket.join(room.code);
      console.log(`Room ${room.code} created by "${playerName}" (socket: ${socket.id})`);
      callback({
        roomCode: room.code,
        players: room.players.map(p => ({ name: p.name, index: p.index, connected: p.connected })),
        yourIndex: 0,
      });
    });

    socket.on('join_room', (roomCode, playerName, callback) => {
      const code = roomCode.toUpperCase();
      const result = joinRoom(code, socket.id, playerName);
      if (result.error) {
        console.log(`Join room ${code} failed for "${playerName}": ${result.error}`);
        callback({ error: result.error });
        return;
      }
      socket.join(code);
      const playersList = result.room.players.map(p => ({ name: p.name, index: p.index, connected: p.connected }));
      console.log(`"${playerName}" ${result.isReconnect ? 'reconnected to' : 'joined'} room ${code} (socket: ${socket.id}). Players: ${playersList.map(p => `${p.name}(${p.connected ? 'on' : 'off'})`).join(', ')}`);
      if (result.isReconnect) {
        // This was a reconnect — notify ALL clients (including sender) with player_reconnected
        io.to(code).emit('player_reconnected', {
          name: result.player.name,
          index: result.player.index,
          players: playersList,
        });
      } else {
        // Genuinely new player — notify others with player_joined
        socket.to(code).emit('player_joined', {
          name: result.player.name,
          index: result.player.index,
          players: playersList,
        });
      }
      callback({
        roomCode: code,
        players: playersList,
        yourIndex: result.player.index,
      });
    });

    // Rejoin a room after reconnection (mobile tab switch, network hiccup, etc.)
    socket.on('rejoin_room', (roomCode, playerName, callback) => {
      const code = roomCode.toUpperCase();
      const result = reconnectPlayer(code, socket.id, playerName);
      if (!result) {
        // Try joining as a new player if reconnect fails
        const joinResult = joinRoom(code, socket.id, playerName);
        if (joinResult.error) {
          callback({ error: joinResult.error });
          return;
        }
        socket.join(code);
        const playersList = joinResult.room.players.map(p => ({ name: p.name, index: p.index, connected: p.connected }));
        if (joinResult.isReconnect) {
          io.to(code).emit('player_reconnected', {
            name: joinResult.player.name,
            index: joinResult.player.index,
            players: playersList,
          });
        } else {
          socket.to(code).emit('player_joined', {
            name: joinResult.player.name,
            index: joinResult.player.index,
            players: playersList,
          });
        }
        callback({
          roomCode: code,
          players: playersList,
          yourIndex: joinResult.player.index,
          gameState: joinResult.room.gameState ? getPublicGameState(joinResult.room.gameState) : null,
        });
        return;
      }

      socket.join(code);
      const playersList = result.room.players.map(p => ({ name: p.name, index: p.index, connected: p.connected }));
      // Notify ALL players of reconnection (including the reconnector so their UI syncs)
      io.to(code).emit('player_reconnected', {
        name: playerName,
        index: result.player.index,
        players: playersList,
      });
      callback({
        roomCode: code,
        players: playersList,
        yourIndex: result.player.index,
        gameState: result.room.gameState ? getPublicGameState(result.room.gameState) : null,
      });
    });

    // Let clients request current room state (catches missed events)
    socket.on('get_room_state', (callback) => {
      const room = getRoomByPlayerId(socket.id);
      if (!room) return callback({ error: 'Not in a room' });
      callback({
        players: room.players.map(p => ({ name: p.name, index: p.index, connected: p.connected })),
      });
    });

    socket.on('start_game', (...args) => {
      const callback = args.find(a => typeof a === 'function') || (() => {});
      const room = getRoomByPlayerId(socket.id);
      if (!room) return callback({ error: 'Not in a room' });
      if (room.hostId !== socket.id) return callback({ error: 'Only host can start' });
      // Count connected players only
      const connectedCount = room.players.filter(p => p.connected).length;
      if (connectedCount < MAX_PLAYERS) return callback({ error: `Need ${MAX_PLAYERS} players` });

      room.state = 'playing';
      room.lastActivity = Date.now();
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

      room.lastActivity = Date.now();
      io.to(room.code).emit('target_selected', {
        throwerIndex: room.gameState.currentTurnIndex,
        targetIndex,
      });
      callback({ ok: true });
    });

    socket.on('rerack_cups', (data, callback) => {
      const room = getRoomByPlayerId(socket.id);
      if (!room || !room.gameState) return callback({ error: 'No active game' });

      const result = rerackCups(room.gameState, socket.id, data.targetIndex, data.positions);
      if (result.error) return callback({ error: result.error });

      room.lastActivity = Date.now();
      io.to(room.code).emit('cups_reracked', {
        targetIndex: data.targetIndex,
        positions: data.positions,
        gameState: getPublicGameState(room.gameState),
      });
      callback({ ok: true });
    });

    socket.on('skip_rerack', (callback) => {
      const room = getRoomByPlayerId(socket.id);
      if (!room || !room.gameState) return callback({ error: 'No active game' });

      const result = skipRerack(room.gameState, socket.id);
      if (result.error) return callback({ error: result.error });

      room.lastActivity = Date.now();
      io.to(room.code).emit('cups_reracked', {
        targetIndex: room.gameState.currentTarget,
        positions: null, // null = no change
        gameState: getPublicGameState(room.gameState),
      });
      callback({ ok: true });
    });

    socket.on('throw_ball', (velocity, callback) => {
      const room = getRoomByPlayerId(socket.id);
      if (!room || !room.gameState) return callback({ error: 'No active game' });

      const result = startThrow(room.gameState, socket.id);
      if (result.error) return callback({ error: result.error });

      room.lastActivity = Date.now();
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

      room.lastActivity = Date.now();
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

    socket.on('disconnect', (reason) => {
      console.log(`Player disconnected: ${socket.id} (reason: ${reason})`);
      const { room } = handleDisconnect(socket.id);
      if (room) {
        const playersList = room.players.map(p => ({
          name: p.name,
          index: p.index,
          connected: p.connected,
        }));
        console.log(`Room ${room.code} players after disconnect:`, playersList.map(p => `${p.name}(${p.connected ? 'on' : 'off'})`).join(', '));
        io.to(room.code).emit('player_disconnected', { players: playersList });
      }
    });
  });
}
