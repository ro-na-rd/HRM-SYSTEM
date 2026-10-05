import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import Layout from '../../components/Layout';
import { STATUS_LABELS, STATUS_OPTIONS, todayLocal, fmtTime, hoursWorked } from '../../lib/attendance';
import { TEAM_START_DATE, fmtDate } from '../../lib/team';

function StatusBadge({ status }) {
  const cls = status === 'present' || status === 'remote' ? 'active' : status === 'absent' ? 'inactive' : 'pending';
  return <span className={`status-badge status-${cls}`}>{STATUS_LABELS[status] || status}</span>;
}

function toHHMM(iso) {
  return iso ? new Date(iso).toTimeString().slice(0, 5) : '';
}

export default function ManagerAttendance() {
  const initialDate = todayLocal() < TEAM_START_DATE ? TEAM_START_DATE : todayLocal();
  const [date, setDate] = useState(initialDate);
  const [rows, setRows] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const empty = { employee_id: '', status: 'present', clock_in: '', clock_out: '', note: '' };
  const [form, setForm] = useState(empty);
  const [confirmDay, setConfirmDay] = useState(false);

  function load(d = date) {
    api
      .get(`/manager/attendance?date=${d}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    setConfirmDay(false);
    load(date);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api
      .get('/manager/employees')
      .then((list) => setMembers(list.filter((m) => m.active)))
      .catch((e) => setError(e.message));
  }, []);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, leave: 0 };
    rows.forEach((r) => {
      if (r.status === 'absent') c.absent += 1;
      else if (r.status === 'leave') c.leave += 1;
      else c.present += 1;
    });
    return c;
  }, [rows]);

  const notRecorded = members.filter((m) => !rows.some((r) => r.employee_id === m.id));

  async function save(payload) {
    setBusy(true);
    setError('');
    try {
      await api.post('/manager/attendance', { ...payload, work_date: date });
      load();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (await save(form)) setForm(empty);
  }

  function editRow(r) {
    setForm({
      employee_id: String(r.employee_id),
      status: r.status,
      clock_in: toHHMM(r.clock_in),
      clock_out: toHHMM(r.clock_out),
      note: r.note || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function removeRow(id) {
    setError('');
    try {
      await api.delete(`/manager/attendance/${id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeDay() {
    setError('');
    try {
      await api.delete(`/manager/attendance?date=${date}`);
      setConfirmDay(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout title="Team Attendance">
      <div className="page-header">
        <h2>Attendance · {fmtDate(date)}</h2>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, fontWeight: 500 }}>
          Date
          <input
            type="date"
            min={TEAM_START_DATE}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value < TEAM_START_DATE ? TEAM_START_DATE : e.target.value)}
          />
        </label>
      </div>
      <p className="hint">Records start on {fmtDate(TEAM_START_DATE)}.</p>

      {error && <div className="error-banner">{error}</div>}

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
        <div className="stat-card">
          <div>
            <div className="stat-value">{notRecorded.length}</div>
            <div className="stat-label">Not recorded yet</div>
          </div>
        </div>
      </div>

      {notRecorded.length > 0 && (
        <div className="card">
          <div className="page-header">
            <h3>Not recorded for {fmtDate(date)}</h3>
          </div>
          <table className="data-table">
            <tbody>
              {notRecorded.map((m) => (
                <tr key={m.id}>
                  <td>{m.full_name}</td>
                  <td>{m.position || '—'}</td>
                  <td className="actions-cell">
                    <button disabled={busy} onClick={() => save({ employee_id: m.id, status: 'present' })}>
                      Present
                    </button>
                    <button disabled={busy} className="danger" onClick={() => save({ employee_id: m.id, status: 'absent' })}>
                      Absent
                    </button>
                    <button disabled={busy} onClick={() => save({ employee_id: m.id, status: 'leave' })}>
                      On leave
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="card form-grid" onSubmit={submit}>
        <div className="page-header" style={{ gridColumn: '1 / -1' }}>
          <h3>Record with times or a note</h3>
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
          Arrived
          <input type="time" value={form.clock_in} onChange={(e) => setForm({ ...form, clock_in: e.target.value })} />
        </label>
        <label>
          Left
          <input type="time" value={form.clock_out} onChange={(e) => setForm({ ...form, clock_out: e.target.value })} />
        </label>
        <label>
          Note
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : `Save for ${fmtDate(date)}`}
        </button>
      </form>

      <div className="page-header">
        <h3>Register for {fmtDate(date)}</h3>
        {rows.length > 0 &&
          (confirmDay ? (
            <div className="actions-cell">
              <span className="hint">
                Remove all {rows.length} record{rows.length === 1 ? '' : 's'} for {fmtDate(date)}?
              </span>
              <button className="danger" onClick={removeDay}>
                Yes, remove
              </button>
              <button onClick={() => setConfirmDay(false)}>Keep</button>
            </div>
          ) : (
            <button className="danger" onClick={() => setConfirmDay(true)}>
              Remove this day’s register
            </button>
          ))}
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Team member</th>
            <th>Status</th>
            <th>Arrived</th>
            <th>Left</th>
            <th>Hours</th>
            <th>Note</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.employee_name}</td>
              <td>
                <StatusBadge status={r.status} />
              </td>
              <td>{fmtTime(r.clock_in)}</td>
              <td>{fmtTime(r.clock_out)}</td>
              <td>{hoursWorked(r.clock_in, r.clock_out) || '—'}</td>
              <td>{r.note || '—'}</td>
              <td className="actions-cell">
                <button onClick={() => editRow(r)}>Edit</button>
                <button className="danger" onClick={() => removeRow(r.id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="empty-row">
                Nothing recorded for {fmtDate(date)} yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Layout>
  );
}
