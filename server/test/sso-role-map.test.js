const test = require('node:test');
const assert = require('node:assert/strict');

const { extractGroupsFromClaims, resolveSsoRoleFromGroups } = require('../src/lib/ssoRoleMap');

test('maps a SuperAdmin group to admin role', () => {
  const groups = ['/App-Access/HRM/SuperAdmins'];
  assert.equal(resolveSsoRoleFromGroups(groups), 'admin');
});

test('defaults to employee when no mapped group is present', () => {
  const groups = ['/Departments/Finance', '/Other/App/Reader'];
  assert.equal(resolveSsoRoleFromGroups(groups), 'employee');
});

test('uses precedence when multiple mapped groups are present', () => {
  const claims = {
    groups: ['/Departments/HR', '/App-Access/HRM/SuperAdmins', '/App-Access/HRM/HR'],
  };

  const groups = extractGroupsFromClaims(claims);
  assert.equal(resolveSsoRoleFromGroups(groups), 'admin');
});
