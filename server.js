const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// Health check for Railway
app.get('/health', (_, res) => res.json({ status: 'ok', peers: clients.size }));

const clients = new Map();

wss.on('connection', (ws, req) => {
  const id = Math.random().toString(36).slice(2, 9);
  clients.set(id, { ws, role: null, name: 'جهاز', room: 'default' });

  ws.send(JSON.stringify({ type: 'id', id }));

  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, 25000);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const client = clients.get(id);
    if (!client) return;

    switch (msg.type) {
      case 'register':
        client.role = msg.role;
        client.name = msg.name || id;
        client.room = msg.room || 'default';
        broadcastPeerList(client.room);
        break;

      case 'offer':
      case 'answer':
      case 'ice':
        const target = clients.get(msg.to);
        if (target && target.ws.readyState === WebSocket.OPEN) {
          target.ws.send(JSON.stringify({ ...msg, from: id, fromName: client.name }));
        }
        break;
    }
  });

  ws.on('close', () => {
    clearInterval(ping);
    const c = clients.get(id);
    const room = c?.room || 'default';
    clients.delete(id);
    broadcastPeerList(room);
  });

  ws.on('error', () => {
    clients.delete(id);
  });
});

function getPeerList(room) {
  return [...clients.entries()]
    .filter(([, c]) => c.role && c.room === room)
    .map(([id, c]) => ({ id, role: c.role, name: c.name }));
}

function broadcastPeerList(room) {
  const peers = getPeerList(room);
  const msg = JSON.stringify({ type: 'peer-list', peers });
  for (const [, c] of clients) {
    if (c.room === room && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(msg);
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`HomeCam server running on port ${PORT}`);
});
