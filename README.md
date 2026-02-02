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

### Single Browser (tabs only)

Just serve the files - tabs in the same browser sync automatically:

```bash
npx serve public -p 3000
```

Open http://localhost:3000 in multiple tabs.

### Multi-Browser Local Testing

For testing across different browsers (Chrome + Firefox, etc.), run Soketi:

**Option A: Docker (easiest)**
```bash
# Terminal 1: Start Soketi via Docker
docker run -p 6001:6001 -e SOKETI_DEFAULT_APP_ID=dice-roller -e SOKETI_DEFAULT_APP_KEY=dice-roller-key -e SOKETI_DEFAULT_APP_SECRET=dice-roller-secret -e SOKETI_DEFAULT_APP_ENABLE_CLIENT_MESSAGES=true quay.io/soketi/soketi:latest-16-debian

# Terminal 2: Start web server
npx serve public -p 3000
```

**Option B: npm**
```bash
# Terminal 1: Start Soketi
npm run soketi

# Terminal 2: Start web server  
npm run start
```

Now open http://localhost:3000 in Chrome AND Firefox - they'll sync in real-time!

> The app auto-detects Soketi on localhost and connects automatically.

## Modes

### Local Mode
- Syncs between tabs in the same browser via BroadcastChannel
- Data persists in localStorage  
- Falls back to this if Soketi isn't running

### Soketi Mode (Local Development)
- Syncs across different browsers on same machine
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

The app is static files only - deploy anywhere:

- **GitHub Pages**: Push to `gh-pages` branch
- **Netlify**: Drag & drop the `public` folder
- **Vercel**: Connect your repo
- **Any static host**: Upload the `public` folder

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
- `d100` - Roll percentile (1-100)

Supported dice: d4, d6, d8, d10, d12, d16, d20, d100

## Tech Stack

- **Frontend**: Vanilla JavaScript + Tailwind CSS (via CDN)
- **Local Sync**: localStorage + BroadcastChannel API
- **Remote Sync**: Pusher Channels (optional)

## File Structure

```
public/
├── index.html              # Single page app
├── css/styles.css          # Custom styles
└── js/
    ├── app.js              # Main app, event wiring
    ├── data-service.js     # Mode detection (local vs pusher)
    ├── dice.js             # Dice parser and roller
    ├── local-storage.js    # Local mode implementation
    ├── pusher-service.js   # Pusher mode implementation
    ├── room.js             # Room management
    └── ui.js               # UI rendering
```

## License

See [LICENSE](LICENSE) file.
