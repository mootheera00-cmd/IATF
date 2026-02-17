const crypto=require('crypto'), fs=require('fs');
module.exports = p => new Promise((ok,ko)=>{
  const h=crypto.createHash('sha256'); fs.createReadStream(p).on('data',d=>h.update(d)).on('end',()=>ok(h.digest('hex'))).on('error',ko);
});