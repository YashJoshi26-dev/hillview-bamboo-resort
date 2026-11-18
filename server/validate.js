'use strict';

const IMAGE_KEYS = ['hero', 'stayA', 'stayB', 'roomOne', 'roomThree', 'roomWhole', 'party'];
const PRICE_KEYS = ['one', 'three', 'whole'];
const SIZES = ['', 'tall', 'wide'];
const MAX_GALLERY = 40;

class ValidationError extends Error {}

function fail(msg) { throw new ValidationError(msg); }

function price(v, label) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 100 || n > 1000000) fail(`${label}: enter a whole number between 100 and 10,00,000`);
  return n;
}

function imageUrl(v, label) {
  if (typeof v !== 'string') fail(`${label}: invalid image`);
  const s = v.trim();
  if (s.length > 500) fail(`${label}: image URL too long`);
  if (!/^\/uploads\/[\w.-]+$/.test(s) && !/^https:\/\/[^\s"'<>]+$/.test(s)) fail(`${label}: use an uploaded image or an https URL`);
  return s;
}

function text(v, max, label) {
  const s = String(v == null ? '' : v).trim();
  if (s.length > max) fail(`${label}: max ${max} characters`);
  return s;
}

function content(input) {
  if (!input || typeof input !== 'object') fail('Invalid payload');
  const prices = {};
  for (const k of PRICE_KEYS) prices[k] = price(input.prices && input.prices[k], `Price (${k})`);

  const images = {};
  for (const k of IMAGE_KEYS) images[k] = imageUrl(input.images && input.images[k], `Image (${k})`);

  if (!Array.isArray(input.gallery)) fail('Gallery must be a list');
  if (input.gallery.length > MAX_GALLERY) fail(`Gallery supports up to ${MAX_GALLERY} images`);
  const seen = new Set();
  const gallery = input.gallery.map((g, i) => {
    const id = /^[\w-]{1,24}$/.test(g && g.id) && !seen.has(g.id) ? g.id : `g${Date.now().toString(36)}${i}`;
    seen.add(id);
    return {
      id,
      src: imageUrl(g && g.src, `Gallery #${i + 1}`),
      alt: text(g && g.alt, 140, `Gallery #${i + 1} caption`) || 'Hill View Bamboo Resort',
      size: SIZES.includes(g && g.size) ? g.size : ''
    };
  });
  return { prices, images, gallery };
}

function offer(input) {
  if (!input || typeof input !== 'object') fail('Invalid payload');
  const guestName = text(input.guestName, 60, 'Guest name');
  if (!guestName) fail('Guest name is required');
  const message = text(input.message, 200, 'Message');
  const prices = {};
  for (const k of PRICE_KEYS) {
    const v = input.prices && input.prices[k];
    if (v !== '' && v != null) prices[k] = price(v, `Special price (${k})`);
  }
  let expiresAt = null;
  if (input.expiresAt) {
    const d = new Date(input.expiresAt);
    if (Number.isNaN(d.getTime())) fail('Invalid expiry date');
    expiresAt = d.toISOString();
  }
  return { guestName, message, prices, expiresAt, active: input.active !== false };
}

module.exports = { content, offer, ValidationError, IMAGE_KEYS, PRICE_KEYS };
