import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, downloadLetterAttachment } from '../api/client';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import { useAuth } from '../AuthContext';

const LEAVE_TYPE_LABELS = {
  annual: 'Annual',
  sick: 'Sick',
  unpaid: 'Unpaid',
  other: 'Other',
};

function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{status[0].toUpperCase() + status.slice(1)}</span>;
}

const EMPTY_PERSONAL = {
  phone: '',
  date_of_birth: '',
  gender: '',
  address: '',
  emergency_contact_name: '',
  emergency_contact_relationship: '',
  emergency_contact_phone: '',
};

function ProfilePanel({ employee, onChanged }) {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [personal, setPersonal] = useState(EMPTY_PERSONAL);
  const [savingPersonal, setSavingPersonal] = useState(false);

  useEffect(() => {
    setPersonal({
      phone: employee?.phone || '',
      date_of_birth: employee?.date_of_birth || '',
      gender: employee?.gender || '',
      address: employee?.address || '',
      emergency_contact_name: employee?.emergency_contact_name || '',
      emergency_contact_relationship: employee?.emergency_contact_relationship || '',
      emergency_contact_phone: employee?.emergency_contact_phone || '',
    });
  }, [employee]);

  async function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file || !employee) return;
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      await api.postForm(`/employees/${employee.id}/photo`, formData);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleRemovePhoto() {
    if (!employee) return;
    setError('');
    setUploading(true);
    try {
      await api.delete(`/employees/${employee.id}/photo`);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSavePersonal(e) {
    e.preventDefault();
    setError('');
    setSavingPersonal(true);
    try {
      await api.patch('/employees/me', personal);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPersonal(false);
    }
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      <div className="card profile-photo-row">
        <Avatar id={employee?.id} name={user?.name} hasPhoto={employee?.has_photo} size={72} />
        <div className="profile-photo-actions">
          <label className="button-like">
            {uploading ? 'Uploading...' : employee?.has_photo ? 'Change photo' : 'Add photo'}
            <input type="file" accept="image/*" hidden onChange={handlePhotoChange} disabled={uploading} />
          </label>
          {employee?.has_photo && (
            <button className="danger" onClick={handleRemovePhoto} disabled={uploading}>
              Remove photo
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="page-header">
          <h3>Employment Information</h3>
          <span className="hint">Set by HR — contact them to correct anything here</span>
        </div>
        <div className="employee-summary">
          <div>
            <strong>Employee ID:</strong> {employee ? `#${employee.id}` : '—'}
          </div>
          <div>
            <strong>Job Title:</strong> {employee?.position || '—'}
          </div>
          <div>
            <strong>Department:</strong> {employee?.department || '—'}
          </div>
          <div>
            <strong>Date Joined:</strong> {employee?.hire_date || '—'}
          </div>
          <div>
            <strong>Manager:</strong> {employee?.manager_name || '—'}
          </div>
          <div>
            <strong>Status:</strong> {employee ? (employee.active ? 'Active' : 'Inactive') : '—'}
          </div>
        </div>
      </div>

      {employee ? (
        <form className="card form-grid" onSubmit={handleSavePersonal}>
          <div className="page-header" style={{ gridColumn: '1 / -1' }}>
            <h3>Personal Information</h3>
          </div>
          <label>
            Full name (read-only)
            <input value={user?.name || ''} disabled />
          </label>
          <label>
            Email (read-only)
            <input value={user?.email || ''} disabled />
          </label>
          <label>
            Phone
            <input
              value={personal.phone}
              onChange={(e) => setPersonal({ ...personal, phone: e.target.value })}
              placeholder="Your phone number"
            />
          </label>
          <label>
            Date of birth
            <input
              type="date"
              value={personal.date_of_birth}
              onChange={(e) => setPersonal({ ...personal, date_of_birth: e.target.value })}
            />
          </label>
          <label>
            Gender
            <input
              value={personal.gender}
              onChange={(e) => setPersonal({ ...personal, gender: e.target.value })}
              placeholder="Optional"
            />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Address
            <input
              value={personal.address}
              onChange={(e) => setPersonal({ ...personal, address: e.target.value })}
              placeholder="Optional"
            />
          </label>

          <div className="page-header" style={{ gridColumn: '1 / -1' }}>
            <h3>Emergency Contact</h3>
          </div>
          <label>
            Name
            <input
              value={personal.emergency_contact_name}
              onChange={(e) => setPersonal({ ...personal, emergency_contact_name: e.target.value })}
            />
          </label>
          <label>
            Relationship
            <input
              value={personal.emergency_contact_relationship}
              onChange={(e) => setPersonal({ ...personal, emergency_contact_relationship: e.target.value })}
            />
          </label>
          <label>
            Phone
            <input
              value={personal.emergency_contact_phone}
              onChange={(e) => setPersonal({ ...personal, emergency_contact_phone: e.target.value })}
            />
          </label>

          <button type="submit" disabled={savingPersonal} style={{ gridColumn: '1 / -1', justifySelf: 'start' }}>
            {savingPersonal ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      ) : (
        <p className="empty-row">No personal information available yet.</p>
      )}
    </>
  );
}

function LeavePanel({ hasEmployeeRecord }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ type: 'annual', start_date: '', end_date: '', reason: '' });

  function load() {
    api.get('/leave').then(setRows).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/leave', form);
      setForm({ type: 'annual', start_date: '', end_date: '', reason: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasEmployeeRecord) {
    return <p className="empty-row">No leave requests available yet.</p>;
  }

  const pendingCount = rows.filter((r) => r.status === 'pending').length;
  const approvedCount = rows.filter((r) => r.status === 'approved').length;
  const rejectedCount = rows.filter((r) => r.status === 'rejected').length;

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <div>
            <div className="stat-value">{pendingCount}</div>
            <div className="stat-label">Pending</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-value">{approvedCount}</div>
            <div className="stat-label">Approved</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-value">{rejectedCount}</div>
            <div className="stat-label">Rejected</div>
          </div>
        </div>
      </div>

      <form className="card form-grid" onSubmit={handleSubmit}>
        <label>
          Type
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="annual">Annual</option>
            <option value="sick">Sick</option>
            <option value="unpaid">Unpaid</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Start date
          <input
            type="date"
            required
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
        </label>
        <label>
          End date
          <input
            type="date"
            required
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Reason
          <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Submitting...' : 'Request leave'}
        </button>
      </form>

      <h3>My Leave Requests</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Dates</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Approved By</th>
            <th>Comment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{LEAVE_TYPE_LABELS[r.type] || r.type}</td>
              <td>
                {r.start_date} → {r.end_date}
              </td>
              <td>{r.reason || '—'}</td>
              <td>
                <StatusBadge status={r.status} />
              </td>
              <td>{r.reviewed_by_name || '—'}</td>
              <td>{r.review_note || '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="empty-row">
                No leave requests yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function LettersPanel({ hasEmployeeRecord }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ direction: 'request', subject: '', message: '' });

  function load() {
    api.get('/letters').then(setRows).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/letters', form);
      setForm({ direction: form.direction, subject: '', message: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasEmployeeRecord) {
    return <p className="empty-row">No letters available yet.</p>;
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      <form className="card form-grid" onSubmit={handleSubmit}>
        <label style={{ gridColumn: '1 / -1' }}>
          Type
          <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
            <option value="request">Request a letter from HR (e.g. employment confirmation)</option>
            <option value="to_hr">Write to HR / Admin</option>
          </select>
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Subject
          <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Message
          <input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Sending...' : 'Send'}
        </button>
      </form>

      <h3>My Letters</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Message</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td>{l.subject}</td>
              <td>{l.message || '—'}</td>
              <td>
                <StatusBadge status={l.status} />
                {l.response && <div className="hint">Reply: {l.response}</div>}
              </td>
              <td>
                {l.attachment_original_filename ? (
                  <button onClick={() => downloadLetterAttachment(l.id, l.attachment_original_filename)}>
                    Download {l.attachment_original_filename}
                  </button>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="empty-row">
                No letters yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

export default function Profile() {
  const [employee, setEmployee] = useState(null);
  const location = useLocation();

  function loadEmployee() {
    api
      .get('/employees')
      .then((rows) => setEmployee(rows[0] || null))
      .catch(() => setEmployee(null));
  }

  useEffect(loadEmployee, []);

  const tab = location.pathname === '/profile/leave' ? 'leave' : location.pathname === '/profile/letters' ? 'letters' : 'profile';

  return (
    <Layout>
      {tab === 'profile' && <ProfilePanel employee={employee} onChanged={loadEmployee} />}
      {tab === 'leave' && <LeavePanel hasEmployeeRecord={!!employee} />}
      {tab === 'letters' && <LettersPanel hasEmployeeRecord={!!employee} />}
    </Layout>
  );
}
