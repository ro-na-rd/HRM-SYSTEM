const DEFAULT_SSO_ROLE = 'employee';

const SSO_ROLE_GROUP_CONFIG = [
  { group: '/App-Access/people/Admin', role: 'admin', priority: 300 },
  { group: '/App-Access/people/HR', role: 'hr', priority: 220 },
  { group: '/App-Access/people/Employee', role: 'employee', priority: 120 },
  { group: '/App-Access/people/Employees', role: 'employee', priority: 110 },
  { group: '/App-Access/HRM/SuperAdmins', role: 'admin', priority: 290 },
  { group: '/App-Access/HRM/Admins', role: 'admin', priority: 280 },
  { group: '/App-Access/HRM/HR', role: 'hr', priority: 210 },
  { group: '/App-Access/HRM/Employees', role: 'employee', priority: 100 },
];

function normalizeGroupPath(value) {
  if (value == null) return '';
  return String(value)
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function extractGroupsFromClaims(claims = {}) {
  const raw = [];

  if (Array.isArray(claims.groups)) {
    raw.push(...claims.groups);
  } else if (typeof claims.groups === 'string') {
    raw.push(...claims.groups.split(','));
  }

  if (Array.isArray(claims.roles)) {
    raw.push(...claims.roles);
  }

  if (Array.isArray(claims.realm_access?.roles)) {
    raw.push(...claims.realm_access.roles);
  }

  const groups = raw
    .map((entry) => normalizeGroupPath(entry))
    .filter(Boolean)
    .filter((entry, index, all) => all.indexOf(entry) === index);

  return groups;
}

function getSsoRoleInfo(groups = []) {
  const normalizedGroups = Array.isArray(groups) ? groups.map(normalizeGroupPath).filter(Boolean) : [];

  let matchedGroup = null;
  let matchedRole = DEFAULT_SSO_ROLE;
  let matchedPriority = -1;

  for (const group of normalizedGroups) {
    const configEntry = SSO_ROLE_GROUP_CONFIG.find((entry) => {
      const expected = normalizeGroupPath(entry.group);
      return group === expected || group.endsWith(expected) || expected.endsWith(group);
    });

    if (!configEntry) continue;

    if (configEntry.priority > matchedPriority) {
      matchedGroup = group;
      matchedRole = configEntry.role;
      matchedPriority = configEntry.priority;
    }
  }

  return {
    role: matchedRole,
    matchedGroup,
    priority: matchedPriority,
    groups: normalizedGroups,
  };
}

function resolveSsoRoleFromGroups(groups = []) {
  return getSsoRoleInfo(groups).role;
}

module.exports = {
  DEFAULT_SSO_ROLE,
  SSO_ROLE_GROUP_CONFIG,
  extractGroupsFromClaims,
  getSsoRoleInfo,
  normalizeGroupPath,
  resolveSsoRoleFromGroups,
};
