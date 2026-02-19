// Socket.IO event names
export const EVENTS = {
  // Lobby
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  PLAYER_JOINED: 'player_joined',
  START_GAME: 'start_game',
  GAME_STARTED: 'game_started',

  // Game
  SELECT_TARGET: 'select_target',
  TARGET_SELECTED: 'target_selected',
  THROW_BALL: 'throw_ball',
  BALL_THROWN: 'ball_thrown',
  THROW_RESULT: 'throw_result',
  THROW_RESOLVED: 'throw_resolved',

  // System
  PLAYER_DISCONNECTED: 'player_disconnected',
};
