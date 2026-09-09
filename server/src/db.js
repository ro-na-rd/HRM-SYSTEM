const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const storageDir = path.join(__dirname, '..', 'storage');
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'hr.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'hr', 'employee')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    department TEXT,
    position TEXT,
    hire_date TEXT,
    phone TEXT,
    notes TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    category TEXT NOT NULL CHECK (category IN ('contract', 'id_document', 'letter', 'certificate', 'other')),
    original_filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('annual', 'sick', 'unpaid', 'other')),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    review_note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('request', 'to_hr')),
    subject TEXT NOT NULL,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
    response TEXT,
    resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migration: letters can optionally carry an encrypted file attachment
// (e.g. the actual letter HR prepared in response to a "request a letter"
// letter). Added after the letters table already existed in the wild, so
// it's an ALTER TABLE guarded by a column-existence check rather than part
// of the CREATE TABLE above.
const letterColumns = db.prepare("PRAGMA table_info(letters)").all().map((c) => c.name);
if (!letterColumns.includes('attachment_stored_filename')) {
  db.exec(`
    ALTER TABLE letters ADD COLUMN attachment_original_filename TEXT;
    ALTER TABLE letters ADD COLUMN attachment_stored_filename TEXT;
    ALTER TABLE letters ADD COLUMN attachment_mime_type TEXT;
    ALTER TABLE letters ADD COLUMN attachment_size INTEGER;
    ALTER TABLE letters ADD COLUMN attachment_iv TEXT;
    ALTER TABLE letters ADD COLUMN attachment_auth_tag TEXT;
  `);
}

// Migration: profile photo, stored encrypted like everything else, on the
// employee record itself (not the login/user), since it's the same
// underlying person shown on both the Admin/HR side and the Employee's own view.
const employeeColumns = db.prepare("PRAGMA table_info(employees)").all().map((c) => c.name);
if (!employeeColumns.includes('photo_stored_filename')) {
  db.exec(`
    ALTER TABLE employees ADD COLUMN photo_stored_filename TEXT;
    ALTER TABLE employees ADD COLUMN photo_mime_type TEXT;
    ALTER TABLE employees ADD COLUMN photo_iv TEXT;
    ALTER TABLE employees ADD COLUMN photo_auth_tag TEXT;
  `);
}

// Migration: account photo for the LOGIN itself (Admin/HR/Employee) - shown
// in the header avatar for whoever is signed in. Separate from the
// employee-record photo above, which is about the staff roster entry
// (visible to Admin/HR on the Employees list) and doesn't apply to
// Admin/HR logins that have no linked employee record.
const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userColumns.includes('photo_stored_filename')) {
  db.exec(`
    ALTER TABLE users ADD COLUMN photo_stored_filename TEXT;
    ALTER TABLE users ADD COLUMN photo_mime_type TEXT;
    ALTER TABLE users ADD COLUMN photo_iv TEXT;
    ALTER TABLE users ADD COLUMN photo_auth_tag TEXT;
  `);
}

// Migration: reporting structure, for the Organization page.
if (!employeeColumns.includes('manager_id')) {
  db.exec(`ALTER TABLE employees ADD COLUMN manager_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;`);
}

// Migration: extra personal info for the employee's own Profile page.
// date_of_birth/gender/address/emergency_contact_* are employee-editable
// (personal info); everything else about the employee record stays
// HR-controlled as before.
if (!employeeColumns.includes('date_of_birth')) {
  db.exec(`
    ALTER TABLE employees ADD COLUMN date_of_birth TEXT;
    ALTER TABLE employees ADD COLUMN gender TEXT;
    ALTER TABLE employees ADD COLUMN address TEXT;
    ALTER TABLE employees ADD COLUMN emergency_contact_name TEXT;
    ALTER TABLE employees ADD COLUMN emergency_contact_relationship TEXT;
    ALTER TABLE employees ADD COLUMN emergency_contact_phone TEXT;
  `);
}

module.exports = db;
