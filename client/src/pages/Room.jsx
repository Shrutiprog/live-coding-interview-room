import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import { api, hostKey } from '../api.js';
import { TEMPLATES, MONACO_LANG } from '../templates.js';
import FeedbackForm from '../components/FeedbackForm.jsx';

const COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#60a5fa', '#a78bfa', '#f472b6'];
const LABELS = { javascript: 'JavaScript', python: 'Python', java: 'Java', cpp: 'C++', c: 'C' };

export default function Room() {
  const { roomId } = useParams();
  const hostToken = localStorage.getItem(hostKey(roomId));
  const isHost = !!hostToken;

  const [room, setRoom] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState(localStorage.getItem('ilr_name') || '');
  const [nameInput, setNameInput] = useState('');

  const [session, setSession] = useState(null); // { doc, provider }
  const [status, setStatus] = useState('connecting');
  const [users, setUsers] = useState([]);
  const [language, setLanguage] = useState('javascript');
  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(null);
  const [ended, setEnded] = useState(false);
  const [stdin, setStdin] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null);
  const bindingRef = useRef(null);
  const styleRef = useRef(null);

  // 1. Load room details
  useEffect(() => {
    api.getRoom(roomId).then((r) => { setRoom(r); setLanguage(r.language); setEnded(r.status === 'ended'); })
      .catch((e) => (e.status === 404 ? setNotFound(true) : setError(e.message)));
  }, [roomId]);

  // 2. Connect to the shared Yjs document once we know the user's name
  useEffect(() => {
    if (!room || !name) return;
    const doc = new Y.Doc();
    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/yjs`;
    const provider = new WebsocketProvider(wsUrl, roomId, doc);
    const meta = doc.getMap('meta');
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    provider.awareness.setLocalStateField('user', { name, color, role: isHost ? 'Interviewer' : 'Candidate' });

    provider.on('status', (e) => setStatus(e.status));
    provider.on('sync', (synced) => {
      // Only the interviewer seeds the starter code, so it is never inserted twice.
      if (synced && isHost && !meta.get('initialized')) {
        doc.transact(() => {
          meta.set('initialized', true);
          meta.set('language', room.language);
          doc.getText('code').insert(0, TEMPLATES[room.language]);
        });
      }
    });
    const readMeta = () => {
      if (meta.get('language')) setLanguage(meta.get('language'));
      setOutput(meta.get('output') || null);
      setRunning(meta.get('running') || null);
      if (meta.get('ended')) setEnded(true);
    };
    meta.observe(readMeta); readMeta();

    // Participants list + coloured remote cursors
    const aw = provider.awareness;
    const onAwareness = () => {
      const list = []; let css = '';
      aw.getStates().forEach((s, id) => {
        if (!s.user) return;
        list.push({ id, ...s.user, me: id === doc.clientID });
        if (id !== doc.clientID) {
          const n = String(s.user.name).replace(/[^\w .-]/g, '');
          css += `.yRemoteSelection-${id}{background:${s.user.color}44}` +
            `.yRemoteSelectionHead-${id}{position:absolute;border-left:2px solid ${s.user.color};height:100%;box-sizing:border-box}` +
            `.yRemoteSelectionHead-${id}::after{content:"${n}";position:absolute;top:-1.4em;left:-2px;font-size:11px;padding:0 4px;color:#000;background:${s.user.color};white-space:nowrap;border-radius:3px}`;
        }
      });
      setUsers(list);
      if (styleRef.current) styleRef.current.textContent = css;
    };
    aw.on('change', onAwareness); onAwareness();

    window.__ilr = { doc, provider }; // handy for debugging / automated tests
    setSession({ doc, provider });
    return () => { provider.destroy(); doc.destroy(); setSession(null); };
  }, [room, name, roomId, isHost]);

  // 3. Bind Monaco <-> Yjs when both the editor and the session are ready.
  // (The editor lives in state, so this effect re-runs whichever of the two arrives last.)
  useEffect(() => {
    if (!session || !editor) return;
    const binding = new MonacoBinding(session.doc.getText('code'), editor.getModel(), new Set([editor]), session.provider.awareness);
    bindingRef.current = binding;
    return () => { binding.destroy(); bindingRef.current = null; };
  }, [session, editor]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2000); };
  const link = `${location.origin}/room/${roomId}`;
  const copy = async () => { try { await navigator.clipboard.writeText(link); flash('Link copied!'); } catch { flash(link); } };
  const getCode = () => session?.doc.getText('code').toString() || '';

  async function changeLanguage(lang) {
    const meta = session.doc.getMap('meta'), text = session.doc.getText('code');
    const code = text.toString();
    session.doc.transact(() => {
      meta.set('language', lang);
      // Swap starter template only if nobody has edited the previous one yet.
      if (code === TEMPLATES[language] || !code.trim()) { text.delete(0, text.length); text.insert(0, TEMPLATES[lang]); }
    });
  }

  async function run() {
    if (!session || running || ended) return;
    const meta = session.doc.getMap('meta');
    meta.set('running', name); meta.set('output', null);
    try {
      const r = await api.execute({ roomId, language, code: getCode(), stdin });
      meta.set('output', { ...r, by: name, at: Date.now() });
    } catch (e) {
      meta.set('output', { error: e.message, by: name, at: Date.now() });
    } finally { meta.set('running', null); }
  }

  function onFeedbackSaved() {
    session?.doc.getMap('meta').set('ended', true);
    setEnded(true);
  }

  // ---------- render ----------
  if (notFound) return <div className="center-page"><h2>Room not found</h2><p>The link may be wrong or the room no longer exists.</p><Link className="btn primary" to="/">Back to home</Link></div>;
  if (error) return <div className="center-page"><div className="error">{error}</div><Link className="btn" to="/">Back</Link></div>;
  if (!room) return <div className="center-page">Loading room…</div>;

  if (!name) {
    return (
      <div className="center-page">
        <form className="card narrow" onSubmit={(e) => { e.preventDefault(); const n = nameInput.trim(); if (n) { localStorage.setItem('ilr_name', n); setName(n); } }}>
          <h2>{room.title}</h2>
          <p>You are joining as the <b>{isHost ? 'Interviewer' : 'Candidate'}</b>.</p>
          <label>Your name<input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={40} placeholder="e.g. Shruti" /></label>
          <button className="btn primary" disabled={!nameInput.trim()}>Enter room</button>
        </form>
      </div>
    );
  }

  const outText = output && !output.error ? [output.compileOutput, output.stdout, output.stderr, output.message].filter(Boolean).join('\n') : '';
  const ok = output && !output.error && output.statusId === 3;

  return (
    <div className="room">
      <style ref={styleRef} />
      <header className="topbar">
        <div className="brand"><Link to="/">💻</Link> <b>{room.title}</b> <span className={'dot ' + status} title={status} /> <small>{status === 'connected' ? 'Live' : status}</small></div>
        <div className="people">
          {users.map((u) => <span key={u.id} className="chip" style={{ borderColor: u.color }}><i style={{ background: u.color }} />{u.name}{u.me ? ' (you)' : ''} · {u.role}</span>)}
        </div>
        <div className="tools">
          <button className="btn sm" onClick={copy}>🔗 Copy invite link</button>
          {room.meetLink && <a className="btn sm" href={room.meetLink} target="_blank" rel="noreferrer">🎥 Open Meet</a>}
          {isHost && !ended && <button className="btn sm danger" onClick={() => setShowFeedback(true)}>End & feedback</button>}
        </div>
      </header>

      {ended && <div className="banner">This session has ended. The editor is now read-only.</div>}
      {status !== 'connected' && !ended && <div className="banner warn">Reconnecting… your changes will sync when the connection returns.</div>}

      <div className="workspace">
        <section className="editor-pane">
          <div className="toolbar">
            <select value={language} onChange={(e) => changeLanguage(e.target.value)} disabled={ended}>
              {Object.entries(LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button className="btn primary sm" onClick={run} disabled={!!running || ended || status !== 'connected'}>
              {running ? `⏳ ${running === name ? 'Running…' : running + ' is running…'}` : '▶ Run code'}
            </button>
          </div>
          <div className="monaco">
            <Editor
              height="100%" theme="vs-dark" language={MONACO_LANG[language]} onMount={(ed) => setEditor(ed)}
              options={{ fontSize: 15, minimap: { enabled: false }, automaticLayout: true, scrollBeyondLastLine: false, readOnly: ended, padding: { top: 12 } }}
              loading="Loading editor…"
            />
          </div>
        </section>

        <aside className="output-pane">
          <div className="panel-title">Input (stdin)</div>
          <textarea className="stdin" value={stdin} onChange={(e) => setStdin(e.target.value)} placeholder="Optional input for your program…" rows={3} />
          <div className="panel-title">
            Output {output && !output.error && <span className={'badge ' + (ok ? 'ok' : 'bad')}>{output.status}</span>}
            {output?.time && <small> {output.time}s · {Math.round(output.memory / 1024)} MB</small>}
          </div>
          <pre className="output">
            {running ? 'Running…' : output?.error ? <span className="err">{output.error}</span> : output ? (outText || '(no output)') : 'Click “Run code” — the result is shown to everyone in the room.'}
          </pre>
          {output && !running && <div className="runby">Run by {output.by}</div>}
        </aside>
      </div>

      {showFeedback && (
        <FeedbackForm roomId={roomId} hostToken={hostToken} defaultInterviewer={name} language={language}
          getCode={getCode} onClose={() => setShowFeedback(false)} onSaved={onFeedbackSaved} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
