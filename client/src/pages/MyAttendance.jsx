import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Layout from '../components/Layout';
import { STATUS_LABELS, todayLocal, fmtTime, hoursWorked } from '../lib/attendance';

function StatusBadge({ status }) {
  const cls = status === 'present' || status === 'remote' ? 'active' : status === 'absent' ? 'inactive' : 'pending';
  return <span className={`status-badge status-${cls}`}>{STATUS_LABELS[status] || status}</span>;
}

export default function MyAttendance() {
  const [today, setToday] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const workDate = todayLocal();

  function load() {
    api.get(`/attendance/today?date=${workDate}`).then(setToday).catch((e) => setError(e.message));
    api
      .get('/attendance')
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(path) {
    setBusy(true);
    setError('');
    try {
      await api.post(`/attendance/${path}`, { work_date: workDate });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const clockedIn = today && today.clock_in;
  const clockedOut = today && today.clock_out;

  return (
    <Layout title="Attendance">
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="page-header">
          <h3>Today — {workDate}</h3>
        </div>
        <div className="employee-summary">
          <div>
            <strong>Clock in:</strong> {fmtTime(today?.clock_in)}
          </div>
          <div>
            <strong>Clock out:</strong> {fmtTime(today?.clock_out)}
          </div>
          <div>
            <strong>Hours:</strong> {hoursWorked(today?.clock_in, today?.clock_out) || '—'}
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          {!clockedIn && (
            <button disabled={busy} onClick={() => act('clock-in')}>
              {busy ? 'Saving…' : 'Clock in'}
            </button>
          )}
          {clockedIn && !clockedOut && (
            <button disabled={busy} onClick={() => act('clock-out')}>
              {busy ? 'Saving…' : 'Clock out'}
            </button>
          )}
          {clockedIn && clockedOut && <span className="hint">You're done for today. ✓</span>}
        </div>
      </div>

      <h3>My Attendance History</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Status</th>
            <th>Clock in</th>
            <th>Clock out</th>
            <th>Hours</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.work_date}</td>
              <td>
                <StatusBadge status={r.status} />
              </td>
              <td>{fmtTime(r.clock_in)}</td>
              <td>{fmtTime(r.clock_out)}</td>
              <td>{hoursWorked(r.clock_in, r.clock_out) || '—'}</td>
              <td>{r.note || '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="empty-row">
                {loaded ? 'No attendance recorded yet.' : 'Loading…'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Layout>
  );
}
