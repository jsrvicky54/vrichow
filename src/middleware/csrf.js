const crypto = require('crypto');

/**
 * Simple synchronizer-token CSRF protection.
 * Every form includes <input type="hidden" name="_csrf" value="<%= csrfToken %>">.
 */
function csrf(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
  const expected = req.session.csrfToken;
  const ok =
    typeof sent === 'string' &&
    sent.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));

  if (!ok) {
    return res.status(403).render('error', {
      title: 'Page expired',
      message: 'This page was open for too long. Please go back, refresh the page and try again.',
    });
  }
  next();
}

module.exports = csrf;
