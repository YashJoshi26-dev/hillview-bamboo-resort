'use strict';
require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const multer = require('multer');

const auth = require('./auth');
const store = require('./store');
const validate = require('./validate');
const files = require('./files');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const VIEWS_DIR = path.join(ROOT, 'views');
const UPLOAD_DIR = files.UPLOAD_DIR;
const MAX_UPLOAD = 4 * 1024 * 1024; // Vercel limits request bodies to ~4.5 MB
const isProd = process.env.NODE_ENV === 'production';

for (const k of ['ADMIN_PASSWORD', 'SESSION_SECRET', 'MONGODB_URI']) {
  if (!process.env[k]) throw new Error(`Missing environment variable ${k} (see .env.example)`);
}
if (process.env.ADMIN_PASSWORD.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters');
if (process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

/* ---------- helpers ---------- */
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const offerState = (o) => (!o.active ? 'paused' : o.expiresAt && new Date(o.expiresAt) < new Date() ? 'expired' : 'live');
const newSlug = () => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');
};

const MAGIC = [
  { ext: '.jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: '.webp', mime: 'image/webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' }
];

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD, files: 1 } });

function usedImages(content) {
  return new Set([...Object.values(content.images), ...content.gallery.map((g) => g.src)]);
}

/* ---------- public API ---------- */
app.get('/api/content', asyncH(async (req, res) => {
  const content = await store.getContent();
  res.set('Cache-Control', 'no-cache');

  const slug = typeof req.query.offer === 'string' ? req.query.offer : '';
  if (!/^[a-z0-9]{6,20}$/.test(slug)) return res.json({ ...content, offer: null });

  const offer = await store.getOffer(slug);
  if (!offer || offerState(offer) !== 'live') return res.json({ ...content, offer: null });

  await store.recordView(slug).catch((e) => console.error('view count failed', e));

  res.set('Cache-Control', 'no-store');
  res.json({
    ...content,
    prices: { ...content.prices, ...offer.prices },
    offer: { slug: offer.slug, guestName: offer.guestName, message: offer.message, specialPrices: Object.keys(offer.prices) }
  });
}));

/* ---------- admin auth ---------- */
const LOGIN_MAX = 10;
const LOGIN_WINDOW = 15 * 60 * 1000;

app.post('/api/admin/login', asyncH(async (req, res) => {
  if (req.get('X-Requested-With') !== 'admin') return res.status(403).json({ error: 'Blocked' });
  const key = `ip:${req.ip}`;
  if (await store.isLocked(key, LOGIN_MAX)) return res.status(429).json({ error: 'Too many attempts. Please try again in 15 minutes.' });
  if (!auth.checkPassword(req.body && req.body.password)) {
    await store.recordFailure(key, LOGIN_WINDOW);
    return res.status(401).json({ error: 'Incorrect password' });
  }
  await store.clearFailures(key);
  auth.issue(res);
  res.json({ ok: true });
}));
app.post('/api/admin/logout', (req, res) => { auth.clear(res); res.json({ ok: true }); });
app.get('/api/admin/me', (req, res) => res.json({ authed: auth.isAuthed(req) }));

/* ---------- admin: content ---------- */
const admin = express.Router();
admin.use(auth.requireAdmin);

admin.get('/content', asyncH(async (req, res) => res.json(await store.getContent())));

admin.put('/content', asyncH(async (req, res) => {
  const before = await store.getContent();
  const next = validate.content(req.body);
  await store.saveContent(next);

  const keep = usedImages(next);
  await files.removeImages([...usedImages(before)].filter((u) => !keep.has(u)));
  res.json(next);
}));

admin.post('/upload', upload.single('file'), asyncH(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  const type = MAGIC.find((m) => m.test(req.file.buffer));
  if (!type) return res.status(400).json({ error: 'Only JPG, PNG or WebP images are allowed' });
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}${type.ext}`;
  const url = await files.saveImage(name, req.file.buffer, type.mime);
  res.status(201).json({ url });
}));

/* ---------- admin: personal links ---------- */
const baseUrl = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const present = (req, o) => ({ ...o, state: offerState(o), url: `${baseUrl(req)}/o/${o.slug}` });

admin.get('/offers', asyncH(async (req, res) => {
  res.json((await store.listOffers()).map((o) => present(req, o)));
}));

admin.post('/offers', asyncH(async (req, res) => {
  const data = validate.offer(req.body);
  const offer = { slug: newSlug(), ...data, views: 0, createdAt: new Date().toISOString() };
  await store.createOffer(offer);
  res.status(201).json(present(req, offer));
}));

admin.put('/offers/:slug', asyncH(async (req, res) => {
  const updated = await store.updateOffer(req.params.slug, validate.offer(req.body));
  if (!updated) return res.status(404).json({ error: 'Link not found' });
  res.json(present(req, updated));
}));

admin.delete('/offers/:slug', asyncH(async (req, res) => {
  if (!(await store.deleteOffer(req.params.slug))) return res.status(404).json({ error: 'Link not found' });
  res.json({ ok: true });
}));

app.use('/api/admin', admin);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

/* ---------- pages & static ---------- */
const noIndex = (req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); };
const inr = (n) => '\u20B9' + Number(n).toLocaleString('en-IN');

/** Serves index.html with price/OG/JSON-LD kept in sync with admin content (good for Google & WhatsApp previews). */
let pageCache = { mtime: 0, html: '' };
async function renderPage(req) {
  const file = path.join(VIEWS_DIR, 'index.html');
  const st = await fs.promises.stat(file);
  if (st.mtimeMs !== pageCache.mtime) pageCache = { mtime: st.mtimeMs, html: await fs.promises.readFile(file, 'utf8') };
  const c = await store.getContent();
  const all = Object.values(c.prices);
  const hero = c.images.hero.startsWith('/') ? baseUrl(req) + c.images.hero : c.images.hero;
  return pageCache.html
    .replace(/Book direct from \u20B9[\d,]+ a night/g, () => `Book direct from ${inr(c.prices.one)} a night`)
    .replace(/"priceRange":"[^"]*"/, () => `"priceRange":"${inr(Math.min(...all))} - ${inr(Math.max(...all))}"`)
    .replace(/(<meta property="og:image" content=")[^"]*(")/, (m, a, b) => a + hero + b)
    .replace(/("image":")[^"]*(")/, (m, a, b) => a + hero + b);
}
const page = asyncH(async (req, res) => {
  res.set('Cache-Control', 'no-cache').type('html').send(await renderPage(req));
});

if (!process.env.VERCEL) app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny' }));
app.use('/admin', noIndex, express.static(path.join(PUBLIC_DIR, 'admin'), { index: 'index.html' }));
app.get(['/', '/index.html'], page);
app.get('/o/:slug', noIndex, page);
app.use(express.static(PUBLIC_DIR, { index: false, maxAge: isProd ? '1h' : 0 }));
app.use((req, res) => res.status(404).type('text').send('Page not found'));

/* ---------- errors ---------- */
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof validate.ValidationError) return res.status(400).json({ error: err.message });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image must be under 4 MB' : 'Upload failed' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

module.exports = app;
