import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import Layout from '../components/Layout';
import { STATUS_LABELS, STATUS_OPTIONS, todayLocal, fmtTime, hoursWorked } from '../lib/attendance';

function StatusBadge({ status }) {
  const cls = status === 'present' || status === 'remote' ? 'active' : status === 'absent' ? 'inactive' : 'pending';
  return <span className={`status-badge status-${cls}`}>{STATUS_LABELS[status] || status}</span>;
}

const EMPTY = { employee_id: '', work_date: todayLocal(), status: 'present', clock_in: '', clock_out: '', note: '' };

export default function Attendance() {
  const [date, setDate] = useState(todayLocal());
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  function load() {
    api.get(`/attendance?date=${date}`).then(setRows).catch((e) => setError(e.message));
  }

  useEffect(load, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.get('/employees').then(setEmployees).catch(() => setEmployees([]));
  }, []);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, leave: 0, other: 0 };
    rows.forEach((r) => {
      if (r.status === 'present' || r.status === 'remote' || r.status === 'half_day') c.present += 1;
      else if (r.status === 'absent') c.absent += 1;
      else if (r.status === 'leave') c.leave += 1;
      else c.other += 1;
    });
    return c;
  }, [rows]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/attendance', form);
      setForm({ ...EMPTY, work_date: form.work_date });
      if (form.work_date === date) load();
      else setDate(form.work_date);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this attendance record?')) return;
    setError('');
    try {
      await api.delete(`/attendance/${id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function editRow(r) {
    setForm({
      employee_id: String(r.employee_id),
      work_date: r.work_date,
      status: r.status,
      clock_in: r.clock_in ? new Date(r.clock_in).toTimeString().slice(0, 5) : '',
      clock_out: r.clock_out ? new Date(r.clock_out).toTimeString().slice(0, 5) : '',
      note: r.note || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <Layout title="Attendance">
      {error && <div className="error-banner">{error}</div>}

      <form className="card form-grid" onSubmit={submit}>
        <div className="page-header" style={{ gridColumn: '1 / -1' }}>
          <h3>Record / correct attendance</h3>
        </div>
        <label>
          Employee
          <select
            required
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
          Date
          <input
            type="date"
            required
            value={form.work_date}
            onChange={(e) => setForm({ ...form, work_date: e.target.value })}
          />
        </label>
        <label>
          Status
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Clock in
          <input type="time" value={form.clock_in} onChange={(e) => setForm({ ...form, clock_in: e.target.value })} />
        </label>
        <label>
          Clock out
          <input
            type="time"
            value={form.clock_out}
            onChange={(e) => setForm({ ...form, clock_out: e.target.value })}
          />
        </label>
        <label>
          Note
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save record'}
        </button>
      </form>

      <div className="page-header">
        <h3>Register</h3>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, fontWeight: 500 }}>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div>
            <div className="stat-value">{counts.present}</div>
            <div className="stat-label">Present / remote</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-value">{counts.leave}</div>
            <div className="stat-label">On leave</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-value">{counts.absent}</div>
            <div className="stat-label">Absent</div>
          </div>
        </div>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Department</th>
            <th>Status</th>
            <th>Clock in</th>
            <th>Clock out</th>
            <th>Hours</th>
            <th>Note</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.employee_name}</td>
              <td>{r.department || '—'}</td>
              <td>
                <StatusBadge status={r.status} />
              </td>
              <td>{fmtTime(r.clock_in)}</td>
              <td>{fmtTime(r.clock_out)}</td>
              <td>{hoursWorked(r.clock_in, r.clock_out) || '—'}</td>
              <td>{r.note || '—'}</td>
              <td className="actions-cell">
                <button onClick={() => editRow(r)}>Edit</button>
                <button className="danger" onClick={() => remove(r.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="empty-row">
                No attendance recorded for {date}.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Layout>
  );
}
