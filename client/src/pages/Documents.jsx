import { useEffect, useState } from 'react';
import { api, downloadDocument } from '../api/client';
import Layout from '../components/Layout';
import { UploadIcon } from '../components/Icons';

const CATEGORY_LABELS = {
  contract: 'Contract',
  id_document: 'ID Document',
  letter: 'Letter',
  certificate: 'Certificate',
  other: 'Other',
};

export default function Documents() {
  const [documents, setDocuments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');

  const [employeeId, setEmployeeId] = useState('');
  const [category, setCategory] = useState('contract');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  function load() {
    api.get('/documents').then(setDocuments).catch((e) => setError(e.message));
    api.get('/employees').then(setEmployees).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file || !employeeId) return;
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
      await api.postForm(`/documents/employee/${employeeId}`, formData);
      setFile(null);
      setEmployeeId('');
      e.target.reset();
      setShowForm(false);
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

  const q = search.trim().toLowerCase();
  const filtered = q
    ? documents.filter(
        (d) =>
          d.employee_name.toLowerCase().includes(q) ||
          d.original_filename.toLowerCase().includes(q) ||
          (CATEGORY_LABELS[d.category] || d.category).toLowerCase().includes(q)
      )
    : documents;

  return (
    <Layout title="Documents">
      <div className="page-header">
        <h2>All Documents</h2>
        <button className="upload-doc-btn" onClick={() => setShowForm((s) => !s)}>
          <UploadIcon size={17} />
          {showForm ? 'Cancel' : 'Upload Document'}
        </button>
      </div>

      <div className="documents-toolbar">
        <input
          className="documents-search"
          placeholder="Search by employee, file, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card upload-form" onSubmit={handleUpload}>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
            <option value="" disabled>
              Select employee
            </option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name}
              </option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input type="file" onChange={(e) => setFile(e.target.files[0])} required />
          <button type="submit" disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Employee</th>
            <th>Category</th>
            <th>Uploaded</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((doc) => (
            <tr key={doc.id}>
              <td>{doc.original_filename}</td>
              <td>{doc.employee_name}</td>
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
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="empty-row">
                {documents.length === 0 ? 'No documents uploaded yet.' : 'No documents match your search.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Layout>
  );
}
