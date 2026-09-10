import { useEffect, useState } from 'react';
import { api } from '../api/client';

// The company's departments and the positions that belong to each. HR picks
// from these on the employee form; anything they type as "Other" is still
// accepted and merged back in from /employees/meta on the next load.
export const DEPARTMENT_POSITIONS = {
  IT: ['IT Officer', 'Software Developer', 'System Administrator', 'IT Manager', 'IT Support'],
  'Human Resources': ['HR Officer', 'HR Manager', 'Recruiter', 'HR Assistant', 'Training Coordinator'],
  Finance: ['Accountant', 'Finance Officer', 'Finance Manager', 'Payroll Officer', 'Auditor'],
  Marketing: ['Marketing Officer', 'Marketing Manager', 'Content Creator', 'Social Media Manager'],
  Operations: ['Operations Officer', 'Operations Manager', 'Logistics Coordinator', 'Project Manager'],
  Sales: ['Sales Representative', 'Sales Manager', 'Account Manager', 'Business Development Officer'],
  Administration: ['Administrative Assistant', 'Office Manager', 'Receptionist', 'Executive Assistant'],
};

const DEFAULT_DEPARTMENTS = Object.keys(DEPARTMENT_POSITIONS);

// Case-insensitive de-dupe that keeps the first spelling seen and the order
// of the arrays passed in (canonical values first, then whatever's in use).
function uniqMerge(...lists) {
  const seen = new Set();
  const out = [];
  for (const value of lists.flat()) {
    const trimmed = String(value ?? '').trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function useEmployeeMeta() {
  const [meta, setMeta] = useState({ departments: [], positions: [] });

  useEffect(() => {
    api
      .get('/employees/meta')
      .then((d) => setMeta({ departments: d.departments || [], positions: d.positions || [] }))
      .catch(() => {});
  }, []);

  return meta;
}

// All departments to show as options: the canonical set first, then any
// extra ones already on the roster.
export function departmentOptions(meta) {
  return uniqMerge(DEFAULT_DEPARTMENTS, meta?.departments || []);
}

// Positions to show once a department is chosen: that department's list
// first, then any other positions already in use on the roster.
export function positionOptions(department, meta) {
  const mapped = DEPARTMENT_POSITIONS[department] || [];
  return uniqMerge(mapped, meta?.positions || []);
}
