import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'games.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'playing'
  );

  CREATE TABLE IF NOT EXISTS players (
    game_id TEXT NOT NULL,
    player_index INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    PRIMARY KEY (game_id, player_index),
    FOREIGN KEY (game_id) REFERENCES games(id)
  );
`);

// Prepared statements
const insertGame = db.prepare(
  'INSERT INTO games (id, state, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?)'
);
const updateGame = db.prepare(
  'UPDATE games SET state = ?, updated_at = ?, status = ? WHERE id = ?'
);
const getGame = db.prepare('SELECT * FROM games WHERE id = ?');
const insertPlayer = db.prepare(
  'INSERT INTO players (game_id, player_index, name, phone) VALUES (?, ?, ?, ?)'
);
const getPlayers = db.prepare('SELECT * FROM players WHERE game_id = ? ORDER BY player_index');
const getPlayerByPhone = db.prepare(
  'SELECT * FROM players WHERE game_id = ? AND phone = ?'
);

export function createGame(gameId, gameState, playerInfos) {
  const now = Date.now();
  const transaction = db.transaction(() => {
    insertGame.run(gameId, JSON.stringify(gameState), now, now, 'playing');
    for (const p of playerInfos) {
      insertPlayer.run(gameId, p.index, p.name, p.phone);
    }
  });
  transaction();
}

export function loadGame(gameId) {
  const row = getGame.get(gameId);
  if (!row) return null;
  return {
    id: row.id,
    state: JSON.parse(row.state),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
  };
}

export function saveGame(gameId, gameState) {
  const status = gameState.status || 'playing';
  updateGame.run(JSON.stringify(gameState), Date.now(), status, gameId);
}

export function getGamePlayers(gameId) {
  return getPlayers.all(gameId);
}

export function findPlayerByPhone(gameId, phone) {
  return getPlayerByPhone.get(gameId, phone);
}
