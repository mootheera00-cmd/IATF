// tools/hash.ts
const nodeCrypto = require('crypto');
const fs = require('fs');

module.exports = (p: string) =>
  new Promise((ok, ko) => {
    const h = nodeCrypto.createHash('sha256');
    fs.createReadStream(p)
      .on('data', (d: any) => h.update(d))
      .on('end', () => ok(h.digest('hex')))
      .on('error', ko);
  });

export {};
