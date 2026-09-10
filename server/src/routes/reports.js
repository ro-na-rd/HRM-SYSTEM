const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'hr'));

// One roll-up of the numbers HR looks at most, drawn from the other modules.
router.get('/summary', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7); // YYYY-MM

  const headcount = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END) AS inactive
       FROM employees`
    )
    .get();

  const byDepartment = db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(department), ''), 'Unassigned') AS department, COUNT(*) AS count
       FROM employees WHERE active = 1
       GROUP BY department ORDER BY count DESC, department ASC`
    )
    .all();

  const leave = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
         COUNT(*) AS total
       FROM leave_requests`
    )
    .get();

  const payrollRow = db
    .prepare(
      `SELECT COUNT(*) AS with_salary, COALESCE(SUM(gross_salary), 0) AS monthly_total
       FROM compensation WHERE gross_salary IS NOT NULL`
    )
    .get();
  const payrollCurrency =
    db.prepare(`SELECT currency FROM compensation WHERE gross_salary IS NOT NULL GROUP BY currency ORDER BY COUNT(*) DESC LIMIT 1`).get()
      ?.currency || 'RWF';
  const latestPayslipMonth = db.prepare('SELECT MAX(period_month) AS m FROM payslips').get()?.m || null;
  const latestPayslips = latestPayslipMonth
    ? db
        .prepare(
          `SELECT COUNT(*) AS count, COALESCE(SUM(gross_pay), 0) AS gross, COALESCE(SUM(net_pay), 0) AS net
           FROM payslips WHERE period_month = ?`
        )
        .get(latestPayslipMonth)
    : { count: 0, gross: 0, net: 0 };

  const performance = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
         SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,
         SUM(CASE WHEN status = 'published' AND acknowledged_at IS NOT NULL THEN 1 ELSE 0 END) AS acknowledged,
         ROUND(AVG(CASE WHEN rating IS NOT NULL THEN rating END), 2) AS avg_rating
       FROM performance_reviews`
    )
    .get();

  const attendanceToday = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status IN ('present', 'remote', 'half_day') THEN 1 ELSE 0 END) AS present,
         SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) AS on_leave,
         SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent,
         COUNT(*) AS recorded
       FROM attendance WHERE work_date = ?`
    )
    .get(today);
  const attendanceMonth = db
    .prepare(`SELECT COUNT(*) AS records FROM attendance WHERE work_date LIKE ?`)
    .get(`${monthPrefix}-%`);

  const documents = db.prepare('SELECT COUNT(*) AS total FROM documents').get();
  const users = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admin,
         SUM(CASE WHEN role = 'hr' THEN 1 ELSE 0 END) AS hr,
         SUM(CASE WHEN role = 'employee' THEN 1 ELSE 0 END) AS employee
       FROM users`
    )
    .get();

  res.json({
    generated_at: new Date().toISOString(),
    headcount,
    by_department: byDepartment,
    leave,
    payroll: {
      with_salary: payrollRow.with_salary,
      monthly_total: payrollRow.monthly_total,
      currency: payrollCurrency,
      latest_month: latestPayslipMonth,
      latest_payslips: latestPayslips,
    },
    performance,
    attendance: { today: attendanceToday, month: attendanceMonth },
    documents,
    users,
  });
});

// Plain-CSV roster export for spreadsheets.
router.get('/employees.csv', (req, res) => {
  const rows = db
    .prepare(
      `SELECT e.full_name, e.department, e.position, e.hire_date, e.phone,
              CASE WHEN e.active = 1 THEN 'Active' ELSE 'Inactive' END AS status,
              m.full_name AS manager, u.email AS login_email
       FROM employees e
       LEFT JOIN employees m ON m.id = e.manager_id
       LEFT JOIN users u ON u.id = e.user_id
       ORDER BY e.full_name ASC`
    )
    .all();

  const headers = ['Name', 'Department', 'Position', 'Hire date', 'Phone', 'Status', 'Manager', 'Login email'];
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(','),
    ...rows.map((r) =>
      [r.full_name, r.department, r.position, r.hire_date, r.phone, r.status, r.manager, r.login_email]
        .map(esc)
        .join(',')
    ),
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="employees-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

module.exports = router;
