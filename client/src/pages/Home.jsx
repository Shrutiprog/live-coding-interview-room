import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, hostKey } from '../api.js';
import { TEMPLATES } from '../templates.js';

export default function Home() {
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [meetLink, setMeetLink] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const room = await api.createRoom({ title, meetLink, language });
      localStorage.setItem(hostKey(room.roomId), room.hostToken);
      nav(`/room/${room.roomId}`);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  function join(e) {
    e.preventDefault();
    const m = joinCode.trim().match(/([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})\s*$/i);
    if (m) nav(`/room/${m[1].toLowerCase()}`); else setError('Paste a valid room link or code (e.g. abc-defg-hij).');
  }

  return (
    <div className="home">
      <header className="hero">
        <h1>💻 Live Coding Interview Room</h1>
        <p>Share one editor, run code together, and capture feedback — all in a single browser tab.</p>
      </header>
      <div className="cards">
        <form className="card" onSubmit={create}>
          <h2>Create a room <span className="tag">Interviewer</span></h2>
          <label>Interview title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Frontend Developer – Round 1" maxLength={100} /></label>
          <label>Starting language
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {Object.keys(TEMPLATES).map((k) => <option key={k} value={k}>{k === 'cpp' ? 'C++' : k === 'javascript' ? 'JavaScript' : k[0].toUpperCase() + k.slice(1)}</option>)}
            </select>
          </label>
          <label>Google Meet / video link <small>(optional)</small><input value={meetLink} onChange={(e) => setMeetLink(e.target.value)} placeholder="https://meet.google.com/..." /></label>
          <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create room & get link'}</button>
        </form>
        <form className="card" onSubmit={join}>
          <h2>Join a room <span className="tag alt">Candidate</span></h2>
          <label>Room link or code<input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="https://…/room/abc-defg-hij" /></label>
          <button className="btn">Join room</button>
          <p className="hint">Or simply open the link your interviewer sent you.</p>
        </form>
      </div>
      {error && <div className="error center">{error}</div>}
    </div>
  );
}
