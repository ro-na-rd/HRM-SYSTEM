import { useEffect, useState } from 'react';
import { api, downloadDocument, viewDocument } from '../api/client';
import Layout from '../components/Layout';
import { UploadIcon } from '../components/Icons';

const CATEGORY_LABELS = {
  contract: 'Employment Contract',
  id_document: 'ID Document',
  letter: 'Letter',
  certificate: 'Certificate',
  other: 'Other',
};

// What an employee is allowed to upload themselves - must match the
// server's EMPLOYEE_UPLOADABLE_CATEGORIES in server/src/routes/documents.js.
const UPLOADABLE_CATEGORIES = ['id_document', 'certificate', 'other'];

export default function MyDocuments() {
  const [employeeId, setEmployeeId] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState('id_document');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  function load() {
    setLoading(true);
    setError('');
    api
      .get('/employees')
      .then((rows) => {
        const own = rows[0];
        setEmployeeId(own ? own.id : null);
        if (own) {
          api.get(`/documents/employee/${own.id}`).then(setDocuments).catch((e) => setError(e.message));
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
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
      e.target.reset();
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleView(doc) {
    try {
      await viewDocument(doc.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDownload(doc) {
    try {
      await downloadDocument(doc.id, doc.original_filename);
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <Layout title="My Documents">
        <p>Loading...</p>
      </Layout>
    );
  }

  if (!employeeId) {
    return (
      <Layout title="My Documents">
        <p className="empty-row">No employee profile available yet. Refresh in a moment — if it persists, contact your Admin.</p>
      </Layout>
    );
  }

  return (
    <Layout title="My Documents">
      <div className="page-header">
        <h2>My Documents</h2>
        <button className="upload-doc-btn" onClick={() => setShowForm((s) => !s)}>
          <UploadIcon size={17} />
          {showForm ? 'Cancel' : 'Upload Document'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card upload-form" onSubmit={handleUpload}>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {UPLOADABLE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
          <input type="file" onChange={(e) => setFile(e.target.files[0])} required />
          <button type="submit" disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      )}
      <p className="hint">
        You can upload your own ID, certificates, or other supporting documents. Contracts and official letters are
        issued by HR and will appear here once added to your record.
      </p>

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
                <button onClick={() => handleView(doc)}>View</button>
                <button onClick={() => handleDownload(doc)}>Download</button>
              </td>
            </tr>
          ))}
          {documents.length === 0 && (
            <tr>
              <td colSpan={4} className="empty-row">
                No documents yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Layout>
  );
}
