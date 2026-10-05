// Shared bits for the team manager pages (role 'manager').

// The team register started on this day; the server rejects earlier dates.
export const TEAM_START_DATE = '2026-10-01';

export const LEAVE_TYPE_LABELS = {
  annual: 'Annual',
  sick: 'Sick',
  unpaid: 'Unpaid',
  other: 'Other',
};

// '2026-10-01' -> '01/10/2026' (the format the team uses).
export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}
