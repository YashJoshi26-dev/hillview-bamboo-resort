'use strict';
const { getDb } = require('./db');
const seed = require('../seed/content.json');

const col = async (name) => (await getDb()).collection(name);

/* ---------- site content (single document) ---------- */
async function getContent() {
  const c = await col('content');
  let doc = await c.findOne({ _id: 'site' });
  if (!doc) {
    // First run: load the default rates and photos.
    await c.updateOne({ _id: 'site' }, { $setOnInsert: { ...seed, updatedAt: new Date() } }, { upsert: true });
    doc = await c.findOne({ _id: 'site' });
  }
  const { _id, updatedAt, ...content } = doc; // eslint-disable-line no-unused-vars
  return content;
}

async function saveContent(content) {
  const c = await col('content');
  await c.replaceOne({ _id: 'site' }, { ...content, updatedAt: new Date() }, { upsert: true });
}

/* ---------- guest links (one document per link, _id = slug) ---------- */
const toOffer = (d) => {
  if (!d) return null;
  const { _id, ...rest } = d;
  return { slug: _id, ...rest };
};

async function listOffers() {
  const c = await col('offers');
  return (await c.find({}).sort({ createdAt: -1 }).toArray()).map(toOffer);
}

async function getOffer(slug) {
  return toOffer(await (await col('offers')).findOne({ _id: slug }));
}

async function createOffer(offer) {
  const { slug, ...rest } = offer;
  await (await col('offers')).insertOne({ _id: slug, ...rest });
  return offer;
}

async function updateOffer(slug, data) {
  const res = await (await col('offers')).updateOne({ _id: slug }, { $set: data });
  return res.matchedCount ? getOffer(slug) : null;
}

async function deleteOffer(slug) {
  return (await (await col('offers')).deleteOne({ _id: slug })).deletedCount > 0;
}

async function recordView(slug) {
  await (await col('offers')).updateOne({ _id: slug }, { $inc: { views: 1 }, $set: { lastViewedAt: new Date().toISOString() } });
}

/* ---------- login attempt limiter (shared across serverless instances) ---------- */
let indexed = false;
async function limiter() {
  const c = await col('login_attempts');
  if (!indexed) {
    await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
    indexed = true;
  }
  return c;
}

async function isLocked(key, max) {
  const d = await (await limiter()).findOne({ _id: key, expiresAt: { $gt: new Date() } });
  return !!d && d.n >= max;
}

async function recordFailure(key, windowMs) {
  const c = await limiter();
  const r = await c.updateOne({ _id: key, expiresAt: { $gt: new Date() } }, { $inc: { n: 1 } });
  if (!r.matchedCount) await c.replaceOne({ _id: key }, { n: 1, expiresAt: new Date(Date.now() + windowMs) }, { upsert: true });
}

async function clearFailures(key) {
  await (await limiter()).deleteOne({ _id: key });
}

module.exports = {
  getContent, saveContent,
  listOffers, getOffer, createOffer, updateOffer, deleteOffer, recordView,
  isLocked, recordFailure, clearFailures
};
