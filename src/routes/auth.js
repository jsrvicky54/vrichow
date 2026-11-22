const express = require('express');
const config = require('../config');
const db = require('../db');
const users = require('../services/users');
const { verifyPassword, validatePassword, DUMMY_HASH } = require('../lib/passwords');
const { loginIpLimiter, loginAccountLimiter } = require('../middleware/rateLimit');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

function homeFor(user) {
  return user.role === 'admin' ? '/admin' : '/staff';
}

const markerCookie = { httpOnly: true, sameSite: 'lax', secure: config.isProduction };

router.get('/', (req, res) => {
  if (!req.user) return res.redirect('/login');
  res.redirect(homeFor(req.user));
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect(homeFor(req.user));
  res.render('login', { title: 'Log in', staffId: '', error: null });
});

router.post('/login', loginIpLimiter, loginAccountLimiter, async (req, res, next) => {
  const staffId = String(req.body.staff_id || '').trim().slice(0, 50);
  const password = String(req.body.password || '');

  const fail = (message, status = 401) =>
    res.status(status).render('login', { title: 'Log in', staffId, error: message });

  if (!staffId || !password) return fail('Please enter your Staff ID and password.', 400);

  try {
    const user = await users.findForLogin(staffId);
    // Always run bcrypt so response time does not reveal whether the ID exists.
    const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) return fail('Staff ID or password is incorrect.');
    if (!user.active) return fail('Your account is not active. Please contact the office admin.', 403);

    const returnTo = req.session.returnTo;
    // New session id on login prevents session fixation.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      req.session.pwStamp = new Date(user.password_changed_at).toISOString();
      res.cookie('al', '1', markerCookie);

      let target = homeFor(user);
      if (user.must_change_password) target = '/change-password';
      else if (typeof returnTo === 'string' && /^\/(?!\/)/.test(returnTo) && returnTo.startsWith(target)) {
        target = returnTo;
      }
      req.session.save(() => res.redirect(target));
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('al', markerCookie);
  req.session.regenerate(() => {
    req.session.flash = { type: 'success', text: 'You have logged out.' };
    res.redirect('/login');
  });
});

router.get('/change-password', requireLogin, (req, res) => {
  res.render('change-password', { title: 'Change password', error: null });
});

router.post('/change-password', requireLogin, async (req, res, next) => {
  const current = String(req.body.current_password || '');
  const next1 = String(req.body.new_password || '');
  const next2 = String(req.body.confirm_password || '');
  const fail = (error) => res.status(400).render('change-password', { title: 'Change password', error });

  try {
    const hash = await users.getPasswordHash(req.user.id);
    if (!(await verifyPassword(current, hash))) return fail('Your current password is not correct.');
    const problem = validatePassword(next1);
    if (problem) return fail(problem);
    if (next1 !== next2) return fail('The two new passwords do not match.');
    if (next1 === current) return fail('Please choose a password that is different from your current one.');

    const stamp = await users.setPassword(db, req.user.id, next1, { temporary: false });
    // Keep THIS session valid; other sessions of this person are logged out.
    req.session.pwStamp = new Date(stamp).toISOString();
    req.session.flash = { type: 'success', text: 'Your password has been changed.' };
    res.redirect(homeFor(req.user));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
