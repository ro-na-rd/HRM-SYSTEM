import { NavLink } from 'react-router-dom';
import logo from '../assets/azul-tech-logo-white-transparent.png';
import {
  DashboardIcon,
  EmployeesIcon,
  RecruitmentIcon,
  AttendanceIcon,
  LeaveIcon,
  DocumentsIcon,
  PerformanceIcon,
  PayrollIcon,
  OrganizationIcon,
  ReportsIcon,
  SettingsIcon,
  ChevronLeftIcon,
  ProfileIcon,
  MailIcon,
} from './Icons';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { to: '/employees', label: 'Employees', icon: EmployeesIcon },
  { to: '/recruitment', label: 'Recruitment', icon: RecruitmentIcon },
  { to: '/attendance', label: 'Attendance', icon: AttendanceIcon },
  { to: '/leave-management', label: 'Leave Management', icon: LeaveIcon },
  { to: '/documents', label: 'Documents', icon: DocumentsIcon },
  { to: '/performance', label: 'Performance', icon: PerformanceIcon },
  { to: '/compensation', label: 'Compensation / Payroll', icon: PayrollIcon },
  { to: '/organization', label: 'Organization', icon: OrganizationIcon },
  { to: '/reports', label: 'Reports', icon: ReportsIcon },
];

// Employee accounts only ever have their own profile, leave requests, and
// letters to navigate between - not the full staff navigation above.
const EMPLOYEE_NAV_ITEMS = [
  { to: '/profile', label: 'My Profile', icon: ProfileIcon, end: true },
  { to: '/profile/leave', label: 'Leave', icon: LeaveIcon },
  { to: '/profile/letters', label: 'Letters', icon: MailIcon },
];

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile, role }) {
  const showAdminItems = role === 'admin';
  const navItems = role === 'employee' ? EMPLOYEE_NAV_ITEMS : NAV_ITEMS;

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onCloseMobile} />}
      <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>
        <div className="sidebar-logo-row">
          <span className="sidebar-logo-chip">
            <img src={logo} alt="Azul Tech" className="sidebar-logo" />
          </span>
          {!collapsed && <span className="sidebar-logo-suffix">People</span>}
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              onClick={onCloseMobile}
              title={collapsed ? label : undefined}
            >
              <Icon size={19} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}

          {showAdminItems && (
            <>
              <div className="sidebar-divider" />
              <NavLink
                to="/settings"
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
                onClick={onCloseMobile}
                title={collapsed ? 'Settings' : undefined}
              >
                <SettingsIcon size={19} />
                {!collapsed && <span>Settings</span>}
              </NavLink>
            </>
          )}
        </nav>

        <button className="sidebar-collapse-toggle" onClick={onToggleCollapse} title="Collapse sidebar">
          <ChevronLeftIcon size={16} className={collapsed ? 'rotated' : ''} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </aside>
    </>
  );
}
