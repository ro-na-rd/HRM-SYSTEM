import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import EmployeeDetail from './pages/EmployeeDetail';
import Documents from './pages/Documents';
import LeaveManagement from './pages/LeaveManagement';
import Organization from './pages/Organization';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import MyDocuments from './pages/MyDocuments';
import MyPayslips from './pages/MyPayslips';
import EmployeeDashboard from './pages/EmployeeDashboard';
import Compensation from './pages/Compensation';
import ComingSoon from './pages/ComingSoon';
import {
  RecruitmentIcon,
  AttendanceIcon,
  PerformanceIcon,
  ReportsIcon,
  TrainingIcon,
  BellIcon,
  SettingsIcon,
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
  return <Navigate to={user.role === 'employee' ? '/employee-dashboard' : '/dashboard'} replace />;
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
            <LeaveManagement />
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
            <Compensation />
          </ProtectedRoute>
        }
      />
      <Route
        path="/organization"
        element={
          <ProtectedRoute roles={STAFF_ROLES}>
            <Organization />
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
        path="/employee-dashboard"
        element={
          <ProtectedRoute roles={['employee']}>
            <EmployeeDashboard />
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
      <Route
        path="/profile/leave"
        element={
          <ProtectedRoute roles={['employee']}>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/letters"
        element={
          <ProtectedRoute roles={['employee']}>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/documents"
        element={
          <ProtectedRoute roles={['employee']}>
            <MyDocuments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/attendance"
        element={
          <ProtectedRoute roles={['employee']}>
            <ComingSoon title="Attendance" icon={AttendanceIcon} description="Clock-in/out and attendance history will show up here once HR turns on attendance tracking." />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/payslips"
        element={
          <ProtectedRoute roles={['employee']}>
            <MyPayslips />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/performance"
        element={
          <ProtectedRoute roles={['employee']}>
            <ComingSoon title="Performance" icon={PerformanceIcon} description="Your performance reviews will appear here once HR publishes one." />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/training"
        element={
          <ProtectedRoute roles={['employee']}>
            <ComingSoon title="Training" icon={TrainingIcon} description="Training assigned to you by HR will appear here." />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/notifications"
        element={
          <ProtectedRoute roles={['employee']}>
            <ComingSoon title="Notifications" icon={BellIcon} description="A dedicated notification center is coming - for now, check Recent Activity on your Dashboard." />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/settings"
        element={
          <ProtectedRoute roles={['employee']}>
            <ComingSoon title="Settings" icon={SettingsIcon} description="More preferences are coming. For now, use the profile menu (top right) to change your password or photo." />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
