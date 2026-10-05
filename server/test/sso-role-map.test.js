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

test('maps a Managers group to manager role', () => {
  assert.equal(resolveSsoRoleFromGroups(['/App-Access/HRM/Managers']), 'manager');
});

test('MANAGER_EMAILS lifts only plain employees to manager', () => {
  const { applyManagerEmails } = require('../src/lib/ssoRoleMap');
  const list = 'rose.mukeshimana@azultech.rw, other@azultech.rw';
  assert.equal(applyManagerEmails('employee', 'Rose.Mukeshimana@azultech.rw', list), 'manager');
  assert.equal(applyManagerEmails('employee', 'someone@azultech.rw', list), 'employee');
  assert.equal(applyManagerEmails('hr', 'rose.mukeshimana@azultech.rw', list), 'hr');
});
