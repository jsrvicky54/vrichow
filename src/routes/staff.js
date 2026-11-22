const express = require('express');
const attendance = require('../services/attendance');
const time = require('../lib/time');
const { requireRole, requirePasswordChanged } = require('../middleware/auth');

const router = express.Router();

router.use(requireRole('staff'), requirePasswordChanged);

/** Wraps an action so friendly errors become a flash message. */
function action(fn) {
  return async (req, res, next) => {
    try {
      const text = await fn(req);
      req.session.flash = { type: 'success', text };
    } catch (err) {
      if (!err.isUserError) return next(err);
      req.session.flash = { type: 'error', text: err.message };
    }
    // Redirect after POST so a page refresh never repeats the action.
    res.redirect('/staff');
  };
}

router.get('/', async (req, res, next) => {
  try {
    const status = await attendance.getStatus(req.user.id);
    const today = await attendance.listForUser(req.user.id, time.dayRange(time.todayKey()));
    const todayMinutes = today.reduce((s, r) => s + (r.minutes || 0), 0);
    res.render('staff/home', {
      title: 'Sign in / Sign out',
      status,
      today,
      todayMinutes,
      serverNow: Date.now(),
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/sign-in',
  action(async (req) => {
    const entry = await attendance.signIn(req.user.id);
    return `You signed in at ${time.fmtTime(entry.sign_in_at)}.`;
  })
);

router.post(
  '/sign-out',
  action(async (req) => {
    const entry = await attendance.signOut(req.user.id);
    return `You signed out at ${time.fmtTime(entry.sign_out_at)}. Worked: ${time.fmtDuration(entry.minutes)}.`;
  })
);

router.post(
  '/missed-sign-out',
  action(async (req) => {
    const entry = await attendance.enterMissedSignOut(req.user.id, String(req.body.left_at || ''));
    return `Saved: you left at ${time.fmtTime(entry.sign_out_at)} on ${time.fmtDate(entry.sign_in_at)}. You can sign in now.`;
  })
);

router.get('/history', async (req, res, next) => {
  try {
    const month = time.isValidMonthKey(req.query.month) ? req.query.month : time.currentMonthKey();
    const rows = await attendance.listForUser(req.user.id, time.monthRange(month));
    const totalMinutes = rows.reduce((s, r) => s + (r.minutes || 0), 0);
    const days = new Set(rows.map((r) => r.date_key)).size;
    res.render('staff/history', {
      title: 'My history',
      month,
      monthLabel: time.monthLabel(month),
      prevMonth: time.shiftMonth(month, -1),
      nextMonth: month < time.currentMonthKey() ? time.shiftMonth(month, 1) : null,
      rows,
      totalMinutes,
      days,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
