import { useState } from 'react';
import { api } from '../api.js';

const CRITERIA = [
  ['problemSolving', 'Problem solving'],
  ['codeQuality', 'Code quality'],
  ['communication', 'Communication'],
  ['technical', 'Technical knowledge'],
];
const RECS = [
  ['strong_hire', 'Strong hire'], ['hire', 'Hire'], ['no_hire', 'No hire'], ['strong_no_hire', 'Strong no hire'],
];

export default function FeedbackForm({ roomId, hostToken, defaultInterviewer, getCode, language, onClose, onSaved }) {
  const [form, setForm] = useState({
    candidateName: '', interviewerName: defaultInterviewer || '',
    ratings: { problemSolving: 0, codeQuality: 0, communication: 0, technical: 0 },
    recommendation: '', comments: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const rate = (k, v) => setForm((f) => ({ ...f, ratings: { ...f.ratings, [k]: v } }));

  async function submit(e) {
    e.preventDefault(); setError('');
    if (Object.values(form.ratings).some((v) => !v)) return setError('Please rate every criterion (1–5).');
    if (!form.recommendation) return setError('Please choose a recommendation.');
    setBusy(true);
    try {
      await api.submitFeedback({ ...form, roomId, language, finalCode: getCode() }, hostToken);
      setDone(true); onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <h2>✅ Feedback saved</h2>
            <p>The evaluation and the final code were stored in the database. The session is now marked as ended.</p>
            <button className="btn primary" onClick={onClose}>Close</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <h2>Interview feedback</h2>
            <div className="row2">
              <label>Candidate name<input value={form.candidateName} onChange={(e) => set('candidateName', e.target.value)} maxLength={100} /></label>
              <label>Interviewer name<input value={form.interviewerName} onChange={(e) => set('interviewerName', e.target.value)} maxLength={100} /></label>
            </div>
            {CRITERIA.map(([k, label]) => (
              <div className="rating" key={k}>
                <span>{label}</span>
                <div>{[1, 2, 3, 4, 5].map((n) => (
                  <button type="button" key={n} className={'star' + (form.ratings[k] >= n ? ' on' : '')} onClick={() => rate(k, n)} aria-label={`${label} ${n}`}>★</button>
                ))}</div>
              </div>
            ))}
            <label>Recommendation
              <select value={form.recommendation} onChange={(e) => set('recommendation', e.target.value)}>
                <option value="">Select…</option>
                {RECS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label>Comments<textarea rows={4} value={form.comments} onChange={(e) => set('comments', e.target.value)} maxLength={3000} placeholder="Strengths, weaknesses, notes for the hiring team…" /></label>
            <p className="hint">The final code in the editor is saved along with this feedback.</p>
            {error && <div className="error">{error}</div>}
            <div className="actions">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save feedback & end session'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
