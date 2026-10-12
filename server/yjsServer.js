// Minimal Yjs WebSocket sync server (speaks the standard y-websocket protocol).
// Each room has one shared Y.Doc kept in memory; updates are relayed to every
// connected client. Yjs (a CRDT) guarantees all copies converge.
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { WebSocketServer } from 'ws';
import { getRoom } from './db.js';

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const MAX_CLIENTS_PER_ROOM = 10;
const IDLE_MS = 30 * 60 * 1000;
const rooms = new Map();

function send(room, conn, buf) {
  if (conn.readyState !== 1) return closeConn(room, conn);
  conn.send(buf, (err) => err && closeConn(room, conn));
}

function getOrCreate(name) {
  let room = rooms.get(name);
  if (room) { clearTimeout(room.timer); return room; }
  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);
  room = { name, doc, awareness, conns: new Map(), timer: null };

  doc.on('update', (update) => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeUpdate(enc, update);
    const buf = encoding.toUint8Array(enc);
    room.conns.forEach((_, c) => send(room, c, buf));
  });

  awareness.on('update', ({ added, updated, removed }, origin) => {
    const changed = added.concat(updated, removed);
    if (origin && room.conns.has(origin)) {
      const ids = room.conns.get(origin);
      added.forEach((id) => ids.add(id));
      removed.forEach((id) => ids.delete(id));
    }
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_AWARENESS);
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
    const buf = encoding.toUint8Array(enc);
    room.conns.forEach((_, c) => send(room, c, buf));
  });

  rooms.set(name, room);
  return room;
}

function closeConn(room, conn) {
  const ids = room.conns.get(conn);
  if (ids) {
    room.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(ids), null);
    if (room.conns.size === 0) {
      room.timer = setTimeout(() => { room.doc.destroy(); rooms.delete(room.name); }, IDLE_MS);
    }
  }
  try { conn.close(); } catch { /* already closed */ }
}

function onMessage(room, conn, data) {
  try {
    const decoder = decoding.createDecoder(new Uint8Array(data));
    const type = decoding.readVarUint(decoder);
    if (type === MSG_SYNC) {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.readSyncMessage(decoder, enc, room.doc, conn);
      if (encoding.length(enc) > 1) send(room, conn, encoding.toUint8Array(enc));
    } else if (type === MSG_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), conn);
    }
  } catch (err) {
    console.error('[yjs] bad message:', err.message);
  }
}

export function attachYjsServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });

  httpServer.on('upgrade', async (req, socket, head) => {
    const match = /^\/yjs\/([A-Za-z0-9-]{3,64})(\?.*)?$/.exec(req.url || '');
    if (!match) return socket.destroy(); // not ours
    const roomId = match[1];
    try {
      const meta = await getRoom(roomId);
      const existing = rooms.get(roomId);
      if (!meta || (existing && existing.conns.size >= MAX_CLIENTS_PER_ROOM)) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        return socket.destroy();
      }
      wss.handleUpgrade(req, socket, head, (ws) => setup(ws, roomId));
    } catch {
      socket.destroy();
    }
  });
}

function setup(conn, roomId) {
  conn.binaryType = 'arraybuffer';
  const room = getOrCreate(roomId);
  room.conns.set(conn, new Set());
  conn.on('message', (m) => onMessage(room, conn, m));
  conn.on('close', () => closeConn(room, conn));
  conn.on('error', () => closeConn(room, conn));

  // Heartbeat so dead connections are cleaned up.
  let alive = true;
  conn.on('pong', () => { alive = true; });
  const ping = setInterval(() => {
    if (!alive) { clearInterval(ping); return closeConn(room, conn); }
    alive = false;
    try { conn.ping(); } catch { closeConn(room, conn); }
  }, 30000);
  conn.on('close', () => clearInterval(ping));

  // Initial handshake: send our state vector + current awareness.
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_SYNC);
  syncProtocol.writeSyncStep1(enc, room.doc);
  send(room, conn, encoding.toUint8Array(enc));
  const states = room.awareness.getStates();
  if (states.size > 0) {
    const e2 = encoding.createEncoder();
    encoding.writeVarUint(e2, MSG_AWARENESS);
    encoding.writeVarUint8Array(e2, awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())));
    send(room, conn, encoding.toUint8Array(e2));
  }
}
