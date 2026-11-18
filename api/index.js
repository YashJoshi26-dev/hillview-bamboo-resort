'use strict';
// Vercel serverless entry: the Express app is the request handler.
require('dotenv').config();
module.exports = require('../server/app');
