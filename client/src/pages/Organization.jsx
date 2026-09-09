import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';

function OrgNode({ node, childrenByManager }) {
  const children = childrenByManager.get(node.id) || [];
  return (
    <li>
      <div className="org-node">
        <Avatar id={node.id} name={node.full_name} hasPhoto={node.has_photo} size={34} />
        <div className="org-node-info">
          <Link to={`/employees/${node.id}`}>{node.full_name}</Link>
          <span>{node.position || node.department || '—'}</span>
        </div>
      </div>
      {children.length > 0 && (
        <ul className="org-tree">
          {children.map((child) => (
            <OrgNode key={child.id} node={child} childrenByManager={childrenByManager} />
          ))}
        </ul>
      )}
    </li>
  );
}

function OrgChartPanel({ employees }) {
  const { roots, childrenByManager } = useMemo(() => {
    const activeEmployees = employees.filter((e) => e.active);
    const byId = new Set(activeEmployees.map((e) => e.id));
    const map = new Map();
    for (const e of activeEmployees) {
      const key = e.manager_id && byId.has(e.manager_id) ? e.manager_id : null;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return { roots: map.get(null) || [], childrenByManager: map };
  }, [employees]);

  if (employees.length === 0) {
    return <p className="hint">No employees yet - add employees first, then set who reports to whom.</p>;
  }

  return (
    <div className="card">
      <ul className="org-tree org-tree-root">
        {roots.map((node) => (
          <OrgNode key={node.id} node={node} childrenByManager={childrenByManager} />
        ))}
      </ul>
      <p className="hint">
        Set a "Manager" on an employee's record (Employees → open an employee → Edit) to place them in this chart.
        People with no manager set appear at the top level.
      </p>
    </div>
  );
}

function DepartmentsPanel({ employees }) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const e of employees) {
      const key = e.department || 'Unassigned';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [employees]);

  if (employees.length === 0) {
    return <p className="hint">No employees yet.</p>;
  }

  return (
    <>
      {groups.map(([department, members]) => (
        <div className="card" key={department}>
          <div className="page-header">
            <h3>{department}</h3>
            <span className="hint">
              {members.length} {members.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          <ul className="people-list">
            {members.map((m) => (
              <li key={m.id}>
                <Avatar id={m.id} name={m.full_name} hasPhoto={m.has_photo} size={30} />
                <div className="people-list-info">
                  <strong>
                    <Link to={`/employees/${m.id}`}>{m.full_name}</Link>
                  </strong>
                  <span>{m.position || '—'}</span>
                </div>
                {!m.active && <em>Inactive</em>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export default function Organization() {
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('chart');

  useEffect(() => {
    api.get('/employees').then(setEmployees).catch((e) => setError(e.message));
  }, []);

  return (
    <Layout title="Organization">
      <div className="tab-row">
        <button className={`tab-btn ${tab === 'chart' ? 'tab-btn-active' : ''}`} onClick={() => setTab('chart')}>
          Org Chart
        </button>
        <button
          className={`tab-btn ${tab === 'departments' ? 'tab-btn-active' : ''}`}
          onClick={() => setTab('departments')}
        >
          Departments
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {tab === 'chart' ? <OrgChartPanel employees={employees} /> : <DepartmentsPanel employees={employees} />}
    </Layout>
  );
}
