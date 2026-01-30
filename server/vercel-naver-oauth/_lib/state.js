/**
 * OAuth state 생성/검증 (HMAC)
 * kakkaobot naverOAuth와 동일 형식 사용
 */

const crypto = require('crypto');

const SECRET = process.env.OAUTH_STATE_SECRET || 'default-secret-change-in-production';

function createState(userId, draftId = null, userName = null) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const iat = Math.floor(Date.now() / 1000);
  const payload = { userId, nonce, iat };
  if (draftId) payload.draftId = draftId;
  if (userName && String(userName).trim()) payload.userName = String(userName).trim();

  const payloadStr = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(payloadStr);
  const sig = hmac.digest('hex');
  return Buffer.from(payloadStr).toString('base64url') + '.' + sig;
}

function verifyState(state) {
  try {
    const [b64, sig] = (state || '').split('.');
    if (!b64 || !sig) return null;
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString());
    const verify = { userId: payload.userId, nonce: payload.nonce, iat: payload.iat };
    if (payload.draftId) verify.draftId = payload.draftId;
    if (payload.userName) verify.userName = payload.userName;
    const hmac = crypto.createHmac('sha256', SECRET);
    hmac.update(JSON.stringify(verify));
    if (hmac.digest('hex') !== sig) return null;
    if (Math.floor(Date.now() / 1000) - payload.iat > 600) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = { createState, verifyState };
