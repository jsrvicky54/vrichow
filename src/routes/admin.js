const express = require('express');
const db = require('../db');
const users = require('../services/users');
const attendance = require('../services/attendance');
const audit = require('../services/audit');
const time = require('../lib/time');
const exporter = require('../lib/export');
const { generateTempPassword, validatePassword } = require('../lib/passwords');
const { requireRole, requirePasswordChanged } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('admin'), requirePasswordChanged);

const DISPLAY_LIMIT = 1000;
const MAX_RANGE_DAYS = 366;

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 2147483647 ? n : null;
}

/** Reads month / date-range / person filters from the query string. */
function parseFilters(q) {
  const f = {
    mode: q.mode === 'range' ? 'range' : 'month',
    month: time.isValidMonthKey(q.month) ? q.month : time.currentMonthKey(),
    from: time.isValidDateKey(q.from) ? q.from : '',
    to: time.isValidDateKey(q.to) ? q.to : '',
    userId: parseId(q.user),
    error: null,
  };

  if (f.mode === 'range') {
    if (!f.from || !f.to) {
      f.error = 'Please choose both a start and an end date. Showing the selected month instead.';
      f.mode = 'month';
    } else {
      if (f.from > f.to) [f.from, f.to] = [f.to, f.from];
      const days = (Date.parse(f.to) - Date.parse(f.from)) / 86400000 + 1;
      if (days > MAX_RANGE_DAYS) {
        f.error = `Date range is limited to ${MAX_RANGE_DAYS} days. Showing the selected month instead.`;
        f.mode = 'month';
      }
    }
  }

  if (f.mode === 'range') {
    f.range = time.dateSpan(f.from, f.to);
    f.label = `${time.fmtDate(time.dayRange(f.from).start)} – ${time.fmtDate(time.dayRange(f.to).start)}`;
    f.fileLabel = `${f.from}_to_${f.to}`;
  } else {
    f.range = time.monthRange(f.month);
    f.label = time.monthLabel(f.month);
    f.fileLabel = f.month;
  }

  const qs = new URLSearchParams({ mode: f.mode });
  if (f.mode === 'range') {
    qs.set('from', f.from);
    qs.set('to', f.to);
  } else qs.set('month', f.month);
  if (f.userId) qs.set('user', String(f.userId));
  f.queryString = qs.toString();
  return f;
}

function userSnapshot(u) {
  return { id: u.id, staff_id: u.staff_id, name: u.name, department: u.department, role: u.role, active: u.active };
}

function cleanText(v, max) {
  return String(v || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

const STAFF_ID_RE = /^[A-Za-z0-9._-]{1,50}$/;

// ------------------------------------------------------------------ Dashboard

router.get('/', async (req, res, next) => {
  try {
    const today = time.todayKey();
    const open = await attendance.currentlyIn();
    const inNow = open.filter((r) => r.date_key === today);
    const forgot = open.filter((r) => r.date_key < today);
    const summary = await attendance.dailySummary(today);
    res.render('admin/dashboard', { title: 'Dashboard', inNow, forgot, summary });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------- Staff management

router.get('/staff', async (req, res, next) => {
  try {
    res.render('admin/staff', { title: 'Staff', people: await users.list() });
  } catch (err) {
    next(err);
  }
});

router.get('/staff/new', async (req, res, next) => {
  try {
    res.render('admin/staff-form', {
      title: 'Add staff member',
      person: { staff_id: '', name: '', department: '', role: 'staff' },
      departments: await users.departments(),
      error: null,
      isNew: true,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/staff', async (req, res, next) => {
  const person = {
    staff_id: cleanText(req.body.staff_id, 50),
    name: cleanText(req.body.name, 150),
    department: cleanText(req.body.department, 100),
    role: req.body.role === 'admin' ? 'admin' : 'staff',
  };
  const typedPassword = String(req.body.password || '');

  try {
    const fail = async (error) =>
      res.status(400).render('admin/staff-form', {
        title: 'Add staff member', person, departments: await users.departments(), error, isNew: true,
      });

    if (!STAFF_ID_RE.test(person.staff_id)) return fail('Staff ID may only use letters, numbers, dot, dash and underscore.');
    if (!person.name) return fail('Please enter the full name.');
    if (await users.staffIdExists(person.staff_id)) return fail(`Staff ID "${person.staff_id}" is already in use.`);
    if (typedPassword) {
      const problem = validatePassword(typedPassword);
      if (problem) return fail(problem);
    }

    const password = typedPassword || generateTempPassword();
    const created = await db.withTransaction(async (client) => {
      const u = await users.create(client, { ...person, staffId: person.staff_id, password });
      await audit.record(client, { adminId: req.user.id, action: 'user.create', newValue: userSnapshot(u) });
      return u;
    });

    res.render('admin/password-shown', {
      title: 'Account created',
      heading: 'Account created',
      person: created,
      password,
      generated: !typedPassword,
    });
  } catch (err) {
    if (err.code === '23505') {
      req.session.flash = { type: 'error', text: 'That Staff ID is already in use.' };
      return res.redirect('/admin/staff/new');
    }
    next(err);
  }
});

router.get('/staff/:id/edit', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const person = id && (await users.findById(id));
    if (!person) return next();
    res.render('admin/staff-form', {
      title: 'Edit staff member', person, departments: await users.departments(), error: null, isNew: false,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/staff/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const existing = id && (await users.findById(id));
    if (!existing) return next();

    const person = {
      ...existing,
      staff_id: cleanText(req.body.staff_id, 50),
      name: cleanText(req.body.name, 150),
      department: cleanText(req.body.department, 100),
    };
    const fail = async (error) =>
      res.status(400).render('admin/staff-form', {
        title: 'Edit staff member', person, departments: await users.departments(), error, isNew: false,
      });

    if (!STAFF_ID_RE.test(person.staff_id)) return fail('Staff ID may only use letters, numbers, dot, dash and underscore.');
    if (!person.name) return fail('Please enter the full name.');
    if (await users.staffIdExists(person.staff_id, id)) return fail(`Staff ID "${person.staff_id}" is already in use.`);

    await db.withTransaction(async (client) => {
      const updated = await users.update(client, id, {
        staffId: person.staff_id, name: person.name, department: person.department,
      });
      await audit.record(client, {
        adminId: req.user.id, action: 'user.update', oldValue: userSnapshot(existing), newValue: userSnapshot(updated),
      });
    });
    req.session.flash = { type: 'success', text: `Saved changes for ${person.name}.` };
    res.redirect('/admin/staff');
  } catch (err) {
    next(err);
  }
});

async function setActive(req, res, next, active) {
  try {
    const id = parseId(req.params.id);
    const existing = id && (await users.findById(id));
    if (!existing) return next();
    if (existing.id === req.user.id) {
      req.session.flash = { type: 'error', text: 'You cannot deactivate your own account.' };
      return res.redirect('/admin/staff');
    }
    await db.withTransaction(async (client) => {
      const updated = await users.setActive(client, id, active);
      await audit.record(client, {
        adminId: req.user.id,
        action: active ? 'user.activate' : 'user.deactivate',
        oldValue: userSnapshot(existing),
        newValue: userSnapshot(updated),
      });
    });
    req.session.flash = {
      type: 'success',
      text: active ? `${existing.name} can log in again.` : `${existing.name} has been deactivated and can no longer log in.`,
    };
    res.redirect('/admin/staff');
  } catch (err) {
    next(err);
  }
}

router.post('/staff/:id/deactivate', (req, res, next) => setActive(req, res, next, false));
router.post('/staff/:id/activate', (req, res, next) => setActive(req, res, next, true));

router.post('/staff/:id/reset-password', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const person = id && (await users.findById(id));
    if (!person) return next();
    if (person.id === req.user.id) {
      req.session.flash = { type: 'error', text: 'To change your own password, use "Change password".' };
      return res.redirect('/admin/staff');
    }
    const password = generateTempPassword();
    await db.withTransaction(async (client) => {
      await users.setPassword(client, id, password, { temporary: true });
      // The password itself is never written to the audit log.
      await audit.record(client, { adminId: req.user.id, action: 'user.reset_password', newValue: userSnapshot(person) });
    });
    res.render('admin/password-shown', {
      title: 'Password reset', heading: 'Password reset', person, password, generated: true,
    });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------- Attendance records

router.get('/records', async (req, res, next) => {
  try {
    const filters = parseFilters(req.query);
    const { rows, truncated } = await attendance.search({
      start: filters.range.start, end: filters.range.end, userId: filters.userId, limit: DISPLAY_LIMIT,
    });
    const totalMinutes = rows.reduce((s, r) => s + (r.minutes || 0), 0);
    res.render('admin/records', {
      title: 'Attendance records',
      filters,
      rows,
      truncated,
      displayLimit: DISPLAY_LIMIT,
      totalMinutes,
      staff: await users.listStaff(),
    });
  } catch (err) {
    next(err);
  }
});

async function exportRows(req) {
  const filters = parseFilters(req.query);
  const { rows } = await attendance.search({ start: filters.range.start, end: filters.range.end, userId: filters.userId });
  rows.reverse(); // oldest first in files
  let who = 'all-staff';
  if (filters.userId) {
    const u = await users.findById(filters.userId);
    if (u) who = u.staff_id.replace(/[^A-Za-z0-9._-]/g, '');
  }
  return { rows, filters, base: `attendance_${who}_${filters.fileLabel}` };
}

router.get('/records/export.csv', async (req, res, next) => {
  try {
    const { rows, base } = await exportRows(req);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${base}.csv"`);
    res.send(exporter.toCsv(rows));
  } catch (err) {
    next(err);
  }
});

router.get('/records/export.xlsx', async (req, res, next) => {
  try {
    const { rows, filters, base } = await exportRows(req);
    const buf = await exporter.toXlsx(rows, { title: `Attendance – ${filters.label}` });
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="${base}.xlsx"`);
    res.send(Buffer.from(buf));
  } catch (err) {
    next(err);
  }
});

function renderEdit(res, entry, history, error, form, back) {
  res.status(error ? 400 : 200).render('admin/record-edit', {
    title: 'Correct entry', entry, history, error, back,
    form: form || {
      in_date: time.dateKey(entry.sign_in_at),
      in_time: time.timeValue(entry.sign_in_at),
      out_date: entry.sign_out_at ? time.dateKey(entry.sign_out_at) : '',
      out_time: entry.sign_out_at ? time.timeValue(entry.sign_out_at) : '',
      note: entry.note || '',
    },
  });
}

/** Only allow going back to the records list (never an arbitrary URL). */
function safeBack(value) {
  const v = String(value || '');
  return v.startsWith('/admin/records?') || v === '/admin/records' ? v : '/admin/records';
}

router.get('/records/:id/edit', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const entry = id && (await attendance.findById(id));
    if (!entry) return next();
    renderEdit(res, entry, await audit.list({ attendanceId: id }), null, null, safeBack(req.query.back));
  } catch (err) {
    next(err);
  }
});

router.post('/records/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  const back = safeBack(req.body.back);
  const form = {
    in_date: String(req.body.in_date || ''),
    in_time: String(req.body.in_time || ''),
    out_date: String(req.body.out_date || ''),
    out_time: String(req.body.out_time || ''),
    note: String(req.body.note || '').trim().slice(0, 500),
  };
  try {
    const entry = id && (await attendance.findById(id));
    if (!entry) return next();
    const fail = async (msg) => renderEdit(res, entry, await audit.list({ attendanceId: id }), msg, form, back);

    const signInAt = time.localToDate(form.in_date, form.in_time);
    if (!signInAt) return fail('Please enter a valid sign-in date and time.');
    let signOutAt = null;
    if (form.out_time || form.out_date) {
      signOutAt = time.localToDate(form.out_date || form.in_date, form.out_time);
      if (!signOutAt) return fail('Please enter a valid sign-out date and time, or leave both empty.');
    }

    try {
      await attendance.adminUpdate(id, { signInAt, signOutAt, note: form.note }, req.user.id);
    } catch (err) {
      if (err.isUserError) return fail(err.message);
      if (err.code === '23505') return fail('This person already has another entry without a sign-out time.');
      throw err;
    }
    req.session.flash = { type: 'success', text: `Entry for ${entry.name} updated. The change is recorded in the audit log.` };
    res.redirect(back);
  } catch (err) {
    next(err);
  }
});

router.post('/records/:id/delete', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return next();
    try {
      const deleted = await attendance.adminDelete(id, req.user.id);
      req.session.flash = {
        type: 'success',
        text: `Deleted the entry for ${deleted.name} on ${time.fmtDate(deleted.sign_in_at)}. This is recorded in the audit log.`,
      };
    } catch (err) {
      if (!err.isUserError) throw err;
      req.session.flash = { type: 'error', text: err.message };
    }
    res.redirect(safeBack(req.body.back));
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------- Daily summary

router.get('/summary', async (req, res, next) => {
  try {
    const day = time.isValidDateKey(req.query.date) ? req.query.date : time.todayKey();
    const summary = await attendance.dailySummary(day);
    res.render('admin/summary', {
      title: 'Daily summary',
      day,
      dayLabel: time.fmtDate(time.dayRange(day).start),
      isToday: day === time.todayKey(),
      summary,
    });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------ Audit log

router.get('/audit', async (req, res, next) => {
  try {
    const PAGE = 100;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const [entries, total] = await Promise.all([audit.list({ limit: PAGE, offset: (page - 1) * PAGE }), audit.count()]);
    res.render('admin/audit', {
      title: 'Audit log', entries, page, pages: Math.max(1, Math.ceil(total / PAGE)), total,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
