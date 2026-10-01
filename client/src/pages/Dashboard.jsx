import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../AuthContext';
import { DonutChart, TrendChart } from '../components/Charts';
import Avatar from '../components/Avatar';
import { timeAgo } from '../utils/timeAgo';
import { EmployeesIcon, OrganizationIcon, DocumentsIcon, SettingsIcon } from '../components/Icons';

const CATEGORY_META = [
  { key: 'contract', label: 'Contract', color: '#1656c9' },
  { key: 'id_document', label: 'ID Document', color: '#16a34a' },
  { key: 'letter', label: 'Letter', color: '#d97706' },
  { key: 'certificate', label: 'Certificate', color: '#7c3aed' },
  { key: 'other', label: 'Other', color: '#64748b' },
];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Dashboard() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [users, setUsers] = useState(null);
  const [auditRows, setAuditRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/employees').then(setEmployees).catch((e) => setError(e.message));
    api.get('/documents').then(setDocuments).catch((e) => setError(e.message));
    if (user?.role === 'admin') {
      api.get('/users').then(setUsers).catch(() => {});
      api.get('/audit-log').then((rows) => setAuditRows(rows.slice(0, 6))).catch(() => {});
    }
  }, [user]);

  const departmentCount = useMemo(
    () => new Set(employees.map((e) => e.department).filter(Boolean)).size,
    [employees]
  );

  const docsThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return documents.filter((d) => new Date(d.created_at).getTime() >= weekAgo).length;
  }, [documents]);

  const donutData = useMemo(
    () =>
      CATEGORY_META.map((c) => ({
        ...c,
        value: documents.filter((d) => d.category === c.key).length,
      })),
    [documents]
  );

  const hireTrend = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth(), label: MONTH_LABELS[d.getMonth()] });
    }
    return months.map((m) => ({
      label: m.label,
      value: employees.filter((e) => {
        const ref = new Date(e.hire_date || e.created_at);
        return ref.getFullYear() === m.year && ref.getMonth() === m.month;
      }).length,
    }));
  }, [employees]);

  const recentHires = useMemo(
    () =>
      [...employees]
        .sort((a, b) => new Date(b.hire_date || b.created_at) - new Date(a.hire_date || a.created_at))
        .slice(0, 5),
    [employees]
  );

  const totalDocsInDonut = donutData.reduce((s, d) => s + d.value, 0);
  const firstName = user?.name?.split(' ')[0] || user?.name;

  return (
    <Layout title={`Welcome, ${firstName}! \u{1F44B}`}>
      {error && <div className="error-banner">{error}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon stat-icon-blue">
            <EmployeesIcon size={22} />
          </span>
          <div>
            <div className="stat-value">{employees.length}</div>
            <div className="stat-label">Total Employees</div>
            <div className="stat-sub">{departmentCount} department{departmentCount === 1 ? '' : 's'}</div>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-green">
            <OrganizationIcon size={22} />
          </span>
          <div>
            <div className="stat-value">{departmentCount}</div>
            <div className="stat-label">Departments</div>
            <div className="stat-sub">across the organization</div>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-amber">
            <DocumentsIcon size={22} />
          </span>
          <div>
            <div className="stat-value">{documents.length}</div>
            <div className="stat-label">Documents on File</div>
            <div className="stat-sub">{docsThisWeek} uploaded this week</div>
          </div>
        </div>
        {user?.role === 'admin' && (
          <div className="stat-card">
            <span className="stat-icon stat-icon-purple">
              <SettingsIcon size={22} />
            </span>
            <div>
              <div className="stat-value">{users ? users.length : '—'}</div>
              <div className="stat-label">User Accounts</div>
              <div className="stat-sub">
                {users ? users.filter((u) => u.role === 'admin').length : '—'} admin
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="dashboard-columns">
        <div className="card chart-card">
          <div className="page-header">
            <h3>Documents by Category</h3>
          </div>
          <div className="donut-row">
            <div className="donut-wrap">
              <DonutChart data={donutData} />
              <div className="donut-center">
                <strong>{totalDocsInDonut}</strong>
                <span>Total</span>
              </div>
            </div>
            <ul className="chart-legend">
              {donutData.map((d) => (
                <li key={d.key}>
                  <span className="legend-dot" style={{ background: d.color }} />
                  {d.label}
                  <em>{d.value}</em>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card chart-card">
          <div className="page-header">
            <h3>New Hires Trend</h3>
            <span className="hint">Last 6 months</span>
          </div>
          <div className="trend-total">{employees.length}</div>
          <div className="hint" style={{ marginBottom: 10 }}>
            Total employees on record
          </div>
          <TrendChart points={hireTrend} />
          <div className="trend-labels">
            {hireTrend.map((p) => (
              <span key={p.label}>{p.label}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-columns">
        <div className="card">
          <div className="page-header">
            <h3>{user?.role === 'admin' ? 'Recent Activity' : 'Recent Documents'}</h3>
            <Link to={user?.role === 'admin' ? '/settings' : '/documents'}>View all</Link>
          </div>
          {user?.role === 'admin' ? (
            <ul className="activity-list">
              {(auditRows || []).map((r) => (
                <li key={r.id}>
                  <span className="activity-dot" />
                  <span className="activity-text">{r.action.replaceAll('_', ' ')}</span>
                  <em>{timeAgo(r.created_at)}</em>
                </li>
              ))}
              {auditRows && auditRows.length === 0 && <li className="empty-row">No activity recorded yet.</li>}
            </ul>
          ) : (
            <ul className="activity-list">
              {documents.slice(0, 6).map((d) => (
                <li key={d.id}>
                  <span className="activity-dot" />
                  <span className="activity-text">
                    {d.original_filename} <em style={{ textTransform: 'none' }}>{d.employee_name ? `for ${d.employee_name}` : 'company document'}</em>
                  </span>
                  <em>{timeAgo(d.created_at)}</em>
                </li>
              ))}
              {documents.length === 0 && <li className="empty-row">No documents uploaded yet.</li>}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="page-header">
            <h3>Recently Hired</h3>
            <Link to="/employees">View all</Link>
          </div>
          <ul className="people-list">
            {recentHires.map((e) => (
              <li key={e.id}>
                <Avatar id={e.id} name={e.full_name} hasPhoto={e.has_photo} size={30} />
                <div className="people-list-info">
                  <strong>{e.full_name}</strong>
                  <span>{e.position || e.department || '—'}</span>
                </div>
                <em>{e.hire_date || new Date(e.created_at).toLocaleDateString()}</em>
              </li>
            ))}
            {recentHires.length === 0 && <li className="empty-row">No employees added yet.</li>}
          </ul>
        </div>
      </div>
    </Layout>
  );
}
