'use strict';
/* Local development / VPS entry point. On Vercel the app is loaded through api/index.js instead. */
require('dotenv').config();

const fs = require('fs');
const path = require('path');

let app;
try {
  app = require('./app');
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const required = [
  ['views', 'index.html'], ['public', 'site.js'],
  ['public', 'admin', 'index.html'], ['public', 'admin', 'admin.js'], ['public', 'admin', 'admin.css']
];
const missing = required.map((p) => path.join(...p)).filter((f) => !fs.existsSync(path.join(__dirname, '..', f)));
if (missing.length) {
  console.error(`Missing project files:\n  - ${missing.join('\n  - ')}`);
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`Hill View running: http://localhost:${PORT}  |  Admin: http://localhost:${PORT}/admin`));
