import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import SelectMenu from '../components/SelectMenu';
import { useEmployeeMeta, departmentOptions, positionOptions } from '../lib/employeeMeta';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: '', department: '', position: '', hire_date: '', phone: '' });
  const meta = useEmployeeMeta();

  function load() {
    api
      .get('/employees')
      .then(setEmployees)
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/employees', form);
      setForm({ full_name: '', department: '', position: '', hire_date: '', phone: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <h2>Employees</h2>
        <button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Add Employee'}</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card form-grid" onSubmit={handleCreate}>
          <label>
            Full name
            <input
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </label>

          <SelectMenu
            label="Department"
            options={departmentOptions(meta)}
            value={form.department}
            onChange={(v) => setForm({ ...form, department: v, position: '' })}
            placeholder="Select department"
            otherPlaceholder="Type a department"
          />
          <SelectMenu
            label="Position"
            options={positionOptions(form.department, meta)}
            value={form.position}
            onChange={(v) => setForm({ ...form, position: v })}
            placeholder="Select position"
            otherPlaceholder="Type a position"
            disabled={!form.department}
            disabledText="Select department first"
          />

          <label>
            Hire date
            <input
              type="date"
              value={form.hire_date}
              onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
            />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <button type="submit">Save employee</button>
        </form>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th></th>
            <th>Name</th>
            <th>Department</th>
            <th>Position</th>
            <th>Hired</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <tr key={emp.id}>
              <td>
                <Avatar id={emp.id} name={emp.full_name} hasPhoto={emp.has_photo} size={30} />
              </td>
              <td>{emp.full_name}</td>
              <td>{emp.department || '—'}</td>
              <td>{emp.position || '—'}</td>
              <td>{emp.hire_date || '—'}</td>
              <td>
                <span className={`status-badge ${emp.active ? 'status-active' : 'status-inactive'}`}>
                  {emp.active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <Link to={`/employees/${emp.id}`}>View / Documents</Link>
              </td>
            </tr>
          ))}
          {employees.length === 0 && (
            <tr>
              <td colSpan={7} className="empty-row">
                No employees yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Layout>
  );
}
