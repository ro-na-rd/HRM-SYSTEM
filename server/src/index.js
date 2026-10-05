require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

if (!process.env.JWT_SECRET || !process.env.ENCRYPTION_KEY) {
  console.error(
    '\nMissing JWT_SECRET or ENCRYPTION_KEY in server/.env.\n' +
      'Copy server/.env.example to server/.env and fill in generated values before starting the server.\n'
  );
  process.exit(1);
}

require('./db'); // ensures schema is created on boot

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const employeeRoutes = require('./routes/employees');
const documentRoutes = require('./routes/documents');
const auditRoutes = require('./routes/audit');
const leaveRoutes = require('./routes/leave');
const letterRoutes = require('./routes/letters');
const payrollRoutes = require('./routes/payroll');
const performanceRoutes = require('./routes/performance');
const attendanceRoutes = require('./routes/attendance');
const reportRoutes = require('./routes/reports');
const notificationRoutes = require('./routes/notifications');
const managerRoutes = require('./routes/manager');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// When deployed behind a reverse proxy (nginx, Traefik, etc.), this makes
// express-rate-limit and secure cookies see the real client IP/protocol
// instead of the proxy's.
if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(helmet());

if (!isProduction) {
  // In production the built frontend is served from this same Express app
  // (same origin), so CORS is only needed for the local two-port dev setup.
  app.use(
    cors({
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174', 'http://localhost:5175', 'http://127.0.0.1:5175'],
      credentials: true,
    })
  );
}

app.use(express.json());
app.use(cookieParser());
app.use('/brand-assets', express.static(__dirname));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/audit-log', auditRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/letters', letterRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/manager', managerRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

if (isProduction) {
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const PORT = process.env.PORT || 4000;
// Local single-machine use binds to loopback only. Set HOST=0.0.0.0 in
// production (behind a reverse proxy) to accept connections from outside.
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`HRM server running at http://${HOST}:${PORT}${isProduction ? ' (production)' : ' (local machine only)'}`);
});
