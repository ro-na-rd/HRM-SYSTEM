import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Layout from '../components/Layout';

function money(n, currency) {
  if (n == null) return '—';
  return `${Number(n).toLocaleString()} ${currency || 'RWF'}`;
}

function Stat({ value, label, sub }) {
  return (
    <div className="stat-card">
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub != null && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

export default function Reports() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports/summary').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <Layout title="Reports">
        <div className="error-banner">{error}</div>
      </Layout>
    );
  }
  if (!data) {
    return (
      <Layout title="Reports">
        <p>Loading…</p>
      </Layout>
    );
  }

  const { headcount, by_department, leave, payroll, performance, attendance, documents, users } = data;
  const ackRate =
    performance.published > 0 ? Math.round((performance.acknowledged / performance.published) * 100) : null;

  return (
    <Layout title="Reports">
      <div className="page-header">
        <h2>Company Report</h2>
        <a className="button-like" href="/api/reports/employees.csv">
          Download roster (CSV)
        </a>
      </div>
      <p className="hint">Generated {new Date(data.generated_at).toLocaleString()}</p>

      <h3>Headcount</h3>
      <div className="stat-grid">
        <Stat value={headcount.total} label="Total employees" />
        <Stat value={headcount.active || 0} label="Active" />
        <Stat value={headcount.inactive || 0} label="Inactive" />
        <Stat value={by_department.length} label="Departments" />
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Department</th>
            <th>Active employees</th>
          </tr>
        </thead>
        <tbody>
          {by_department.map((d) => (
            <tr key={d.department}>
              <td>{d.department}</td>
              <td>{d.count}</td>
            </tr>
          ))}
          {by_department.length === 0 && (
            <tr>
              <td colSpan={2} className="empty-row">
                No active employees.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Leave</h3>
      <div className="stat-grid">
        <Stat value={leave.pending || 0} label="Pending requests" />
        <Stat value={leave.approved || 0} label="Approved" />
        <Stat value={leave.rejected || 0} label="Rejected" />
        <Stat value={leave.total || 0} label="Total requests" />
      </div>

      <h3>Payroll</h3>
      <div className="stat-grid">
        <Stat
          value={money(payroll.monthly_total, payroll.currency)}
          label="Monthly salary total"
          sub={`${payroll.with_salary} employee${payroll.with_salary === 1 ? '' : 's'} with a salary set`}
        />
        <Stat value={payroll.latest_month || '—'} label="Latest payslip month" />
        <Stat
          value={money(payroll.latest_payslips.net, payroll.currency)}
          label="Net paid that month"
          sub={`${payroll.latest_payslips.count} payslip${payroll.latest_payslips.count === 1 ? '' : 's'}`}
        />
      </div>

      <h3>Performance</h3>
      <div className="stat-grid">
        <Stat value={performance.published || 0} label="Published reviews" />
        <Stat value={performance.draft || 0} label="Drafts" />
        <Stat value={performance.avg_rating ?? '—'} label="Average rating" sub="out of 5" />
        <Stat value={ackRate == null ? '—' : `${ackRate}%`} label="Acknowledged" sub={`${performance.acknowledged || 0} of ${performance.published || 0}`} />
      </div>

      <h3>Attendance — today</h3>
      <div className="stat-grid">
        <Stat value={attendance.today.present || 0} label="Present / remote" />
        <Stat value={attendance.today.on_leave || 0} label="On leave" />
        <Stat value={attendance.today.absent || 0} label="Absent" />
        <Stat value={attendance.month.records || 0} label="Records this month" />
      </div>

      <h3>Other</h3>
      <div className="stat-grid">
        <Stat value={documents.total} label="Documents on file" />
        <Stat value={users.total} label="User accounts" sub={`${users.admin || 0} admin · ${users.hr || 0} HR · ${users.employee || 0} employee`} />
      </div>
    </Layout>
  );
}
