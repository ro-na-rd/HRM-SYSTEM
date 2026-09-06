import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../AuthContext';

export default function Profile() {
  const { user } = useAuth();
  const [employee, setEmployee] = useState(null);

  useEffect(() => {
    api
      .get('/employees')
      .then((rows) => setEmployee(rows[0] || null))
      .catch(() => setEmployee(null));
  }, []);

  return (
    <Layout>
      <div className="page-header">
        <h2>My Profile</h2>
      </div>
      <div className="card employee-summary">
        <div>
          <strong>Name:</strong> {user?.name}
        </div>
        <div>
          <strong>Email:</strong> {user?.email}
        </div>
        {employee && (
          <>
            <div>
              <strong>Department:</strong> {employee.department || '—'}
            </div>
            <div>
              <strong>Position:</strong> {employee.position || '—'}
            </div>
          </>
        )}
      </div>
      <p className="hint">
        Document records (contracts, ID, letters, etc.) are managed by HR and are not accessible from employee
        accounts. Please contact HR if you need a copy of a document.
      </p>
    </Layout>
  );
}
