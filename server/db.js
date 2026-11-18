'use strict';
const { MongoClient } = require('mongodb');
// Local development only: some networks refuse SRV lookups from Node's default resolver.
if (!process.env.VERCEL) require('dns').setServers(['8.8.8.8', '1.1.1.1']);
/** One cached connection per server instance (important on serverless, where instances are reused between requests). */
let pending = null;

function getDb() {
  if (!pending) {
    const uri = process.env.MONGODB_URI;
    if (!uri) return Promise.reject(new Error('MONGODB_URI is not set'));
    const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
    pending = client.connect()
      .then((c) => c.db(process.env.MONGODB_DB || 'hillview'))
      .catch((err) => { pending = null; throw err; });
  }
  return pending;
}

module.exports = { getDb };
