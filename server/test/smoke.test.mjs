// End-to-end smoke test: REST API, fake Judge0, and two-client Yjs sync.
// Run with:  npm test   (needs no MongoDB and no internet)
import http from 'node:http';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

process.env.USE_MEMORY_DB = 'true';

// ---- fake Judge0 ----
const subs = new Map();
const fake = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/languages')) return res.end(JSON.stringify([{ id: 63, name: 'JavaScript (Node.js 12.14.0)' }, { id: 102, name: 'JavaScript (Node.js 22.08.0)' }, { id: 71, name: 'Python (3.8.1)' }]));
    if (req.method === 'POST' && req.url.startsWith('/submissions')) {
      const j = JSON.parse(body); const token = 'tok' + subs.size; subs.set(token, j);
      res.statusCode = 201; return res.end(JSON.stringify({ token }));
    }
    const token = req.url.split('/')[2].split('?')[0];
    const j = subs.get(token);
    res.end(JSON.stringify({ status: { id: 3, description: 'Accepted' }, stdout: Buffer.from('echo:' + Buffer.from(j.source_code, 'base64').toString()).toString('base64'), time: '0.01', memory: 100 }));
  });
});
await new Promise((r) => fake.listen(0, r));
process.env.JUDGE0_URL = `http://localhost:${fake.address().port}`;

const { createServer } = await import('../index.js');
const { server } = await createServer();
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://localhost:${port}`;
const api = async (method, path, body, headers = {}) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('  ✓', name); };

console.log('REST API');
let room;
await t('POST /api/rooms creates a room with link + host token', async () => {
  const r = await api('POST', '/api/rooms', { title: 'Frontend Round', meetLink: 'https://meet.google.com/abc-defg-hij' });
  assert.equal(r.status, 201); room = r.body;
  assert.match(room.roomId, /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/);
  assert.ok(room.hostToken.length >= 32); assert.ok(room.link.endsWith('/room/' + room.roomId));
});
await t('rejects invalid meet link', async () => assert.equal((await api('POST', '/api/rooms', { meetLink: 'javascript:alert(1)' })).status, 400));
await t('GET /api/rooms/:id returns room WITHOUT host token', async () => {
  const r = await api('GET', '/api/rooms/' + room.roomId);
  assert.equal(r.status, 200); assert.equal(r.body.hostToken, undefined); assert.equal(r.body.title, 'Frontend Round');
});
await t('unknown room -> 404', async () => assert.equal((await api('GET', '/api/rooms/zzz-zzzz-zzz')).status, 404));
await t('GET /api/languages', async () => assert.ok((await api('GET', '/api/languages')).body.some((l) => l.key === 'python')));

console.log('Code execution');
await t('runs code through Judge0 (fake) and returns decoded output', async () => {
  const r = await api('POST', '/api/execute', { roomId: room.roomId, language: 'javascript', code: 'console.log(1)' });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'Accepted'); assert.equal(r.body.stdout, 'echo:console.log(1)');
  const picked = [...subs.values()].pop().language_id; assert.equal(picked, 102, 'picks newest Node version');
});
await t('empty code -> 400', async () => assert.equal((await api('POST', '/api/execute', { language: 'javascript', code: '  ' })).status, 400));
await t('bad language -> 400', async () => assert.equal((await api('POST', '/api/execute', { language: 'cobol', code: 'x' })).status, 400));
await t('unknown room -> 404', async () => assert.equal((await api('POST', '/api/execute', { roomId: 'nop-nope-nop', language: 'python', code: 'x' })).status, 404));

console.log('Feedback');
const fb = { roomId: room.roomId, candidateName: 'Asha', interviewerName: 'Ravi', ratings: { problemSolving: 4, codeQuality: 3, communication: 5, technical: 4 }, recommendation: 'hire', comments: 'Good', finalCode: 'x', language: 'javascript' };
await t('no token -> 401', async () => assert.equal((await api('POST', '/api/feedback', fb)).status, 401));
await t('wrong token -> 401', async () => assert.equal((await api('POST', '/api/feedback', fb, { 'x-host-token': 'nope' })).status, 401));
await t('invalid rating -> 400', async () => assert.equal((await api('POST', '/api/feedback', { ...fb, ratings: { ...fb.ratings, technical: 9 } }, { 'x-host-token': room.hostToken })).status, 400));
await t('valid feedback saved -> 201 and room ended', async () => {
  assert.equal((await api('POST', '/api/feedback', fb, { 'x-host-token': room.hostToken })).status, 201);
  assert.equal((await api('GET', '/api/rooms/' + room.roomId)).body.status, 'ended');
});
await t('GET feedback requires token and returns saved entry', async () => {
  assert.equal((await api('GET', '/api/feedback/' + room.roomId)).status, 401);
  const r = await api('GET', '/api/feedback/' + room.roomId, null, { 'x-host-token': room.hostToken });
  assert.equal(r.body.length, 1); assert.equal(r.body[0].candidateName, 'Asha');
});

console.log('Real-time sync (two clients, Yjs)');
const wsUrl = `ws://localhost:${port}/yjs`;
const mk = () => { const doc = new Y.Doc(); const p = new WebsocketProvider(wsUrl, room.roomId, doc, { WebSocketPolyfill: WebSocket }); return { doc, p }; };
const A = mk(), B = mk();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(600);
await t('edit on A appears on B', async () => { A.doc.getText('code').insert(0, 'hello'); await wait(300); assert.equal(B.doc.getText('code').toString(), 'hello'); });
await t('simultaneous edits both survive and converge', async () => {
  A.doc.getText('code').insert(0, 'A:'); B.doc.getText('code').insert(5, ':B'); await wait(400);
  const a = A.doc.getText('code').toString(), b = B.doc.getText('code').toString();
  assert.equal(a, b); assert.ok(a.includes('A:') && a.includes(':B'));
});
await t('late joiner receives full document', async () => { const C = mk(); await wait(500); assert.equal(C.doc.getText('code').toString(), A.doc.getText('code').toString()); C.p.destroy(); });
await t('shared output map syncs', async () => { A.doc.getMap('meta').set('output', { stdout: 'hi' }); await wait(300); assert.equal(B.doc.getMap('meta').get('output').stdout, 'hi'); });
await t('connection to unknown room is refused', async () => {
  const ok = await new Promise((resolve) => { const w = new WebSocket(wsUrl + '/nop-nope-nop'); w.on('open', () => resolve(false)); w.on('error', () => resolve(true)); w.on('unexpected-response', () => resolve(true)); });
  assert.ok(ok);
});

console.log(`\nAll ${passed} checks passed`);
A.p.destroy(); B.p.destroy(); server.close(); fake.close(); setTimeout(() => process.exit(0), 100);
