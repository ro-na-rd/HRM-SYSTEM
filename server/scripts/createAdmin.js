require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../src/db');

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Reads a line of input without echoing it back to the terminal (for passwords).
function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = '';

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onData = (chunk) => {
      const str = chunk.toString();
      const code = str.charCodeAt(0);
      const isEnter = code === 13 || code === 10;
      const isCtrlC = code === 3;
      const isBackspace = code === 127 || code === 8;

      if (isEnter) {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(value.trim());
      } else if (isCtrlC) {
        process.exit(1);
      } else if (isBackspace) {
        value = value.slice(0, -1);
      } else {
        value += str;
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  if (!process.env.JWT_SECRET || !process.env.ENCRYPTION_KEY) {
    console.error(
      'Missing JWT_SECRET or ENCRYPTION_KEY in server/.env. Set those up first (see server/.env.example).'
    );
    process.exit(1);
  }

  console.log('Create an Admin account for the HR system\n');
  const name = await ask('Full name: ');
  const emailRaw = await ask('Email: ');
  const email = emailRaw.toLowerCase();
  const password = await askHidden('Password (min 8 characters): ');

  if (!name || !email || !password || password.length < 8) {
    console.error('\nAll fields are required and password must be at least 8 characters.');
    process.exit(1);
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    console.error(`\nA user with email ${email} already exists.`);
    process.exit(1);
  }

  const password_hash = bcrypt.hashSync(password, 12);
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email, password_hash, 'admin');

  console.log(`\nAdmin account created (id ${info.lastInsertRowid}). You can now log in at http://localhost:5173`);
  process.exit(0);
}

main();
