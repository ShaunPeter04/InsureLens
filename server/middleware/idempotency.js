const crypto = require('node:crypto');
const fs = require('node:fs/promises');

// Short-lived, owner-scoped retry receipts. No user data or keys are logged.
function createIdempotency({ttl = 10 * 60 * 1000, limit = 1000} = {}) {
  const receipts = new Map();
  return async (req, res, next) => {
    const key = req.get('Idempotency-Key');
    if (!key) return next(); // Existing clients retain their current contract.
    const discardUpload = async () => { if (req.file?.path) await fs.unlink(req.file.path).catch(()=>{}); };
    if (!/^[a-f0-9-]{36}$/i.test(key)) {
      await discardUpload();
      return res.status(400).json({message:'Invalid retry key. Please submit again.'});
    }
    let fingerprint;
    try {
      const hash = crypto.createHash('sha256').update(JSON.stringify(req.body));
      if (req.file?.path) hash.update(await fs.readFile(req.file.path));
      fingerprint = hash.digest('hex');
    } catch {
      await discardUpload();
      return res.status(503).json({message:'Unable to prepare the request. Please try again.'});
    }
    const ownerKey = `${req.user}:${req.baseUrl}:${req.path}:${key}`;
    for (const [id, receipt] of receipts) if (receipt.done && receipt.expires <= Date.now()) receipts.delete(id);
    const previous = receipts.get(ownerKey);
    if (previous) {
      await discardUpload();
      if (previous.fingerprint !== fingerprint) return res.status(409).json({message:'The form changed. Submit it with a new retry key.'});
      await previous.finished;
      if (previous.body) return res.status(previous.status).json(previous.body);
      return res.status(503).json({message:'The previous request did not complete. Please retry.'});
    }
    if (receipts.size >= limit) {
      await discardUpload();
      return res.status(503).json({message:'The service is busy. Please retry shortly.'});
    }
    let finish;
    const receipt = {fingerprint, done:false, finished:new Promise(resolve=>{finish=resolve;})};
    receipts.set(ownerKey, receipt);
    const pendingTimeout = setTimeout(finish, 45000);
    pendingTimeout.unref();
    const json = res.json.bind(res);
    res.json = body => {
      if (res.statusCode >= 500 && req.writeAttempted) {
        res.statusCode = 503;
        body = {message:'The save status could not be confirmed. Check your saved records before submitting again.'};
        receipt.body = body; receipt.status = 503;
      } else if (res.statusCode >= 200 && res.statusCode < 300) {
        receipt.body = body; receipt.status = res.statusCode;
      } else receipts.delete(ownerKey);
      clearTimeout(pendingTimeout);
      receipt.done = true; receipt.expires = Date.now() + ttl; finish();
      const expire = setTimeout(() => { if (receipts.get(ownerKey) === receipt) receipts.delete(ownerKey); }, ttl);
      expire.unref();
      return json(body);
    };
    // Resolve waiters if a handler exits without producing a response.
    res.once('finish', () => { if (!receipt.done) {clearTimeout(pendingTimeout);receipts.delete(ownerKey);receipt.done=true;finish();} });
    next();
  };
}
module.exports = createIdempotency;
