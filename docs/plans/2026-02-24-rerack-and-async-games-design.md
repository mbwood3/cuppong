# Rerack + Async Persistent Games Design

## Feature 1: Rerack

### Rules
- Each player gets **2 reracks** per game
- Rerack happens at the **start of your turn**, after selecting a target but before throwing
- You rerack the **target's** remaining cups
- Cups must stay within the target's original triangle bounding area
- Cups cannot overlap (minimum distance = CUP_TOP_RADIUS * 2)

### Turn Flow Change
```
selecting → [reracking] → throwing
```
After selecting a target, if the player has reracks remaining, a "Rerack" button appears alongside a "Skip" button. Tapping Rerack enters the rerack UI. Skipping goes straight to throwing.

### Rerack UI
1. Camera switches to overhead view of the target's remaining cups
2. Preset bar at bottom with formations filtered by cup count:
   - Tight triangle, diamond, line, zipper, etc.
3. Tapping a preset snaps cups into that formation (animated)
4. Player can drag individual cups to fine-tune positions
5. "Confirm" button locks in the arrangement
6. Server validates positions are within bounds, updates game state for all players

### Data Model Changes
- `gameState.players[i].reracksRemaining` — starts at 2
- `gameState.players[i].cupPositions` — array of `{x, z}` per active cup (overrides static positions when set)
- New turn phase: `'reracking'`

### Constraint System
Each player's bounding region = convex hull of their original 15-cup triangle. During rerack, cup positions are clamped within this hull. Minimum cup-to-cup distance enforced.

### New Socket Events
- `RERACK_CUPS` — client sends new cup positions for target
- `CUPS_RERACKED` — server broadcasts validated positions to all players

### Physics Impact
When cups are reracked, physics must rebuild colliders for the affected player's cups (remove old compound bodies, create new ones at new positions). Trigger positions also update.

---

## Feature 2: Async Persistent Games

### Game Creation Flow
1. Host enters their name + phone number, plus names + phone numbers for 2 friends
2. Server creates game in SQLite, generates game code
3. All players receive SMS: "You've been invited to Cup Pong! [link]"
4. Game is immediately playable — no waiting room

### Player Identity
- Players identified by phone number (no accounts/passwords)
- On opening game link: enter phone number, server checks against stored players
- Casual verification — no SMS codes needed

### Async Turn Flow
1. Player opens game link → client fetches game state via REST API
2. If their turn: load 3D scene, play turn (select target, optional rerack, throw)
3. Turn resolves → state saved to SQLite → next player gets SMS
4. If not their turn: read-only view of current table state + "waiting for [name]"

### Persistence: SQLite
Single `games` table:
- `id` TEXT PRIMARY KEY — 4-char game code
- `state` TEXT — JSON blob of full game state
- `created_at` INTEGER — unix timestamp
- `updated_at` INTEGER — unix timestamp
- `status` TEXT — 'playing' | 'finished'

### REST API (replaces Socket.IO for multiplayer)
- `GET /api/game/:code` — fetch current game state
- `POST /api/game` — create new game (body: host + friend info)
- `POST /api/game/:code/action` — submit turn action

Action types:
- `{ type: 'select_target', targetIndex }`
- `{ type: 'rerack', cupPositions }`
- `{ type: 'throw_result', hit, cupIndex, targetIndex }`

### SMS via Twilio
- Sends on: game creation (invite all), turn change (notify next player)
- Link format: `https://[domain]/play/[CODE]`
- Config: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` env vars
- Cost: ~$1/month for number + ~$0.01/SMS

### Architecture Changes

| Aspect | Current (Real-time) | New (Async) |
|--------|---------------------|-------------|
| Connection | Socket.IO persistent | REST API per-action |
| State storage | In-memory Map | SQLite |
| Notifications | Real-time events | SMS |
| Player identity | Socket ID | Phone number |
| Waiting room | Required | Not needed |
| Game lifetime | Minutes | Hours/days |

### Coexistence
- Real-time Socket.IO mode stays for freeplay/test
- Async REST mode is the new default for multiplayer
- Shared: game logic, 3D rendering, physics, rerack system
- Only transport and persistence layers differ

### New Dependencies
- `better-sqlite3` — SQLite driver (synchronous, fast, no native build issues)
- `twilio` — SMS sending
