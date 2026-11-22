const users = require('../services/users');

/**
 * Loads the logged-in user (fresh from the database on every request) so a
 * deactivated account or a reset password takes effect immediately.
 */
async function loadUser(req, res, next) {
  res.locals.user = null;
  const { userId, pwStamp } = req.session || {};
  if (!userId) return next();

  try {
    const user = await users.findById(userId);
    // pwStamp = password_changed_at seen at login. If it differs, the password
    // was changed or reset elsewhere, so this session is no longer valid.
    const passwordChangedAfterLogin = user && pwStamp !== new Date(user.password_changed_at).toISOString();

    if (!user || !user.active || passwordChangedAfterLogin) {
      return req.session.regenerate(() => {
        req.session.flash = {
          type: 'error',
          text: !user || !user.active
            ? 'Your account is not active. Please contact the office admin.'
            : 'Your password was changed. Please log in again.',
        };
        res.redirect('/login');
      });
    }

    req.user = user;
    res.locals.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  if (req.session) req.session.returnTo = req.method === 'GET' ? req.originalUrl : undefined;
  // "al" is a small marker cookie set at login and cleared at logout. If it is
  // still there but the session is gone, the session timed out.
  if (/(?:^|;\s*)al=1(?:;|$)/.test(req.headers.cookie || '')) {
    res.clearCookie('al');
    req.session.flash = { type: 'info', text: 'You were logged out after a period of inactivity. Please log in again.' };
  }
  res.redirect('/login');
}

/** Forces people with a temporary password to choose their own first. */
function requirePasswordChanged(req, res, next) {
  if (req.user && req.user.must_change_password) return res.redirect('/change-password');
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return requireLogin(req, res, next);
    if (req.user.role !== role) {
      return res.status(403).render('error', {
        title: 'Not allowed',
        message: 'You do not have permission to open this page.',
      });
    }
    next();
  };
}

module.exports = { loadUser, requireLogin, requireRole, requirePasswordChanged };
