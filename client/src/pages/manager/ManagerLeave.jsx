import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import Layout from '../../components/Layout';
import { todayLocal } from '../../lib/attendance';
import { TEAM_START_DATE, LEAVE_TYPE_LABELS, fmtDate } from '../../lib/team';

function leaveState(l, today) {
  if (l.end_date < today) return { label: 'Finished', cls: 'status-resolved' };
  if (l.start_date > today) return { label: 'Upcoming', cls: 'status-pending' };
  return { label: 'On leave now', cls: 'status-approved' };
}

export default function ManagerLeave() {
  const today = todayLocal();
  const firstDay = today < TEAM_START_DATE ? TEAM_START_DATE : today;
  const empty = { employee_id: '', type: 'annual', start_date: firstDay, end_date: firstDay, reason: '' };
  const [rows, setRows] = useState([]);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  function load() {
    api
      .get('/manager/leave')
      .then(setRows)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
    api
      .get('/manager/employees')
      .then((list) => setMembers(list.filter((m) => m.active)))
      .catch((e) => setError(e.message));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/manager/leave', form);
      setForm(empty);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    setError('');
    try {
      await api.delete(`/manager/leave/${id}`);
      setConfirmId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout title="Leave Management">
      {error && <div className="error-banner">{error}</div>}

      <form className="card form-grid" onSubmit={submit}>
        <div className="page-header" style={{ gridColumn: '1 / -1' }}>
          <h3>Record leave</h3>
          <span className="hint">When a team member tells you they’re taking leave, record it here.</span>
        </div>
        <label>
          Team member
          <select required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
            <option value="">— Select —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {Object.entries(LEAVE_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            required
            min={TEAM_START_DATE}
            value={form.start_date}
            onChange={(e) =>
              setForm({
                ...form,
                start_date: e.target.value,
                end_date: form.end_date < e.target.value ? e.target.value : form.end_date,
              })
            }
          />
        </label>
        <label>
          To (last day of leave)
          <input
            type="date"
            required
            min={form.start_date || TEAM_START_DATE}
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Reason / note
          <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Record leave'}
        </button>
      </form>

      <div className="page-header">
        <h3>Leave records</h3>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Team member</th>
            <th>Type</th>
            <th>From</th>
            <th>To</th>
            <th>Reason</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const s = leaveState(l, today);
            return (
              <tr key={l.id}>
                <td>{l.employee_name}</td>
                <td>{LEAVE_TYPE_LABELS[l.type] || l.type}</td>
                <td>{fmtDate(l.start_date)}</td>
                <td>{fmtDate(l.end_date)}</td>
                <td>{l.reason || '—'}</td>
                <td>
                  <span className={`status-badge ${s.cls}`}>{s.label}</span>
                </td>
                <td className="actions-cell">
                  {confirmId === l.id ? (
                    <>
                      <button className="danger" onClick={() => remove(l.id)}>
                        Yes, remove
                      </button>
                      <button onClick={() => setConfirmId(null)}>Keep</button>
                    </>
                  ) : (
                    <button className="danger" onClick={() => setConfirmId(l.id)}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="empty-row">
                No leave recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Layout>
  );
}
