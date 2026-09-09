import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Layout from '../components/Layout';

const LEAVE_TYPE_LABELS = {
  annual: 'Annual',
  sick: 'Sick',
  unpaid: 'Unpaid',
  other: 'Other',
};

const DIRECTION_LABELS = {
  request: 'Requested a letter',
  to_hr: 'Message to HR/Admin',
};

function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{status[0].toUpperCase() + status.slice(1)}</span>;
}

function LeaveRequestsPanel() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [noteDraft, setNoteDraft] = useState({});

  function load() {
    api.get('/leave').then(setRows).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function review(id, status) {
    setBusyId(id);
    setError('');
    try {
      await api.patch(`/leave/${id}/status`, { status, review_note: noteDraft[id] || null });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <h3>Leave Requests</h3>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <table className="data-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Type</th>
            <th>Dates</th>
            <th>Reason</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.employee_name}</td>
              <td>{LEAVE_TYPE_LABELS[r.type] || r.type}</td>
              <td>
                {r.start_date} → {r.end_date}
              </td>
              <td>{r.reason || '—'}</td>
              <td>
                <StatusBadge status={r.status} />
                {r.review_note && <div className="hint">{r.review_note}</div>}
              </td>
              <td className="actions-cell">
                {r.status === 'pending' ? (
                  <>
                    <input
                      placeholder="Note (optional)"
                      value={noteDraft[r.id] || ''}
                      onChange={(e) => setNoteDraft({ ...noteDraft, [r.id]: e.target.value })}
                    />
                    <button disabled={busyId === r.id} onClick={() => review(r.id, 'approved')}>
                      Approve
                    </button>
                    <button className="danger" disabled={busyId === r.id} onClick={() => review(r.id, 'rejected')}>
                      Reject
                    </button>
                  </>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="empty-row">
                No leave requests yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function LettersPanel() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [responseDraft, setResponseDraft] = useState({});

  function load() {
    api.get('/letters').then(setRows).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function resolve(id) {
    const response = (responseDraft[id] || '').trim();
    if (!response) {
      setError('Write a response before resolving');
      return;
    }
    setBusyId(id);
    setError('');
    try {
      await api.patch(`/letters/${id}/resolve`, { response });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <h3>Letters</h3>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <table className="data-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Type</th>
            <th>Subject</th>
            <th>Message</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td>{l.employee_name}</td>
              <td>{DIRECTION_LABELS[l.direction] || l.direction}</td>
              <td>{l.subject}</td>
              <td>{l.message || '—'}</td>
              <td>
                <StatusBadge status={l.status} />
                {l.response && <div className="hint">Reply: {l.response}</div>}
              </td>
              <td className="actions-cell">
                {l.status === 'pending' ? (
                  <>
                    <input
                      placeholder="Your response"
                      value={responseDraft[l.id] || ''}
                      onChange={(e) => setResponseDraft({ ...responseDraft, [l.id]: e.target.value })}
                    />
                    <button disabled={busyId === l.id} onClick={() => resolve(l.id)}>
                      Resolve
                    </button>
                  </>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="empty-row">
                No letters yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

export default function LeaveManagement() {
  const [tab, setTab] = useState('leave');

  return (
    <Layout title="Leave Management">
      <div className="tab-row">
        <button className={`tab-btn ${tab === 'leave' ? 'tab-btn-active' : ''}`} onClick={() => setTab('leave')}>
          Leave Requests
        </button>
        <button className={`tab-btn ${tab === 'letters' ? 'tab-btn-active' : ''}`} onClick={() => setTab('letters')}>
          Letters
        </button>
      </div>

      {tab === 'leave' ? <LeaveRequestsPanel /> : <LettersPanel />}
    </Layout>
  );
}
