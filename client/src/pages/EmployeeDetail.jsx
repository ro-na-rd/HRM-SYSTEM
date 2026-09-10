import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, downloadDocument } from '../api/client';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import { useAuth } from '../AuthContext';
import SelectMenu from '../components/SelectMenu';
import { useEmployeeMeta, departmentOptions, positionOptions } from '../lib/employeeMeta';

const CATEGORY_LABELS = {
  contract: 'Contract',
  id_document: 'ID Document',
  letter: 'Letter',
  certificate: 'Certificate',
  other: 'Other',
};

const EMPTY_FORM = {
  full_name: '',
  department: '',
  position: '',
  hire_date: '',
  phone: '',
  notes: '',
  user_id: '',
  manager_id: '',
};

export default function EmployeeDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const meta = useEmployeeMeta();
  const [employee, setEmployee] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('contract');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [employeeLogins, setEmployeeLogins] = useState(null);
  const [allEmployees, setAllEmployees] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  async function handlePhotoChange(e) {
    const selected = e.target.files[0];
    if (!selected) return;
    setError('');
    setPhotoBusy(true);
    try {
      const formData = new FormData();
      formData.append('photo', selected);
      await api.postForm(`/employees/${id}/photo`, formData);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setPhotoBusy(false);
      e.target.value = '';
    }
  }

  async function handleRemovePhoto() {
    setError('');
    setPhotoBusy(true);
    try {
      await api.delete(`/employees/${id}/photo`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  function load() {
    api.get(`/employees/${id}`).then(setEmployee).catch((e) => setError(e.message));
    api.get(`/documents/employee/${id}`).then(setDocuments).catch((e) => setError(e.message));
  }

  useEffect(load, [id]);

  useEffect(() => {
    if (user?.role === 'admin') {
      api.get('/users').then(setEmployeeLogins).catch(() => setEmployeeLogins([]));
    }
    api.get('/employees').then(setAllEmployees).catch(() => setAllEmployees([]));
  }, [user]);

  function startEditing() {
    setEditForm({
      full_name: employee.full_name || '',
      department: employee.department || '',
      position: employee.position || '',
      hire_date: employee.hire_date || '',
      phone: employee.phone || '',
      notes: employee.notes || '',
      user_id: employee.user_id || '',
      manager_id: employee.manager_id || '',
    });
    setEditing(true);
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    setError('');
    setSavingEdit(true);
    try {
      const payload = {
        full_name: editForm.full_name,
        department: editForm.department || null,
        position: editForm.position || null,
        hire_date: editForm.hire_date || null,
        phone: editForm.phone || null,
        notes: editForm.notes || null,
        manager_id: editForm.manager_id ? Number(editForm.manager_id) : null,
      };
      if (user?.role === 'admin') {
        payload.user_id = editForm.user_id ? Number(editForm.user_id) : null;
      }
      await api.patch(`/employees/${id}`, payload);
      setEditing(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function toggleStatus() {
    const goingActive = !employee.active;
    if (!goingActive && !confirm('Deactivate this employee? You can reactivate them later.')) return;
    setStatusBusy(true);
    setError('');
    try {
      await api.patch(`/employees/${id}/status`, { active: goingActive });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
      await api.postForm(`/documents/employee/${id}`, formData);
      setFile(null);
      e.target.reset();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(doc) {
    try {
      await downloadDocument(doc.id, doc.original_filename);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(docId) {
    if (!confirm('Delete this document permanently?')) return;
    try {
      await api.delete(`/documents/${docId}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!employee) {
    return (
      <Layout title="Employees">
        {error ? <div className="error-banner">{error}</div> : <p>Loading...</p>}
      </Layout>
    );
  }

  const unlinkedOrCurrentLogins = (employeeLogins || []).filter(
    (u) => u.role === 'employee' && u.id !== employee.user_id
  );

  return (
    <Layout title={employee.full_name}>
      <Link to="/employees" className="back-link">
        ← Back to Employees
      </Link>
      <div className="page-header">
        <h2>
          {employee.full_name}{' '}
          <span className={`status-badge ${employee.active ? 'status-active' : 'status-inactive'}`}>
            {employee.active ? 'Active' : 'Inactive'}
          </span>
        </h2>
        <div className="actions-cell">
          {!editing && <button onClick={startEditing}>Edit</button>}
          <button className="danger" onClick={toggleStatus} disabled={statusBusy}>
            {employee.active ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card profile-photo-row">
        <Avatar id={employee.id} name={employee.full_name} hasPhoto={employee.has_photo} size={72} />
        <div className="profile-photo-actions">
          <label className="button-like">
            {photoBusy ? 'Uploading...' : employee.has_photo ? 'Change photo' : 'Add photo'}
            <input type="file" accept="image/*" hidden onChange={handlePhotoChange} disabled={photoBusy} />
          </label>
          {employee.has_photo && (
            <button className="danger" onClick={handleRemovePhoto} disabled={photoBusy}>
              Remove photo
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <form className="card form-grid" onSubmit={handleSaveEdit}>
          <label>
            Full name
            <input
              required
              value={editForm.full_name}
              onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
            />
          </label>
          <SelectMenu
            label="Department"
            options={departmentOptions(meta)}
            value={editForm.department}
            onChange={(v) => setEditForm({ ...editForm, department: v, position: '' })}
            placeholder="Select department"
            otherPlaceholder="Type a department"
          />
          <SelectMenu
            label="Position"
            options={positionOptions(editForm.department, meta)}
            value={editForm.position}
            onChange={(v) => setEditForm({ ...editForm, position: v })}
            placeholder="Select position"
            otherPlaceholder="Type a position"
            disabled={!editForm.department}
            disabledText="Select department first"
          />

          <label>
            Hire date
            <input
              type="date"
              value={editForm.hire_date}
              onChange={(e) => setEditForm({ ...editForm, hire_date: e.target.value })}
            />
          </label>
          <label>
            Phone
            <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
          </label>

          <label>
            Manager
            <select
              value={editForm.manager_id}
              onChange={(e) => setEditForm({ ...editForm, manager_id: e.target.value })}
            >
              <option value="">— None —</option>
              {(allEmployees || [])
                .filter((e) => e.id !== employee.id)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
            </select>
          </label>
          {user?.role === 'admin' && (
            <label>
              Linked login account
              <select
                value={editForm.user_id}
                onChange={(e) => setEditForm({ ...editForm, user_id: e.target.value })}
              >
                <option value="">— None —</option>
                {employee.user_id && (
                  <option value={employee.user_id}>
                    {employee.linked_user_email || 'Currently linked account'}
                  </option>
                )}
                {unlinkedOrCurrentLogins.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label style={{ gridColumn: '1 / -1' }}>
            Notes
            <input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          </label>
          <div className="actions-cell">
            <button type="submit" disabled={savingEdit}>
              {savingEdit ? 'Saving...' : 'Save changes'}
            </button>
            <button type="button" className="danger" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="card employee-summary">
          <div>
            <strong>Department:</strong> {employee.department || '—'}
          </div>
          <div>
            <strong>Position:</strong> {employee.position || '—'}
          </div>
          <div>
            <strong>Hired:</strong> {employee.hire_date || '—'}
          </div>
          <div>
            <strong>Phone:</strong> {employee.phone || '—'}
          </div>
          <div>
            <strong>Manager:</strong> {employee.manager_name || '—'}
          </div>
          {user?.role === 'admin' && (
            <div>
              <strong>Login account:</strong> {employee.linked_user_email || 'Not linked'}
            </div>
          )}
          {employee.notes && (
            <div style={{ gridColumn: '1 / -1' }}>
              <strong>Notes:</strong> {employee.notes}
            </div>
          )}
        </div>
      )}

      <h3>Documents</h3>
      <form className="card upload-form" onSubmit={handleUpload}>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input type="file" onChange={(e) => setFile(e.target.files[0])} required />
        <button type="submit" disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload document'}
        </button>
      </form>

      <table className="data-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Category</th>
            <th>Uploaded</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id}>
              <td>{doc.original_filename}</td>
              <td>{CATEGORY_LABELS[doc.category] || doc.category}</td>
              <td>{new Date(doc.created_at).toLocaleString()}</td>
              <td className="actions-cell">
                <button onClick={() => handleDownload(doc)}>Download</button>
                <button className="danger" onClick={() => handleDelete(doc.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {documents.length === 0 && (
            <tr>
              <td colSpan={4} className="empty-row">
                No documents uploaded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Layout>
  );
}
