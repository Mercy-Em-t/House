'use strict';

const fs = require('node:fs');
const path = require('node:path');

const v1Path = path.join(__dirname, 'v1.json');
const PROTOCOL_V1 = JSON.parse(fs.readFileSync(v1Path, 'utf8'));

module.exports = {
  PROTOCOL_V1,
  PROTOCOL_VERSION: PROTOCOL_V1.version,
};
