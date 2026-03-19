// tools/randomToken.ts
const nodeCrypto = require('crypto');

module.exports = (n = 32) => nodeCrypto.randomBytes(n).toString('base64url');

export {};
