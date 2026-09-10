import { useEffect, useState } from 'react';
import { api, viewPayslipFile } from '../api/client';
import Layout from '../components/Layout';

const FREQ_LABELS = { monthly: 'Monthly', biweekly: 'Every 2 weeks', weekly: 'Weekly' };

function money(amount, currency) {
  if (amount == null || amount === '') return '—';
  return `${Number(amount).toLocaleString()} ${currency || 'RWF'}`;
}

export default function MyPayslips() {
  const [comp, setComp] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/payroll/compensation/mine').then(setComp).catch(() => {}),
      api.get('/payroll/payslips').then(setRows).catch((e) => setError(e.message)),
    ]).finally(() => setLoaded(true));
  }, []);

  return (
    <Layout title="Payslips">
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="page-header">
          <h3>My Salary</h3>
          <span className="hint">Set by HR — contact them to correct anything here</span>
        </div>
        {comp && comp.gross_salary != null ? (
          <div className="employee-summary">
            <div>
              <strong>Gross salary:</strong> {money(comp.gross_salary, comp.currency)}
            </div>
            <div>
              <strong>Pay frequency:</strong> {FREQ_LABELS[comp.pay_frequency] || '—'}
            </div>
            <div>
              <strong>Effective from:</strong> {comp.effective_date || '—'}
            </div>
          </div>
        ) : (
          <p className="hint">
            {loaded ? 'Your salary details haven’t been added by HR yet.' : 'Loading…'}
          </p>
        )}
      </div>

      <h3>My Payslips</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Period</th>
            <th>Gross</th>
            <th>Deductions</th>
            <th>Net pay</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.period_month}</td>
              <td>{money(p.gross_pay, p.currency)}</td>
              <td>
                {money(p.deductions, p.currency)}
                {p.deductions_note && <div className="hint">{p.deductions_note}</div>}
              </td>
              <td>{money(p.net_pay, p.currency)}</td>
              <td>
                {p.file_original_filename ? (
                  <button onClick={() => viewPayslipFile(p.id).catch((e) => setError(e.message))}>
                    View PDF
                  </button>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="empty-row">
                {loaded ? 'No payslips yet.' : 'Loading…'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Layout>
  );
}
