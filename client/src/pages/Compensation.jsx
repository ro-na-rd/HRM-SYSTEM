import { useEffect, useState } from 'react';
import { api, viewPayslipFile } from '../api/client';
import Layout from '../components/Layout';

const FREQ_LABELS = { monthly: 'Monthly', biweekly: 'Every 2 weeks', weekly: 'Weekly' };

function money(amount, currency) {
  if (amount == null || amount === '') return '—';
  return `${Number(amount).toLocaleString()} ${currency || 'RWF'}`;
}

function SalariesPanel() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  function load() {
    api.get('/payroll/compensation').then(setRows).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  function startEdit(row) {
    setError('');
    setEditId(row.employee_id);
    setDraft({
      currency: row.currency || 'RWF',
      gross_salary: row.gross_salary ?? '',
      pay_frequency: row.pay_frequency || 'monthly',
      effective_date: row.effective_date || '',
      note: row.note || '',
    });
  }

  async function save(employeeId) {
    setSaving(true);
    setError('');
    try {
      await api.patch(`/payroll/compensation/${employeeId}`, {
        ...draft,
        gross_salary: draft.gross_salary === '' ? null : Number(draft.gross_salary),
      });
      setEditId(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h3>Salaries</h3>
        <span className="hint">The employee sees this on their Payslips page.</span>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <table className="data-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Department</th>
            <th>Gross salary</th>
            <th>Frequency</th>
            <th>Effective from</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.employee_id}>
              <td>{r.full_name}</td>
              <td>{r.department || '—'}</td>
              {editId === r.employee_id ? (
                <>
                  <td className="actions-cell">
                    <input
                      style={{ width: 110 }}
                      inputMode="decimal"
                      placeholder="0"
                      value={draft.gross_salary}
                      onChange={(e) => setDraft({ ...draft, gross_salary: e.target.value })}
                    />
                    <input
                      style={{ width: 56 }}
                      value={draft.currency}
                      onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      value={draft.pay_frequency}
                      onChange={(e) => setDraft({ ...draft, pay_frequency: e.target.value })}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="biweekly">Every 2 weeks</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="date"
                      value={draft.effective_date}
                      onChange={(e) => setDraft({ ...draft, effective_date: e.target.value })}
                    />
                  </td>
                  <td className="actions-cell">
                    <button disabled={saving} onClick={() => save(r.employee_id)}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button type="button" className="danger" onClick={() => setEditId(null)}>
                      Cancel
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td>{money(r.gross_salary, r.currency)}</td>
                  <td>{r.gross_salary == null ? '—' : FREQ_LABELS[r.pay_frequency] || '—'}</td>
                  <td>{r.effective_date || '—'}</td>
                  <td className="actions-cell">
                    <button onClick={() => startEdit(r)}>{r.gross_salary == null ? 'Set salary' : 'Edit'}</button>
                  </td>
                </>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="empty-row">
                No active employees.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

const EMPTY_PAYSLIP = {
  employee_id: '',
  period_month: '',
  currency: 'RWF',
  gross_pay: '',
  deductions: '',
  net_pay: '',
  deductions_note: '',
  note: '',
};

function PayslipsPanel() {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_PAYSLIP);
  const [file, setFile] = useState(null);

  function load() {
    api.get('/payroll/payslips').then(setRows).catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
    api.get('/employees').then(setEmployees).catch(() => setEmployees([]));
  }, []);

  const autoNet =
    form.gross_pay !== ''
      ? Math.max(0, Number(form.gross_pay || 0) - Number(form.deductions || 0))
      : '';

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const payload = { ...form, net_pay: form.net_pay || autoNet };
      const fd = new FormData();
      Object.entries(payload).forEach(([k, v]) => fd.append(k, v ?? ''));
      if (file) fd.append('file', file);
      await api.postForm('/payroll/payslips', fd);
      setForm(EMPTY_PAYSLIP);
      setFile(null);
      e.target.reset();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this payslip permanently?')) return;
    setError('');
    try {
      await api.delete(`/payroll/payslips/${id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="page-header">
        <h3>Payslips</h3>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <form className="card form-grid" onSubmit={handleSubmit}>
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
          Pay period
          <input
            type="month"
            required
            value={form.period_month}
            onChange={(e) => setForm({ ...form, period_month: e.target.value })}
          />
        </label>
        <label>
          Currency
          <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
        </label>
        <label>
          Gross pay
          <input
            required
            inputMode="decimal"
            value={form.gross_pay}
            onChange={(e) => setForm({ ...form, gross_pay: e.target.value })}
          />
        </label>
        <label>
          Deductions
          <input
            inputMode="decimal"
            placeholder="0"
            value={form.deductions}
            onChange={(e) => setForm({ ...form, deductions: e.target.value })}
          />
        </label>
        <label>
          Net pay
          <input
            inputMode="decimal"
            placeholder={autoNet === '' ? 'auto (gross − deductions)' : String(autoNet)}
            value={form.net_pay}
            onChange={(e) => setForm({ ...form, net_pay: e.target.value })}
          />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Deductions breakdown (optional)
          <input
            placeholder="e.g. PAYE 30,000; RSSB 6,000"
            value={form.deductions_note}
            onChange={(e) => setForm({ ...form, deductions_note: e.target.value })}
          />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Note (optional)
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Attach payslip file (optional)
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFile(e.target.files[0] || null)}
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Add payslip'}
        </button>
      </form>

      <table className="data-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Period</th>
            <th>Gross</th>
            <th>Deductions</th>
            <th>Net pay</th>
            <th>File</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.employee_name}</td>
              <td>{p.period_month}</td>
              <td>{money(p.gross_pay, p.currency)}</td>
              <td>
                {money(p.deductions, p.currency)}
                {p.deductions_note && <div className="hint">{p.deductions_note}</div>}
              </td>
              <td>{money(p.net_pay, p.currency)}</td>
              <td>
                {p.file_original_filename ? (
                  <button onClick={() => viewPayslipFile(p.id).catch((e) => setError(e.message))}>View</button>
                ) : (
                  '—'
                )}
              </td>
              <td className="actions-cell">
                <button className="danger" onClick={() => remove(p.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="empty-row">
                No payslips yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

export default function Compensation() {
  const [tab, setTab] = useState('salaries');

  return (
    <Layout title="Compensation / Payroll">
      <div className="tab-row">
        <button
          className={`tab-btn ${tab === 'salaries' ? 'tab-btn-active' : ''}`}
          onClick={() => setTab('salaries')}
        >
          Salaries
        </button>
        <button
          className={`tab-btn ${tab === 'payslips' ? 'tab-btn-active' : ''}`}
          onClick={() => setTab('payslips')}
        >
          Payslips
        </button>
      </div>

      {tab === 'salaries' ? <SalariesPanel /> : <PayslipsPanel />}
    </Layout>
  );
}
