function Svg({ children, size = 20, ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function DashboardIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="4.5" rx="1.5" />
      <rect x="13" y="10.5" width="7.5" height="10" rx="1.5" />
      <rect x="3.5" y="13.5" width="7.5" height="7" rx="1.5" />
    </Svg>
  );
}

export function EmployeesIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="8.5" r="2.5" />
      <path d="M15.5 14.2c2.6.4 4.5 2.7 4.5 5.3" />
    </Svg>
  );
}

export function ProfileIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5" />
    </Svg>
  );
}

export function RecruitmentIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="7" width="17" height="12" rx="2" />
      <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M12 11v4M10 13h4" />
    </Svg>
  );
}

export function AttendanceIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12.5" r="8" />
      <path d="M12 8.5v4l2.5 2" />
      <path d="M9 2.5h6" />
    </Svg>
  );
}

export function LeaveIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3M16 3v3" />
      <path d="M8.5 14l2 2 4-4" />
    </Svg>
  );
}

export function DocumentsIcon(props) {
  return (
    <Svg {...props}>
      <path d="M7 3.5h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" />
      <path d="M14 3.5V8h4" />
      <path d="M9 13h6M9 16.5h6" />
    </Svg>
  );
}

export function PerformanceIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 20V10M11 20V4M18 20v-7" />
      <path d="M3 20h18" />
    </Svg>
  );
}

export function PayrollIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M14.7 9.8c0-1.3-1.2-2.3-2.7-2.3s-2.6 1-2.6 2.1c0 1.1.9 1.7 2.6 2.1 1.7.4 2.7 1 2.7 2.1 0 1.2-1.2 2.1-2.7 2.1s-2.7-.9-2.7-2.1" />
    </Svg>
  );
}

export function OrganizationIcon(props) {
  return (
    <Svg {...props}>
      <rect x="9" y="3.5" width="6" height="5" rx="1.2" />
      <rect x="3" y="15.5" width="6" height="5" rx="1.2" />
      <rect x="15" y="15.5" width="6" height="5" rx="1.2" />
      <path d="M12 8.5v4M12 12.5H6v3M12 12.5h6v3" />
    </Svg>
  );
}

export function ReportsIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 3.5h9l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1-1.5z" />
      <path d="M9 11.5l2 2 4-4.5" />
    </Svg>
  );
}

export function SettingsIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19.6a2 2 0 0 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H4.4a2 2 0 0 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10.5a1.7 1.7 0 0 0 1.04-1.56V4.4a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10.5a1.7 1.7 0 0 0 1.56 1.04h.09a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.04z" />
    </Svg>
  );
}

export function ChevronLeftIcon(props) {
  return (
    <Svg {...props}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

export function MenuIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </Svg>
  );
}

export function SearchIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </Svg>
  );
}

export function BellIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10z" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </Svg>
  );
}

export function LogOutIcon(props) {
  return (
    <Svg {...props}>
      <path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H9" />
      <path d="M16 16l4-4-4-4" />
      <path d="M20 12H9" />
    </Svg>
  );
}

export function MailIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M4 7l8 6 8-6" />
    </Svg>
  );
}

export function LockIcon(props) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function UploadIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 15.5V4M8 8l4-4 4 4" />
      <path d="M4.5 15.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3.5" />
    </Svg>
  );
}
