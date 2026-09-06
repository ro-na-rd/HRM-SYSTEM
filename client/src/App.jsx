import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import EmployeeDetail from './pages/EmployeeDetail';
import Documents from './pages/Documents';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import ComingSoon from './pages/ComingSoon';
import {
  RecruitmentIcon,
  AttendanceIcon,
  LeaveIcon,
  PerformanceIcon,
  PayrollIcon,
  OrganizationIcon,
  ReportsIcon,
} from './components/Icons';

function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'employee' ? '/profile' : '/dashboard'} replace />;
}

const STAFF_ROLES = ['admin', 'hr'];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<HomeRedirect />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute roles={STAFF_ROLES}>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employees"
        element={
          <ProtectedRoute roles={STAFF_ROLES}>
            <Employees />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employees/:id"
        element={
          <ProtectedRoute roles={STAFF_ROLES}>
            <EmployeeDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/documents"
        element={
          <ProtectedRoute roles={STAFF_ROLES}>
            <Documents />
          </ProtectedRoute>
        }
      />
      <Route
        path="/recruitment"
        element={
          <ProtectedRoute roles={STAFF_ROLES}>
            <ComingSoon title="Recruitment" icon={RecruitmentIcon} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance"
        element={
          <ProtectedRoute roles={STAFF_ROLES}>
            <ComingSoon title="Attendance" icon={AttendanceIcon} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leave-management"
        element={
          <ProtectedRoute roles={STAFF_ROLES}>
            <ComingSoon title="Leave Management" icon={LeaveIcon} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/performance"
        element={
          <ProtectedRoute roles={STAFF_ROLES}>
            <ComingSoon title="Performance" icon={PerformanceIcon} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/compensation"
        element={
          <ProtectedRoute roles={STAFF_ROLES}>
            <ComingSoon title="Compensation / Payroll" icon={PayrollIcon} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/organization"
        element={
          <ProtectedRoute roles={STAFF_ROLES}>
            <ComingSoon title="Organization" icon={OrganizationIcon} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute roles={STAFF_ROLES}>
            <ComingSoon title="Reports" icon={ReportsIcon} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute roles={['admin']}>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute roles={['employee']}>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
