import { Router } from 'express';
import crypto from 'node:crypto';
import * as db from './db.js';
import { LANGUAGES, resolveLanguageIds, runCode } from './judge0.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- helpers -------------------------------------------------------------
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const part = (n) => Array.from({ length: n }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
const newRoomId = () => `${part(3)}-${part(4)}-${part(3)}`; // e.g. kfm-w3xq-p7d
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isUrl = (v) => { try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } };

// Very small in-memory rate limiter (per IP) to protect the Judge0 quota.
const hits = new Map();
const limit = (max, windowMs) => (req, res, next) => {
  const key = req.ip + req.path;
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  arr.push(now); hits.set(key, arr); next();
};

async function requireHost(req, res, next) {
  const roomId = req.params.roomId || req.params.id || req.body?.roomId;
  const room = await db.getRoom(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (req.get('x-host-token') !== room.hostToken) return res.status(401).json({ error: 'Only the interviewer can do this' });
  req.room = room; next();
}

const publicRoom = (r) => ({ roomId: r.roomId, title: r.title, meetLink: r.meetLink, language: r.language, status: r.status, createdAt: r.createdAt });

// ---- health & languages --------------------------------------------------
router.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

router.get('/languages', wrap(async (req, res) => {
  await resolveLanguageIds();
  res.json(Object.entries(LANGUAGES).map(([key, v]) => ({ key, label: v.label })));
}));

// ---- rooms ---------------------------------------------------------------
router.post('/rooms', limit(20, 60_000), wrap(async (req, res) => {
  const title = str(req.body?.title, 100) || 'Coding Interview';
  const meetLink = str(req.body?.meetLink, 300);
  const language = req.body?.language && LANGUAGES[req.body.language] ? req.body.language : 'javascript';
  if (meetLink && !isUrl(meetLink)) return res.status(400).json({ error: 'meetLink must be a valid http(s) URL' });
  const roomId = newRoomId();
  const hostToken = crypto.randomBytes(24).toString('hex');
  const room = await db.createRoom({ roomId, hostToken, title, meetLink, language });
  const origin = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  res.status(201).json({ ...publicRoom(room), hostToken, link: `${origin}/room/${roomId}` });
}));

router.get('/rooms/:id', wrap(async (req, res) => {
  const room = await db.getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(publicRoom(room));
}));

router.post('/rooms/:id/end', requireHost, wrap(async (req, res) => {
  res.json(publicRoom(await db.updateRoom(req.room.roomId, { status: 'ended' })));
}));

// ---- code execution ------------------------------------------------------
router.post('/execute', limit(30, 60_000), wrap(async (req, res) => {
  const { roomId, language, code, stdin } = req.body || {};
  if (!LANGUAGES[language]) return res.status(400).json({ error: 'Unsupported language' });
  if (typeof code !== 'string' || !code.trim()) return res.status(400).json({ error: 'Code is empty' });
  if (code.length > 100_000) return res.status(400).json({ error: 'Code is too large (max 100 KB)' });
  if (stdin !== undefined && (typeof stdin !== 'string' || stdin.length > 10_000)) return res.status(400).json({ error: 'Invalid stdin' });
  if (roomId) {
    const room = await db.getRoom(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
  }
  try {
    res.json(await runCode({ language, code, stdin: stdin || '' }));
  } catch (err) {
    res.status(502).json({ error: `Code execution service error: ${err.message}` });
  }
}));

// ---- feedback (interviewer only) ----------------------------------------
const RECS = ['strong_hire', 'hire', 'no_hire', 'strong_no_hire'];
const RATING_KEYS = ['problemSolving', 'codeQuality', 'communication', 'technical'];

router.post('/feedback', requireHost, wrap(async (req, res) => {
  const b = req.body || {};
  const ratings = {};
  for (const k of RATING_KEYS) {
    const n = Number(b.ratings?.[k]);
    if (!Number.isInteger(n) || n < 1 || n > 5) return res.status(400).json({ error: `Rating "${k}" must be an integer from 1 to 5` });
    ratings[k] = n;
  }
  if (!RECS.includes(b.recommendation)) return res.status(400).json({ error: 'Invalid recommendation' });
  const fb = await db.saveFeedback({
    roomId: req.room.roomId,
    candidateName: str(b.candidateName, 100),
    interviewerName: str(b.interviewerName, 100),
    ratings, recommendation: b.recommendation,
    comments: str(b.comments, 3000),
    finalCode: typeof b.finalCode === 'string' ? b.finalCode.slice(0, 100_000) : '',
    language: LANGUAGES[b.language] ? b.language : req.room.language,
  });
  await db.updateRoom(req.room.roomId, { status: 'ended' });
  res.status(201).json(fb);
}));

router.get('/feedback/:roomId', requireHost, wrap(async (req, res) => {
  res.json(await db.getFeedback(req.room.roomId));
}));

export default router;
