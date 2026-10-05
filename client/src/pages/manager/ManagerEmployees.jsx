import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import Layout from '../../components/Layout';
import { fmtDate } from '../../lib/team';

const EMPTY = { full_name: '', position: '', phone: '', hire_date: '', notes: '' };

export default function ManagerEmployees() {
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  function load() {
    api
      .get('/manager/employees')
      .then(setMembers)
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  function startAdd() {
    setEditId(null);
    setForm(EMPTY);
    setShowForm((s) => !s || editId !== null);
  }

  function startEdit(m) {
    setEditId(m.id);
    setForm({
      full_name: m.full_name,
      position: m.position || '',
      phone: m.phone || '',
      hire_date: m.hire_date || '',
      notes: m.notes || '',
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editId) await api.patch(`/manager/employees/${editId}`, form);
      else await api.post('/manager/employees', form);
      setForm(EMPTY);
      setEditId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setActive(m, active) {
    setError('');
    try {
      await api.patch(`/manager/employees/${m.id}`, { active });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout title="My Team">
      <div className="page-header">
        <h2>My Team</h2>
        <button onClick={startAdd}>{showForm && !editId ? 'Cancel' : '+ Add team member'}</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card form-grid" onSubmit={submit}>
          <div className="page-header" style={{ gridColumn: '1 / -1' }}>
            <h3>{editId ? 'Edit team member' : 'New team member'}</h3>
          </div>
          <label>
            Full name
            <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </label>
          <label>
            Position / job
            <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label>
            Started on
            <input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Notes
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="actions-cell">
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : editId ? 'Save changes' : 'Add to team'}
            </button>
            {editId && (
              <button type="button" className="danger" onClick={() => (setEditId(null), setShowForm(false))}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <p className="hint">
        Your team members don’t log in. Only you can see them. HR and Admin don’t see your team.
      </p>

      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Position</th>
            <th>Phone</th>
            <th>Started on</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>{m.full_name}</td>
              <td>{m.position || '—'}</td>
              <td>{m.phone || '—'}</td>
              <td>{fmtDate(m.hire_date)}</td>
              <td>
                <span className={`status-badge ${m.active ? 'status-active' : 'status-inactive'}`}>
                  {m.active ? 'Active' : 'Left'}
                </span>
              </td>
              <td className="actions-cell">
                <button onClick={() => startEdit(m)}>Edit</button>
                {m.active ? (
                  <button className="danger" onClick={() => setActive(m, false)}>
                    Mark as left
                  </button>
                ) : (
                  <button onClick={() => setActive(m, true)}>Reactivate</button>
                )}
              </td>
            </tr>
          ))}
          {members.length === 0 && (
            <tr>
              <td colSpan={6} className="empty-row">
                No team members yet. Click “+ Add team member”.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Layout>
  );
}
