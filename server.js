/**
 * Dice Roller Server
 * - Serves static files from /public
 * - Relays events to Soketi
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3000;
const SOKETI_HOST = 'localhost';
const SOKETI_PORT = 6001;
const APP_ID = 'dice-roller';
const APP_KEY = 'dice-roller-key';
const APP_SECRET = 'dice-roller-secret';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

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
        // SPA fallback
        fs.readFile(path.join(__dirname, 'public', 'index.html'), (err2, content2) => {
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
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { channel, event, data } = JSON.parse(body);
        const success = await triggerEvent(channel, event, data);
        res.writeHead(success ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
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
