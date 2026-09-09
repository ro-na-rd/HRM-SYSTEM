import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../AuthContext';

export default function ChangePhotoModal({ onClose }) {
  const { user, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      await api.postForm('/auth/photo', formData);
      await refreshUser();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function handleRemove() {
    setError('');
    setBusy(true);
    try {
      await api.delete('/auth/photo');
      await refreshUser();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="page-header">
          <h3>Profile Photo</h3>
          <button className="danger" onClick={onClose}>
            Close
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="profile-photo-row">
          {user?.has_photo ? (
            <img src="/api/auth/photo" alt={user?.name} className="avatar-photo" style={{ width: 72, height: 72 }} />
          ) : (
            <span className="avatar-circle" style={{ width: 72, height: 72, fontSize: 28 }}>
              {user?.name?.[0]?.toUpperCase() || '?'}
            </span>
          )}
          <div className="profile-photo-actions">
            <label className="button-like">
              {busy ? 'Working...' : user?.has_photo ? 'Change photo' : 'Add photo'}
              <input type="file" accept="image/*" hidden onChange={handleUpload} disabled={busy} />
            </label>
            {user?.has_photo && (
              <button className="danger" onClick={handleRemove} disabled={busy}>
                Remove photo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
