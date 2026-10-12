// Thin wrapper around the Judge0 API. Code never runs on our server - it is
// sent to Judge0, which executes it inside a sandbox and returns the result.
const BASE = () => (process.env.JUDGE0_URL || 'https://ce.judge0.com').replace(/\/$/, '');

// Our language keys -> how to find them in Judge0's language list (+ fallback IDs).
export const LANGUAGES = {
  javascript: { label: 'JavaScript', match: /^JavaScript/i, fallback: 93 },
  python: { label: 'Python', match: /^Python \(3/i, fallback: 71 },
  java: { label: 'Java', match: /^Java \(/i, fallback: 62 },
  cpp: { label: 'C++', match: /^C\+\+ \(GCC/i, fallback: 54 },
  c: { label: 'C', match: /^C \(GCC/i, fallback: 50 },
};

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (process.env.JUDGE0_API_KEY) {
    h['X-RapidAPI-Key'] = process.env.JUDGE0_API_KEY;
    h['X-RapidAPI-Host'] = process.env.JUDGE0_API_HOST || 'judge0-ce.p.rapidapi.com';
  }
  return h;
}

let cache = null;
export async function resolveLanguageIds() {
  if (cache && Date.now() - cache.at < 3600_000) return cache.ids;
  const ids = {};
  for (const [k, v] of Object.entries(LANGUAGES)) ids[k] = v.fallback;
  try {
    const res = await fetch(`${BASE()}/languages`, { headers: headers(), signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const list = await res.json();
      for (const [k, v] of Object.entries(LANGUAGES)) {
        const found = list.filter((l) => v.match.test(l.name)).sort((a, b) => b.id - a.id)[0];
        if (found) ids[k] = found.id;
      }
    }
  } catch { /* use fallback ids */ }
  cache = { ids, at: Date.now() };
  return ids;
}

const b64 = (s) => Buffer.from(s ?? '', 'utf8').toString('base64');
const unb64 = (s) => (s ? Buffer.from(s, 'base64').toString('utf8') : '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runCode({ language, code, stdin = '' }) {
  const ids = await resolveLanguageIds();
  const create = await fetch(`${BASE()}/submissions?base64_encoded=true&wait=false`, {
    method: 'POST', headers: headers(), signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ language_id: ids[language], source_code: b64(code), stdin: b64(stdin), cpu_time_limit: 5, memory_limit: 128000 }),
  });
  if (!create.ok) throw new Error(`Judge0 rejected the submission (HTTP ${create.status})`);
  const { token } = await create.json();
  if (!token) throw new Error('Judge0 did not return a token');

  for (let i = 0; i < 25; i++) {
    await sleep(i === 0 ? 400 : 800);
    const r = await fetch(`${BASE()}/submissions/${token}?base64_encoded=true`, { headers: headers(), signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`Judge0 status check failed (HTTP ${r.status})`);
    const s = await r.json();
    if (s.status && s.status.id > 2) { // 1 = in queue, 2 = processing
      return {
        status: s.status.description, statusId: s.status.id,
        stdout: unb64(s.stdout), stderr: unb64(s.stderr),
        compileOutput: unb64(s.compile_output), message: unb64(s.message),
        time: s.time, memory: s.memory,
      };
    }
  }
  throw new Error('Execution timed out while waiting for Judge0');
}
