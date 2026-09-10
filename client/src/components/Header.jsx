import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { timeAgo } from '../utils/timeAgo';
import { MenuIcon, SearchIcon, BellIcon, LogOutIcon } from './Icons';
import ChangePasswordModal from './ChangePasswordModal';
import ChangePhotoModal from './ChangePhotoModal';

export default function Header({ title, user, onOpenMobileMenu, onLogout, canSearchEmployees }) {
  const navigate = useNavigate();
  const isEmployee = user?.role === 'employee';
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [allEmployees, setAllEmployees] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifs, setNotifs] = useState({ items: [], unread: 0 });
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showChangePhoto, setShowChangePhoto] = useState(false);
  const searchBoxRef = useRef(null);
  const notifRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) setMatches([]);
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfileMenu(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    let alive = true;
    function loadNotifs() {
      api
        .get('/notifications')
        .then((d) => alive && setNotifs(d))
        .catch(() => {});
    }
    loadNotifs();
    const t = setInterval(loadNotifs, 45000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  function refreshNotifs() {
    api.get('/notifications').then(setNotifs).catch(() => {});
  }

  async function openNotification(n) {
    setShowNotifications(false);
    if (!n.read_at) {
      try {
        await api.post(`/notifications/${n.id}/read`);
      } catch {
        /* ignore */
      }
      refreshNotifs();
    }
    if (n.link) navigate(n.link);
  }

  async function markAllNotificationsRead() {
    try {
      await api.post('/notifications/read-all');
    } catch {
      /* ignore */
    }
    refreshNotifs();
  }

  async function handleQueryChange(value) {
    setQuery(value);
    if (!canSearchEmployees || !value.trim()) {
      setMatches([]);
      return;
    }
    let list = allEmployees;
    if (!list) {
      try {
        list = await api.get('/employees');
        setAllEmployees(list);
      } catch {
        list = [];
      }
    }
    const q = value.toLowerCase();
    setMatches(list.filter((e) => e.full_name.toLowerCase().includes(q)).slice(0, 6));
  }

  function goToEmployee(id) {
    setQuery('');
    setMatches([]);
    navigate(`/employees/${id}`);
  }

  return (
    <header className="topheader">
      <button className="mobile-menu-btn" onClick={onOpenMobileMenu} aria-label="Open menu">
        <MenuIcon size={22} />
      </button>

      <h1 className="topheader-title">{title}</h1>

      {canSearchEmployees && (
        <div className="header-search" ref={searchBoxRef}>
          <SearchIcon size={16} />
          <input
            placeholder="Search employees..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
          />
          {matches.length > 0 && (
            <div className="header-search-results">
              {matches.map((m) => (
                <button key={m.id} onClick={() => goToEmployee(m.id)}>
                  {m.full_name}
                  <span>{m.position || m.department || ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="topheader-actions">
        <div className="header-notif" ref={notifRef}>
          <button className="icon-btn" onClick={() => setShowNotifications((s) => !s)} aria-label="Notifications">
            <BellIcon size={19} />
            {notifs.unread > 0 && (
              <span className="notif-badge">{notifs.unread > 9 ? '9+' : notifs.unread}</span>
            )}
          </button>
          {showNotifications && (
            <div className="header-dropdown header-notif-dropdown">
              <div className="notif-head">
                <strong>Notifications</strong>
                {notifs.unread > 0 && (
                  <button className="notif-mark-all" onClick={markAllNotificationsRead}>
                    Mark all read
                  </button>
                )}
              </div>
              {notifs.items.length === 0 ? (
                <p className="header-dropdown-empty">You're all caught up — no notifications.</p>
              ) : (
                <ul className="notif-list">
                  {notifs.items.slice(0, 8).map((n) => (
                    <li key={n.id}>
                      <button
                        className={`notif-item ${n.read_at ? '' : 'notif-item-unread'}`}
                        onClick={() => openNotification(n)}
                      >
                        <span className="notif-item-title">{n.title}</span>
                        {n.body && <span className="notif-item-body">{n.body}</span>}
                        <span className="notif-item-time">{timeAgo(n.created_at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {isEmployee && (
                <button
                  className="notif-see-all"
                  onClick={() => {
                    setShowNotifications(false);
                    navigate('/profile/notifications');
                  }}
                >
                  See all notifications
                </button>
              )}
            </div>
          )}
        </div>

        <div className="header-profile" ref={profileRef}>
          <button className="header-profile-btn" onClick={() => setShowProfileMenu((s) => !s)}>
            {user?.has_photo ? (
              <img src="/api/auth/photo" alt={user?.name} className="avatar-photo" style={{ width: 30, height: 30 }} />
            ) : (
              <span className="avatar-circle">{user?.name?.[0]?.toUpperCase() || '?'}</span>
            )}
            <span className="header-profile-text">
              <strong>{user?.name}</strong>
              <em>{user?.role}</em>
            </span>
          </button>
          {showProfileMenu && (
            <div className="header-dropdown header-dropdown-right">
              <button
                className="header-dropdown-item"
                onClick={() => {
                  setShowChangePhoto(true);
                  setShowProfileMenu(false);
                }}
              >
                Change profile photo
              </button>
              <button
                className="header-dropdown-item"
                onClick={() => {
                  setShowChangePassword(true);
                  setShowProfileMenu(false);
                }}
              >
                Change password
              </button>
              <button className="header-dropdown-logout" onClick={onLogout}>
                <LogOutIcon size={16} />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
      {showChangePhoto && <ChangePhotoModal onClose={() => setShowChangePhoto(false)} />}
    </header>
  );
}
