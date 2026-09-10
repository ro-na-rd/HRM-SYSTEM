import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Layout from '../components/Layout';
import { RATING_LABELS, ratingText } from '../lib/performance';

const EMPTY = {
  employee_id: '',
  period: '',
  review_date: '',
  rating: '',
  summary: '',
  strengths: '',
  improvements: '',
  goals: '',
};

function StatusBadge({ status }) {
  const published = status === 'published';
  return (
    <span className={`status-badge status-${published ? 'active' : 'pending'}`}>
      {published ? 'Published' : 'Draft'}
    </span>
  );
}

export default function Performance() {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.get('/performance/reviews').then(setRows).catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
    api.get('/employees').then(setEmployees).catch(() => setEmployees([]));
  }, []);

  function resetForm() {
    setForm(EMPTY);
    setEditingId(null);
  }

  function startEdit(r) {
    setError('');
    setEditingId(r.id);
    setForm({
      employee_id: String(r.employee_id),
      period: r.period || '',
      review_date: r.review_date || '',
      rating: r.rating ? String(r.rating) : '',
      summary: r.summary || '',
      strengths: r.strengths || '',
      improvements: r.improvements || '',
      goals: r.goals || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(e, status) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editingId) {
        const { employee_id, ...rest } = form; // eslint-disable-line no-unused-vars
        await api.patch(`/performance/reviews/${editingId}`, { ...rest, status });
      } else {
        await api.post('/performance/reviews', { ...form, status });
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(r, status) {
    setError('');
    try {
      await api.patch(`/performance/reviews/${r.id}`, { status });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this review permanently?')) return;
    setError('');
    try {
      await api.delete(`/performance/reviews/${id}`);
      if (editingId === id) resetForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout title="Performance">
      {error && <div className="error-banner">{error}</div>}

      <form className="card form-grid" onSubmit={(e) => submit(e, 'draft')}>
        <div className="page-header" style={{ gridColumn: '1 / -1' }}>
          <h3>{editingId ? 'Edit review' : 'New review'}</h3>
          {editingId && (
            <button type="button" className="danger" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>

        <label>
          Employee
          <select
            required
            disabled={!!editingId}
            value={form.employee_id}
            onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
          >
            <option value="">— Select —</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Review period
          <input
            required
            placeholder="e.g. 2026 H1"
            value={form.period}
            onChange={(e) => setForm({ ...form, period: e.target.value })}
          />
        </label>
        <label>
          Review date
          <input
            type="date"
            value={form.review_date}
            onChange={(e) => setForm({ ...form, review_date: e.target.value })}
          />
        </label>
        <label>
          Overall rating
          <select value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })}>
            <option value="">— Not rated —</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} — {RATING_LABELS[n]}
              </option>
            ))}
          </select>
        </label>

        <label style={{ gridColumn: '1 / -1' }}>
          Summary / manager comments
          <textarea rows={2} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Strengths
          <textarea
            rows={2}
            value={form.strengths}
            onChange={(e) => setForm({ ...form, strengths: e.target.value })}
          />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Areas to improve
          <textarea
            rows={2}
            value={form.improvements}
            onChange={(e) => setForm({ ...form, improvements: e.target.value })}
          />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Goals for next period
          <textarea rows={2} value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} />
        </label>

        <div className="actions-cell" style={{ gridColumn: '1 / -1' }}>
          <button type="submit" disabled={busy}>
            {editingId ? 'Save draft' : 'Save as draft'}
          </button>
          <button type="button" disabled={busy} onClick={(e) => submit(e, 'published')}>
            {editingId ? 'Save & publish' : 'Publish now'}
          </button>
        </div>
      </form>

      <h3>Reviews</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Period</th>
            <th>Rating</th>
            <th>Status</th>
            <th>Acknowledged</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.employee_name}</td>
              <td>{r.period}</td>
              <td>{r.rating ? ratingText(r.rating) : '—'}</td>
              <td>
                <StatusBadge status={r.status} />
              </td>
              <td>
                {r.acknowledged_at
                  ? new Date(r.acknowledged_at).toLocaleDateString()
                  : r.status === 'published'
                    ? 'Awaiting'
                    : '—'}
              </td>
              <td className="actions-cell">
                <button onClick={() => startEdit(r)}>Edit</button>
                {r.status === 'draft' ? (
                  <button onClick={() => setStatus(r, 'published')}>Publish</button>
                ) : (
                  <button onClick={() => setStatus(r, 'draft')}>Unpublish</button>
                )}
                <button className="danger" onClick={() => remove(r.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="empty-row">
                No reviews yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Layout>
  );
}
