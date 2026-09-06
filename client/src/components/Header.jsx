import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { MenuIcon, SearchIcon, BellIcon, LogOutIcon } from './Icons';
import ChangePasswordModal from './ChangePasswordModal';

export default function Header({ title, user, onOpenMobileMenu, onLogout, canSearchEmployees }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [allEmployees, setAllEmployees] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
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
          </button>
          {showNotifications && (
            <div className="header-dropdown">
              <p className="header-dropdown-empty">You're all caught up — no new notifications.</p>
            </div>
          )}
        </div>

        <div className="header-profile" ref={profileRef}>
          <button className="header-profile-btn" onClick={() => setShowProfileMenu((s) => !s)}>
            <span className="avatar-circle">{user?.name?.[0]?.toUpperCase() || '?'}</span>
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
    </header>
  );
}
