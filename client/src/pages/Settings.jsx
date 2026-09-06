import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Layout from '../components/Layout';

function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'hr' });

  function load() {
    api.get('/users').then(setUsers).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/users', form);
      setForm({ name: '', email: '', password: '', role: 'hr' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(user) {
    try {
      await api.patch(`/users/${user.id}`, { active: !user.active });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="page-header">
        <h3>User Accounts</h3>
        <button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Add Account'}</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card form-grid" onSubmit={handleCreate}>
          <label>
            Name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Email
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <label>
            Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="hr">HR</option>
              <option value="admin">Admin</option>
              <option value="employee">Employee</option>
            </select>
          </label>
          <button type="submit">Create account</button>
        </form>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{u.active ? 'Active' : 'Disabled'}</td>
              <td>
                <button onClick={() => toggleActive(u)}>{u.active ? 'Disable' : 'Enable'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function AuditLogPanel() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/audit-log').then(setRows).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <div className="page-header">
        <h3>Audit Log</h3>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <table className="data-table">
        <thead>
          <tr>
            <th>When</th>
            <th>User</th>
            <th>Action</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.created_at).toLocaleString()}</td>
              <td>{r.user_name ? `${r.user_name} (${r.user_email})` : 'Unknown'}</td>
              <td>{r.action}</td>
              <td>{r.target_type ? `${r.target_type} #${r.target_id}` : '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="empty-row">
                No activity recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('users');

  return (
    <Layout title="Settings">
      <div className="tab-row">
        <button className={`tab-btn ${tab === 'users' ? 'tab-btn-active' : ''}`} onClick={() => setTab('users')}>
          User Accounts
        </button>
        <button className={`tab-btn ${tab === 'audit' ? 'tab-btn-active' : ''}`} onClick={() => setTab('audit')}>
          Audit Log
        </button>
      </div>

      {tab === 'users' ? <UsersPanel /> : <AuditLogPanel />}
    </Layout>
  );
}
