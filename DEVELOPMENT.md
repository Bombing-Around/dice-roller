# Development Notes

Reference document for continuing development on the Dice Roller project.

## Current State (Feb 2026)

Working MVP with:
- Real-time multiplayer dice rolling via Soketi (Pusher-compatible WebSocket server)
- Room creation/joining with 6-character codes
- TTRPG dice support (d4, d6, d8, d10, d12, d16, d20, d100)
- Session logging with rolls, notes, and editable details (action/description/outcome)
- JSON export for record keeping
- Persistent user identity across refreshes

## Running Locally

```bash
# Terminal 1: Start Soketi
docker-compose up

# Terminal 2: Start app server
npm start
```

Then open http://localhost:3000 in multiple browsers.

## Architecture

```
Browser (Pusher.js) <--WebSocket--> Soketi (port 6001)
       |
       v
Browser (fetch /broadcast) --> Node Server (port 3000) --> Soketi HTTP API
       |
       v
Static files served from /public
```

**Why the relay server?**
Soketi/Pusher requires server-side authentication to broadcast events. The Node server handles HMAC signing for the HTTP API.

## Key Files

| File | Purpose |
|------|---------|
| `server.js` | Node server - static files + event relay to Soketi |
| `public/js/pusher-service.js` | WebSocket connection, event handling, state sync |
| `public/js/room.js` | Room management, user identity |
| `public/js/dice.js` | Dice notation parser and roller |
| `public/js/ui.js` | DOM manipulation, modals, rendering |
| `public/js/app.js` | Main app, event wiring |
| `public/js/data-service.js` | Connection status tracking |
| `docker-compose.yml` | Soketi configuration |

## State Sync Strategy

Rooms don't persist on the server. State is distributed across connected clients:

1. User A creates room, has local state
2. User B joins room
3. User A detects join, sends state-sync-response with full room state
4. User B merges received state into local state

**Known issue:** If multiple users exist when someone joins, all send state (causes duplicate broadcasts but works).

## TODO / Future Work

### High Priority
- [ ] Reconnection handling when WebSocket drops
- [ ] Rate limiting on `/broadcast` endpoint
- [ ] Room cleanup (memory leak - rooms live forever)
- [ ] Better error feedback when broadcast fails

### Nice to Have
- [ ] Dice roll animations
- [ ] Sound effects
- [ ] Markdown support in notes
- [ ] Edit/delete notes (not just rolls)
- [ ] Presence indicators (typing, away)
- [ ] Mobile-responsive improvements

### Production Deployment
- [ ] Configure for production Pusher (update `PROD_CONFIG` in pusher-service.js)
- [ ] Add HTTPS/TLS
- [ ] Environment variables for secrets
- [ ] Proper logging
- [ ] Health check endpoint

## Configuration

### Local (Soketi)
Configured in `docker-compose.yml`:
- App ID: `dice-roller`
- App Key: `dice-roller-key`
- App Secret: `dice-roller-secret`

### Production (Pusher)
Update `public/js/pusher-service.js`:
```javascript
const PROD_CONFIG = {
  key: 'YOUR_PUSHER_KEY',
  cluster: 'YOUR_CLUSTER',
};
```

## Testing Checklist

- [ ] Create room in Browser A
- [ ] Join same room in Browser B (different browser)
- [ ] Roll dice in A, verify appears in B
- [ ] Roll dice in B, verify appears in A
- [ ] Add note, verify syncs
- [ ] Edit roll details, verify syncs
- [ ] Change username, verify updates
- [ ] Export JSON, verify contains all data
- [ ] Refresh page, verify can rejoin with same identity
- [ ] Leave room, verify removed from user list
