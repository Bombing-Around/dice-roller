/**
 * Dice Roller Server
 * - Serves static files from /public
 * - Relays events to Soketi
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const SOKETI_HOST = process.env.SOKETI_HOST || 'localhost';
const SOKETI_PORT = process.env.SOKETI_PORT || 6001;
const APP_ID = process.env.SOKETI_DEFAULT_APP_ID || 'dice-roller';
const APP_KEY = process.env.SOKETI_DEFAULT_APP_KEY || 'dice-roller-key';
const APP_SECRET = process.env.SOKETI_DEFAULT_APP_SECRET || 'dice-roller-secret';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Room codes are 6 chars from this alphabet (see room.js) -> channel is room-XXXXXX
const CHANNEL_RE = /^room-[A-Z0-9]{6}$/;

// Exact set of event names the client (public/js/pusher-service.js) binds to
// and broadcasts. Anything else is rejected.
const ALLOWED_EVENTS = new Set([
  'roll',
  'note',
  'roll-updated',
  'user-joined',
  'user-left',
  'user-updated',
  'room-name-changed',
  'state-sync-request',
  'state-sync-response',
]);

const MAX_BODY_BYTES = 64 * 1024; // 64KB

// Simple fixed-window per-IP rate limiting for /broadcast
const RATE_LIMIT_WINDOW_MS = 10 * 1000;
const RATE_LIMIT_MAX = 60;
const rateLimitBuckets = new Map(); // ip -> { count, windowStart }

/**
 * Check and update the rate limit bucket for an IP.
 * Returns true if the request is allowed, false if it should be rejected.
 * @param {string} ip - Client IP address
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);

  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(ip, { count: 1, windowStart: now });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= RATE_LIMIT_MAX;
}

/**
 * Remove expired rate limit buckets so the map cannot grow without bound.
 */
function pruneRateLimitBuckets() {
  const now = Date.now();
  for (const [ip, bucket] of rateLimitBuckets) {
    if (now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimitBuckets.delete(ip);
    }
  }
}

setInterval(pruneRateLimitBuckets, RATE_LIMIT_WINDOW_MS).unref();

/**
 * Trigger event on Soketi
 */
async function triggerEvent(channel, event, data) {
  const body = JSON.stringify({
    name: event,
    channel: channel,
    data: JSON.stringify(data),
  });
  
  const bodyMd5 = crypto.createHash('md5').update(body).digest('hex');
  const timestamp = Math.floor(Date.now() / 1000);
  
  const queryParams = `auth_key=${APP_KEY}&auth_timestamp=${timestamp}&auth_version=1.0&body_md5=${bodyMd5}`;
  const stringToSign = `POST\n/apps/${APP_ID}/events\n${queryParams}`;
  const signature = crypto.createHmac('sha256', APP_SECRET).update(stringToSign).digest('hex');
  
  const url = `http://${SOKETI_HOST}:${SOKETI_PORT}/apps/${APP_ID}/events?${queryParams}&auth_signature=${signature}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body,
  });
  
  return response.ok;
}

/**
 * Serve static file
 */
function serveStatic(req, res) {
  // Sanitize URL to prevent path traversal
  const sanitizedUrl = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(__dirname, 'public', sanitizedUrl === '/' ? 'index.html' : sanitizedUrl);
  
  // Ensure path stays within public directory
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // SPA fallback only applies to navigation requests (no file extension).
        // A request for a specific asset (.js, .css, .png, ...) that is
        // missing should 404, not silently return index.html.
        if (ext) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }
        fs.readFile(path.join(__dirname, 'public', 'index.html'), (err2, content2) => {
          if (err2) {
            res.writeHead(500);
            res.end('Server error');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content2);
        });
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
}

const server = http.createServer(async (req, res) => {
  // CORS for API
  if (req.url === '/broadcast') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Broadcast endpoint
  if (req.method === 'POST' && req.url === '/broadcast') {
    const ip = req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }

    let body = '';
    let tooLarge = false;

    req.on('data', chunk => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        tooLarge = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
      }
    });

    req.on('end', async () => {
      if (tooLarge) return;

      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
        return;
      }

      const { channel, event, data } = parsed;

      if (typeof channel !== 'string' || !CHANNEL_RE.test(channel)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
        return;
      }

      if (typeof event !== 'string' || !ALLOWED_EVENTS.has(event)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
        return;
      }

      try {
        const success = await triggerEvent(channel, event, data);
        res.writeHead(success ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Relay failed' }));
      }
    });
    return;
  }
  
  // Static files
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  Dice Roller running at http://localhost:${PORT}\n`);
  console.log(`  Make sure Soketi is running: docker-compose up\n`);
});
