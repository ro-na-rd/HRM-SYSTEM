import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../AuthContext';
import Layout from '../../components/Layout';
import { EmployeesIcon, AttendanceIcon, LeaveIcon } from '../../components/Icons';
import { todayLocal } from '../../lib/attendance';
import { TEAM_START_DATE, LEAVE_TYPE_LABELS, fmtDate } from '../../lib/team';

export default function ManagerDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const today = todayLocal();

  useEffect(() => {
    api
      .get(`/manager/summary?date=${today}`)
      .then(setSummary)
      .catch((e) => setError(e.message));
  }, [today]);

  const active = summary?.team.active ?? 0;
  const day = summary?.day;
  const notRecorded = day ? Math.max(active - day.recorded, 0) : 0;

  return (
    <Layout title="Dashboard">
      <div className="page-header">
        <div>
          <h2>Welcome, {user?.name?.split(' ')[0] || 'Manager'}</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Your team register · today is {fmtDate(today)}
          </p>
        </div>
        <span className="status-badge status-approved">Started {fmtDate(summary?.start_date || TEAM_START_DATE)}</span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon stat-icon-blue">
            <EmployeesIcon size={22} />
          </span>
          <div>
            <div className="stat-value">{summary ? active : '—'}</div>
            <div className="stat-label">Team members</div>
            <div className="stat-sub">active in your team</div>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-green">
            <AttendanceIcon size={22} />
          </span>
          <div>
            <div className="stat-value">{day ? day.present : '—'}</div>
            <div className="stat-label">Present today</div>
            <div className="stat-sub">includes remote and half day</div>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-amber">
            <LeaveIcon size={22} />
          </span>
          <div>
            <div className="stat-value">{day ? day.on_leave : '—'}</div>
            <div className="stat-label">On leave today</div>
            <div className="stat-sub">{day ? `${day.absent} absent` : ''}</div>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-purple">
            <AttendanceIcon size={22} />
          </span>
          <div>
            <div className="stat-value">{summary ? notRecorded : '—'}</div>
            <div className="stat-label">Not recorded yet</div>
            <div className="stat-sub">
              <Link to="/manager/attendance">Record today’s attendance</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="page-header">
          <h3>On leave today</h3>
          <Link to="/manager/leave">Record leave</Link>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Team member</th>
              <th>Type</th>
              <th>From</th>
              <th>Back after</th>
            </tr>
          </thead>
          <tbody>
            {(summary?.on_leave_now || []).map((l) => (
              <tr key={l.id}>
                <td>{l.employee_name}</td>
                <td>{LEAVE_TYPE_LABELS[l.type] || l.type}</td>
                <td>{fmtDate(l.start_date)}</td>
                <td>{fmtDate(l.end_date)}</td>
              </tr>
            ))}
            {summary && summary.on_leave_now.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-row">
                  Nobody in your team is on leave today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {summary && summary.team.total === 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Start here</h3>
          <p className="hint" style={{ marginBottom: 12 }}>
            Add the people you manage. They don’t need a login. You record their attendance and leave for them.
          </p>
          <Link to="/manager/employees">Add your first team member</Link>
        </div>
      )}
    </Layout>
  );
}
