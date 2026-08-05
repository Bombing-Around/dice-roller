# Dice Roller

A multiplayer TTRPG dice roller with real-time sync. Create a room, share the code, and roll dice together!

## Features

- **Multiplayer Rooms**: Create or join rooms with a 6-character code
- **Real-time Sync**: All players see rolls instantly
- **TTRPG Dice**: Supports d4, d6, d8, d10, d12, d16, d20, d100
- **Dice Notation**: Roll complex combinations like `2d20+5`, `4d6-1`, `d100+2d4`
- **Session Log**: Track all rolls with optional action, description, and outcome fields
- **Freeform Notes**: Add narrative notes between rolls to document your session
- **JSON Export**: Export your session log for record keeping
- **No Accounts**: Just create/join and play - rooms are ephemeral

## Quick Start

The app needs **two** processes: a Soketi WebSocket server and the Node app
server. There is no offline or single-process mode — without Soketi the app
loads but refuses to create or join rooms.

```bash
# Terminal 1: Start Soketi
docker-compose up      # or: npm run soketi

# Terminal 2: Start the app server
npm start
```

Open http://localhost:3000 in as many browsers as you like — they sync in
real-time. The app auto-detects Soketi on localhost and connects
automatically.

> `npx serve public` is **not** enough. Broadcasts are relayed through
> `server.js`, which signs them with the Soketi app secret; serving the
> static files alone gives you a UI that cannot sync.

## Configuration

`server.js` reads its settings from the environment, falling back to the
values in `docker-compose.yml` so local development needs no setup:

| Variable | Default |
|---|---|
| `PORT` | `3000` |
| `SOKETI_HOST` | `localhost` |
| `SOKETI_PORT` | `6001` |
| `SOKETI_DEFAULT_APP_ID` | `dice-roller` |
| `SOKETI_DEFAULT_APP_KEY` | `dice-roller-key` |
| `SOKETI_DEFAULT_APP_SECRET` | `dice-roller-secret` |

## Tests

```bash
npm test
```

Runs the dice-notation suite with the built-in Node test runner. No
dependencies, no build step. CI runs the same command on Node 22 and 24,
plus a `node --check` syntax pass over every JS file.

## Modes

### Soketi Mode (Local Development)
- Syncs across different browsers on the same machine
- Auto-detected when running on localhost with Soketi
- Run `docker-compose up` or `npm run soketi`

### Pusher Mode (Production)
For deployment with real cross-device multiplayer:

1. Create a free account at [pusher.com](https://pusher.com)
2. Create a Channels app (enable client events)
3. Edit `public/js/pusher-service.js` - update `PROD_CONFIG`:

```javascript
const PROD_CONFIG = {
  key: 'YOUR_PUSHER_KEY',
  cluster: 'us2', // your cluster
};
```

## Deployment

This is **not** a static site. `public/` is served by `server.js`, which also
relays broadcasts to Soketi/Pusher using the app secret — so deployment needs
a Node process, not just a CDN. A static host will serve the UI but rolls
will never reach anyone else.

Before deploying publicly, note that `POST /broadcast` is **unauthenticated**.
It validates the channel format, the event name, the payload size, and applies
per-IP rate limiting, but anyone who can reach the port and guess a 6-character
room code can broadcast into that room. Adding real authentication is an open
item — see `DEVELOPMENT.md`.

## Usage

1. **Create a Room**: Click "Create New Room" to generate a 6-character code
2. **Share the Code**: Give the code to other players
3. **Join a Room**: Enter the code and click "Join"
4. **Roll Dice**: Use quick buttons or type notation like `2d20+5`
5. **Add Details**: Expand "Roll details" to add action, description, outcome
6. **Add Notes**: Use the note field to add narrative between rolls
7. **Export**: Click "Export Log (JSON)" to download your session

## Dice Notation

- `d20` - Roll one d20
- `2d6` - Roll two d6
- `4d6+3` - Roll four d6 and add 3
- `2d20-1` - Roll two d20 and subtract 1
- `2d20-1d6` - Roll two d20 and subtract a d6
- `d100` - Roll percentile (1-100)

Supported dice: d4, d6, d8, d10, d12, d16, d20, d100

## Tech Stack

- **Frontend**: Vanilla JavaScript + Tailwind CSS (via CDN)
- **Server**: Node core modules only — no dependencies, no build step
- **Sync**: Soketi (local) or Pusher Channels (production)

## File Structure

```
server.js                   # Node server - static files + event relay to Soketi
docker-compose.yml          # Soketi configuration
test/
└── dice.test.js            # Dice parser/roller tests (node --test)
public/
├── index.html              # Single page app
├── css/styles.css          # Custom styles
└── js/
    ├── app.js              # Main app, event wiring
    ├── data-service.js     # Connection status tracking
    ├── dice.js             # Dice parser and roller
    ├── pusher-service.js   # WebSocket connection, events, state sync
    ├── room.js             # Room management, user identity
    └── ui.js               # UI rendering
```

## License

See [LICENSE](LICENSE) file.
