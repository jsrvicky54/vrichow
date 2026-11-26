const crypto = require('crypto');

function base64Url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signToken(payload, secret) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64Url(JSON.stringify(payload));
  const input = `${header}.${body}`;
  const signature = crypto.createHmac('sha256', secret).update(input).digest();
  return `${input}.${base64Url(signature)}`;
}

function verifyToken(token, secret) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const input = `${parts[0]}.${parts[1]}`;
    const expected = base64Url(crypto.createHmac('sha256', secret).update(input).digest());
    const received = parts[2];
    if (received.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || !payload || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function getSettings() {
  const docsUrl = String(process.env.ONLYOFFICE_DOCS_URL || '').trim();
  const secret = String(process.env.ONLYOFFICE_JWT_SECRET || '');
  if (!docsUrl && !secret) return null;
  if (!docsUrl || secret.length < 32) {
    throw new Error('Set ONLYOFFICE_DOCS_URL and a 32-character-or-longer ONLYOFFICE_JWT_SECRET together.');
  }
  const parsed = new URL(docsUrl);
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new Error('ONLYOFFICE_DOCS_URL must use HTTPS outside local development.');
  }
  return { docsUrl: parsed.origin, docsOrigin: parsed.origin, secret };
}

module.exports = { getSettings, signToken, verifyToken };
