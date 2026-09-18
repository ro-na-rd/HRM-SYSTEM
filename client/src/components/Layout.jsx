import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import Sidebar from './Sidebar';
import Header from './Header';

const TITLES = {
  '/dashboard': 'Dashboard',
  '/employees': 'Employees',
  '/recruitment': 'Recruitment',
  '/attendance': 'Attendance',
  '/leave-management': 'Leave Management',
  '/documents': 'Documents',
  '/performance': 'Performance',
  '/compensation': 'Compensation / Payroll',
  '/organization': 'Organization',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/profile': 'My Profile',
  '/profile/leave': 'Leave',
  '/profile/letters': 'Letters',
  '/profile/documents': 'My Documents',
  '/profile/attendance': 'Attendance',
  '/profile/payslips': 'Payslips',
  '/profile/performance': 'Performance',
  '/profile/training': 'Training',
  '/profile/notifications': 'Notifications',
  '/profile/settings': 'Settings',
};

export default function Layout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    // Auto-collapse to icon rail on tablet widths only. Below that, the sidebar
    // becomes a full-width overlay drawer instead, so it should stay expanded.
    return window.matchMedia('(min-width: 769px) and (max-width: 1100px)').matches;
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  async function handleLogout() {
    try {
      const logoutUrl = await logout();
      window.location.href = logoutUrl || '/login';
    } catch {
      window.location.href = '/login';
    }
  }

  const resolvedTitle = title || TITLES[location.pathname] || 'Employees';

  return (
    <div className="app-shell">
      <Sidebar
        role={user?.role}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className={`app-main ${collapsed ? 'app-main-collapsed' : ''}`}>
        <Header
          title={resolvedTitle}
          user={user}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onLogout={handleLogout}
          canSearchEmployees={user?.role === 'admin' || user?.role === 'hr'}
        />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
