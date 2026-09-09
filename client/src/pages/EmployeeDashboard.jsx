import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../AuthContext';
import { timeAgo } from '../utils/timeAgo';
import { LeaveIcon, DocumentsIcon, MailIcon } from '../components/Icons';

const LEAVE_TYPE_LABELS = { annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid', other: 'Other' };

function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{status[0].toUpperCase() + status.slice(1)}</span>;
}

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [employee, setEmployee] = useState(null);
  const [leaveRows, setLeaveRows] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [letters, setLetters] = useState([]);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/employees')
      .then((rows) => {
        const own = rows[0] || null;
        setEmployee(own);
        if (own) {
          api.get(`/documents/employee/${own.id}`).then(setDocuments).catch(() => {});
        }
      })
      .catch((e) => setError(e.message));
    api.get('/leave').then(setLeaveRows).catch(() => {});
    api.get('/letters').then(setLetters).catch(() => {});
    api.get('/audit-log/mine').then(setActivity).catch(() => {});
  }, []);

  const pendingLeave = leaveRows.filter((r) => r.status === 'pending').length;
  const approvedLeave = leaveRows.filter((r) => r.status === 'approved').length;
  const rejectedLeave = leaveRows.filter((r) => r.status === 'rejected').length;

  const firstName = user?.name?.split(' ')[0] || user?.name;

  return (
    <Layout title={`Welcome, ${firstName}! \u{1F44B}`}>
      {error && <div className="error-banner">{error}</div>}

      {!employee && (
        <p className="hint">
          Your login isn’t linked to an employee record yet, so some of this will be empty. Ask your Admin to link
          it in Employees.
        </p>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon stat-icon-blue">
            <LeaveIcon size={22} />
          </span>
          <div>
            <div className="stat-value">{pendingLeave}</div>
            <div className="stat-label">Pending Leave Requests</div>
            <div className="stat-sub">
              {approvedLeave} approved, {rejectedLeave} rejected
            </div>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-amber">
            <DocumentsIcon size={22} />
          </span>
          <div>
            <div className="stat-value">{documents.length}</div>
            <div className="stat-label">My Documents</div>
            <div className="stat-sub">on file</div>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-purple">
            <MailIcon size={22} />
          </span>
          <div>
            <div className="stat-value">{letters.filter((l) => l.status === 'pending').length}</div>
            <div className="stat-label">Letters Awaiting Reply</div>
            <div className="stat-sub">{letters.length} total sent</div>
          </div>
        </div>
      </div>

      <div className="dashboard-columns">
        <div className="card">
          <div className="page-header">
            <h3>My Leave</h3>
            <Link to="/profile/leave">Request leave</Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Dates</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leaveRows.slice(0, 5).map((r) => (
                <tr key={r.id}>
                  <td>{LEAVE_TYPE_LABELS[r.type] || r.type}</td>
                  <td>
                    {r.start_date} → {r.end_date}
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
              {leaveRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="empty-row">
                    No leave requests yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="page-header">
            <h3>Recent Documents</h3>
            <Link to="/profile/documents">View all</Link>
          </div>
          <ul className="activity-list">
            {documents.slice(0, 5).map((d) => (
              <li key={d.id}>
                <span className="activity-dot" />
                <span className="activity-text">{d.original_filename}</span>
                <em>{timeAgo(d.created_at)}</em>
              </li>
            ))}
            {documents.length === 0 && <li className="empty-row">No documents yet.</li>}
          </ul>
        </div>
      </div>

      <div className="dashboard-columns">
        <div className="card">
          <div className="page-header">
            <h3>Recent Letters</h3>
            <Link to="/profile/letters">View all</Link>
          </div>
          <ul className="activity-list">
            {letters.slice(0, 5).map((l) => (
              <li key={l.id}>
                <span className="activity-dot" />
                <span className="activity-text">
                  {l.subject} <StatusBadge status={l.status} />
                </span>
                <em>{timeAgo(l.created_at)}</em>
              </li>
            ))}
            {letters.length === 0 && <li className="empty-row">No letters yet.</li>}
          </ul>
        </div>

        <div className="card">
          <div className="page-header">
            <h3>Recent Activity</h3>
          </div>
          <ul className="activity-list">
            {activity.slice(0, 6).map((a) => (
              <li key={a.id}>
                <span className="activity-dot" />
                <span className="activity-text">{a.action.replaceAll('_', ' ')}</span>
                <em>{timeAgo(a.created_at)}</em>
              </li>
            ))}
            {activity.length === 0 && <li className="empty-row">No activity yet.</li>}
          </ul>
        </div>
      </div>
    </Layout>
  );
}
