# 💻 Live Coding Interview Room

A browser-based room where an **interviewer** and a **candidate** share one live code editor, run code together, and where the interviewer saves feedback at the end — built from scratch (CoderPad / HackerRank-live style).

**Author:** Shruti Tripathi · BCA 5th Semester · GGSIPU (KIRAS) · Enrolment No. 35114402024

## Features
| Feature | How it works |
|---|---|
| Room creation + shareable link | `POST /api/rooms` generates an ID like `kfm-w3xq-p7d`; the creator becomes the interviewer (secret host token stored in their browser) |
| Real-time shared editor | **Monaco Editor** + **Yjs** (CRDT) over WebSockets – simultaneous typing never overwrites anyone |
| Live cursors & participant list | Yjs *awareness* (names, colours, role) |
| Code execution | Sent to **Judge0** (sandbox) – nothing runs on our server. Output is shared with everyone in the room. Languages: JavaScript, Python, Java, C++, C; optional stdin |
| Feedback form | Ratings (1–5 × 4 criteria), recommendation, comments + final code → **MongoDB**; session is then marked *ended* (editor becomes read-only) |
| Video/audio | Paste a Google Meet link when creating the room → "Open Meet" button |
| Extras | Auto-reconnect, rate limiting, input validation, only-host-can-read-feedback, MongoDB-optional in-memory fallback |

## Tech stack
React 19 + Vite · Monaco · Yjs / y-websocket protocol · Node.js + Express 5 · `ws` · MongoDB + Mongoose · Judge0 API · Postman

## Folder structure
```
client/            React app (Home page, Room page, FeedbackForm)
server/
  index.js         Express app + HTTP server (also serves the built React app)
  routes.js        REST API (rooms, execute, feedback)
  yjsServer.js     WebSocket server that syncs Yjs documents per room
  judge0.js        Judge0 integration (submit + poll, language lookup)
  db.js            MongoDB models + in-memory fallback
  test/smoke.test.mjs   automated API + 2-client sync test
postman/           Postman collection with tests
```

## Prerequisites
* Node.js 18+ (20/22 recommended)
* MongoDB – either installed locally **or** a free MongoDB Atlas connection string. *(Optional: without it the app still works, but data is kept in memory only.)*
* Internet access (for Judge0). The free public instance `https://ce.judge0.com` needs no key.

## Setup & run

```bash
# 1. install everything
npm run setup

# 2. configure the server
cp server/.env.example server/.env      # Windows: copy server\.env.example server\.env
#    edit MONGODB_URI if needed

# 3a. DEVELOPMENT (two terminals)
npm run dev:server        # API + WebSocket on http://localhost:4000
npm run dev:client        # React on http://localhost:5173   <-- open this

# 3b. PRODUCTION-style (one process)
npm run build
npm start                 # everything on http://localhost:4000
```

### Try it
1. Open the app → **Create room** (optionally paste a Meet link).
2. Enter your name → you are the **Interviewer**. Click **Copy invite link**.
3. Open the link in another browser (or Incognito window) → enter a name → you are the **Candidate**.
4. Type in either window – both update instantly; cursors are labelled. Choose a language, click **▶ Run code** – both see the output.
5. Interviewer clicks **End & feedback**, fills the form and saves. The candidate sees "session ended".

> The interviewer role is tied to the browser that created the room. Open the invite link in a *different* browser/profile for the candidate.

## Testing

**1. Automated (no MongoDB / internet needed – uses a fake Judge0)**
```bash
npm test
```
Checks 19 things: room API, validation, 401/404 cases, Judge0 flow, feedback saving, and Yjs sync between two clients (simultaneous edits converge, late joiner gets the full document, unknown rooms are refused).

**2. Two-browser concurrency checklist (manual)**
- [ ] Both windows show the same starter code
- [ ] Type in A → appears in B within a moment (and vice-versa)
- [ ] Both type on the *same line at the same time* → both edits survive, windows identical
- [ ] Select text in A → B shows a coloured, named selection
- [ ] Refresh B mid-session → code is restored
- [ ] Stop the server for ~10 s, then start it → "Reconnecting…" banner, then back to "Live"
- [ ] Switch language in A → B switches too
- [ ] Run in B → output appears in A, with "Run by B"
- [ ] After feedback, both editors become read-only

**3. Postman** – import `postman/Interview-Room.postman_collection.json`, start the server (`baseUrl` = `http://localhost:4000`) and run the collection with the Collection Runner. Requests 1→13 run in order (they store `roomId` / `hostToken` automatically). Request 6 needs internet access to Judge0.

## REST API
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | – | Liveness check |
| GET | `/api/languages` | – | Supported languages |
| POST | `/api/rooms` | – | Create room → `{roomId, hostToken, link}` |
| GET | `/api/rooms/:id` | – | Room details (no token) |
| POST | `/api/rooms/:id/end` | `x-host-token` | Mark session ended |
| POST | `/api/execute` | – | Run `{language, code, stdin?, roomId?}` via Judge0 |
| POST | `/api/feedback` | `x-host-token` | Save feedback (ratings 1–5, recommendation, comments, finalCode) |
| GET | `/api/feedback/:roomId` | `x-host-token` | Read saved feedback |

WebSocket: `ws://host/yjs/<roomId>` (Yjs sync protocol). Connections to non-existent rooms are rejected.

## Deploying (e.g. Render / Railway)
Use a single **Web Service** (WebSockets are supported):
* Build command: `npm run setup && npm run build`
* Start command: `npm start`
* Environment: `MONGODB_URI` (Atlas), optionally `JUDGE0_URL` / `JUDGE0_API_KEY`, `PUBLIC_URL`
* Open the deployed URL and share room links as usual.

## Troubleshooting
| Problem | Fix |
|---|---|
| Console says "Using IN-MEMORY storage" | MongoDB URI missing/unreachable. Start MongoDB or fix `MONGODB_URI`. |
| "Code execution service error … 403/429" | Public Judge0 is rate-limited or blocked on your network. Retry, or use a RapidAPI key (see `.env.example`). |
| Editor stays on "Connecting" | Make sure the server is running; in dev, open port **5173** (not 4000). |
| Room "not found" after server restart | Without MongoDB rooms live in memory – use MongoDB for persistence. |

## Security notes
Untrusted code is never executed locally (Judge0 sandbox); inputs are validated and size-limited; feedback endpoints require the secret host token; execute/create endpoints are rate-limited. For a real production product you would add user accounts, HTTPS-only cookies/tokens and a persistent Yjs store.
"# live-coding-interview-room" 
