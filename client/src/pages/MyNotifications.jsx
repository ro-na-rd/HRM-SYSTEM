import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import Layout from '../components/Layout';
import { timeAgo } from '../utils/timeAgo';

export default function MyNotifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  function load() {
    api
      .get('/notifications')
      .then((d) => {
        setItems(d.items);
        setUnread(d.unread);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }

  useEffect(load, []);

  async function open(n) {
    if (!n.read_at) {
      try {
        await api.post(`/notifications/${n.id}/read`);
      } catch {
        /* ignore */
      }
      load();
    }
    if (n.link) navigate(n.link);
  }

  async function markAll() {
    try {
      await api.post('/notifications/read-all');
    } catch {
      /* ignore */
    }
    load();
  }

  return (
    <Layout title="Notifications">
      <div className="page-header">
        <h2>Notifications</h2>
        {unread > 0 && <button onClick={markAll}>Mark all read</button>}
      </div>
      {error && <div className="error-banner">{error}</div>}

      {loaded && items.length === 0 && <p className="hint">You don’t have any notifications yet.</p>}

      <ul className="notif-page-list">
        {items.map((n) => (
          <li key={n.id}>
            <button className={`notif-page-item ${n.read_at ? '' : 'notif-item-unread'}`} onClick={() => open(n)}>
              <span className="notif-item-title">{n.title}</span>
              {n.body && <span className="notif-item-body">{n.body}</span>}
              <span className="notif-item-time">{timeAgo(n.created_at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Layout>
  );
}
