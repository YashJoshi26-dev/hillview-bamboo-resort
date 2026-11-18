'use strict';
/* Creates a local .env: admin password, MongoDB connection string and a random session secret. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  console.log('.env already exists. Delete it first if you want to run setup again.');
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

(async () => {
  let pw = '';
  while (pw.length < 8) {
    pw = (await ask('Admin password (min 8 characters): ')).trim();
    if (pw.length < 8) console.log('Too short.');
  }
  let uri = '';
  while (!/^mongodb(\+srv)?:\/\//.test(uri)) {
    uri = (await ask('MongoDB connection string (mongodb+srv://...): ')).trim();
    if (!/^mongodb(\+srv)?:\/\//.test(uri)) console.log('That does not look like a MongoDB connection string.');
  }
  const blob = (await ask('Vercel Blob token (press Enter to skip, photos will save locally): ')).trim();
  rl.close();

  const env = [
    'PORT=3000',
    'NODE_ENV=development',
    `ADMIN_PASSWORD=${pw}`,
    `SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`,
    `MONGODB_URI=${uri}`,
    'MONGODB_DB=hillview',
    `BLOB_READ_WRITE_TOKEN=${blob}`,
    'PUBLIC_URL=',
    ''
  ].join('\n');
  fs.writeFileSync(envPath, env, { mode: 0o600 });
  console.log('\nDone. Start with: npm run dev   |   Admin panel: http://localhost:3000/admin');
})();
