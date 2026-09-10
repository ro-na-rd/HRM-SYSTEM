export const STATUS_LABELS = {
  present: 'Present',
  absent: 'Absent',
  leave: 'On leave',
  remote: 'Remote',
  half_day: 'Half day',
};

export const STATUS_OPTIONS = Object.keys(STATUS_LABELS);

export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function hoursWorked(clockIn, clockOut) {
  if (!clockIn || !clockOut) return null;
  const ms = new Date(clockOut) - new Date(clockIn);
  if (!(ms > 0)) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
