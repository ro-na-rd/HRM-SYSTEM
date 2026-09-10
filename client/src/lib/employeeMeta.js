import { useEffect, useState } from 'react';
import { api } from '../api/client';

// Starter options so the dropdowns are useful on a brand-new install.
// Anything HR actually types gets merged in from /employees/meta, so the
// list grows to match how the company really labels its teams and roles.
const DEFAULT_DEPARTMENTS = [
  'Administration',
  'Customer Support',
  'Design',
  'Engineering',
  'Finance',
  'Human Resources',
  'IT',
  'Legal',
  'Marketing',
  'Operations',
  'Product',
  'Sales',
];

const DEFAULT_POSITIONS = [
  'Analyst',
  'Associate',
  'Coordinator',
  'Director',
  'Engineer',
  'Intern',
  'Manager',
  'Officer',
  'Senior Engineer',
  'Team Lead',
];

function merge(defaults, fromDb) {
  const seen = new Set();
  const out = [];
  for (const value of [...(fromDb || []), ...defaults]) {
    const trimmed = String(value).trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function useEmployeeMeta() {
  const [meta, setMeta] = useState({
    departments: DEFAULT_DEPARTMENTS,
    positions: DEFAULT_POSITIONS,
  });

  useEffect(() => {
    api
      .get('/employees/meta')
      .then((d) =>
        setMeta({
          departments: merge(DEFAULT_DEPARTMENTS, d.departments),
          positions: merge(DEFAULT_POSITIONS, d.positions),
        })
      )
      .catch(() => {});
  }, []);

  return meta;
}
