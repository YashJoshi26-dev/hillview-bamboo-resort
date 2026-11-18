'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const COOKIE = 'hv_admin';
const TTL_SECONDS = 60 * 60 * 8;

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const secret = () => required('SESSION_SECRET');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function checkPassword(candidate) {
  return safeEqual(candidate || '', required('ADMIN_PASSWORD'));
}

function issue(res) {
  const token = jwt.sign({ role: 'admin' }, secret(), { expiresIn: TTL_SECONDS });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL_SECONDS * 1000,
    path: '/'
  });
}

function clear(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function isAuthed(req) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return false;
  try {
    return jwt.verify(token, secret()).role === 'admin';
  } catch {
    return false;
  }
}

/** Auth + CSRF guard: custom header cannot be sent cross-site without CORS preflight. */
function requireAdmin(req, res, next) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Not signed in' });
  if (req.method !== 'GET' && req.get('X-Requested-With') !== 'admin') {
    return res.status(403).json({ error: 'Blocked' });
  }
  next();
}

module.exports = { checkPassword, issue, clear, isAuthed, requireAdmin };
