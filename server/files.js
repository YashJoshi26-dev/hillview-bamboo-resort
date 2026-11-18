'use strict';
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const onVercel = !!process.env.VERCEL;
const blob = TOKEN ? require('@vercel/blob') : null;

const isBlobUrl = (u) => {
  try { return new URL(u).hostname.endsWith('.blob.vercel-storage.com'); } catch { return false; }
};

/** Stores an image and returns its public URL. Vercel Blob in production, local disk for development. */
async function saveImage(name, buffer, contentType) {
  if (blob) {
    const res = await blob.put(`hillview/${name}`, buffer, { access: 'public', contentType, addRandomSuffix: false, token: TOKEN });
    return res.url;
  }
  if (onVercel) throw new Error('Image storage is not configured (BLOB_READ_WRITE_TOKEN missing)');
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), buffer, { flag: 'wx' });
  return `/uploads/${name}`;
}

/** Deletes images that are no longer used. Failures are ignored: a leftover file is harmless. */
async function removeImages(urls) {
  const blobUrls = urls.filter(isBlobUrl);
  if (blob && blobUrls.length) await blob.del(blobUrls, { token: TOKEN }).catch(() => {});
  await Promise.all(urls.filter((u) => u.startsWith('/uploads/'))
    .map((u) => fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(u))).catch(() => {})));
}

module.exports = { saveImage, removeImages, UPLOAD_DIR };
