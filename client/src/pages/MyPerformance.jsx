import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Layout from '../components/Layout';
import { ratingText } from '../lib/performance';

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div className="review-field">
      <strong>{label}</strong>
      <p>{value}</p>
    </div>
  );
}

export default function MyPerformance() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState(null);

  function load() {
    api
      .get('/performance/reviews')
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }

  useEffect(load, []);

  async function acknowledge(id) {
    setBusyId(id);
    setError('');
    try {
      await api.post(`/performance/reviews/${id}/acknowledge`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Layout title="Performance">
      {error && <div className="error-banner">{error}</div>}

      {loaded && rows.length === 0 && (
        <p className="hint">You don’t have any published performance reviews yet.</p>
      )}

      {rows.map((r) => (
        <div className="card" key={r.id}>
          <div className="page-header">
            <h3>{r.period}</h3>
            <span className="hint">{r.review_date || ''}</span>
          </div>
          <div className="employee-summary">
            <div>
              <strong>Overall rating:</strong> {ratingText(r.rating)}
            </div>
            <div>
              <strong>Reviewer:</strong> {r.reviewer_name || '—'}
            </div>
          </div>

          <Field label="Summary" value={r.summary} />
          <Field label="Strengths" value={r.strengths} />
          <Field label="Areas to improve" value={r.improvements} />
          <Field label="Goals for next period" value={r.goals} />

          <div className="review-ack">
            {r.acknowledged_at ? (
              <span className="hint">✓ Acknowledged on {new Date(r.acknowledged_at).toLocaleDateString()}</span>
            ) : (
              <button disabled={busyId === r.id} onClick={() => acknowledge(r.id)}>
                {busyId === r.id ? 'Saving…' : 'Acknowledge review'}
              </button>
            )}
          </div>
        </div>
      ))}
    </Layout>
  );
}
