const path = require('path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');

const config = require('./config');
const { pool } = require('./db');
const csrf = require('./middleware/csrf');
const { loadUser } = require('./middleware/auth');
const time = require('./lib/time');

const authRoutes = require('./routes/auth');
const staffRoutes = require('./routes/staff');
const adminRoutes = require('./routes/admin');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: config.isProduction ? '1d' : 0 }));

// Defaults for every view, set first so even early error pages can render.
app.use((req, res, next) => {
  res.locals.time = time;
  res.locals.path = req.path;
  res.locals.user = null;
  res.locals.flash = null;
  res.locals.csrfToken = '';
  next();
});
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

app.use(
  session({
    store: new PgSession({ pool, tableName: 'user_sessions', pruneSessionInterval: 15 * 60 }),
    name: 'attendance.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true, // every request pushes the expiry forward => expires after inactivity
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: config.sessionIdleMinutes * 60 * 1000,
    },
  })
);

// Pages must never be cached: they show personal, time-sensitive data.
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use(csrf);
app.use(loadUser);

// One-time messages ("You signed in at 09:12 AM").
app.use((req, res, next) => {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

app.use(authRoutes);
app.use('/staff', staffRoutes);
app.use('/admin', adminRoutes);

app.get('/healthz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use((req, res) => {
  res.status(404).render('error', { title: 'Page not found', message: 'We could not find that page.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Something went wrong',
    message: 'Sorry, something went wrong on our side. Please try again in a moment.',
  });
});

module.exports = app;
