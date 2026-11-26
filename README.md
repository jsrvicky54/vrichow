# Office Attendance

A simple web app that replaces the paper attendance logbook. Staff sign in when
they arrive and sign out when they leave, from a phone or a computer. Every
time is saved in PostgreSQL, and an admin can see, correct and export all
records.

**Stack:** Node.js + Express + PostgreSQL, with server-rendered pages (EJS).
There is no front-end build step and no framework to learn, which keeps it easy
to run and maintain.

---

## Features

**Staff**
- Log in with Staff ID and password.
- See the current time (from the server), today's date and their status.
- One big **Sign in** / **Sign out** button. Signing in twice is impossible
  (blocked in the app *and* by a database constraint).
- If they forgot to sign out on an earlier day, they must enter the time they
  left before they can sign in again. That entry is marked **entered later**.
- Monthly history: date, sign-in, sign-out, hours worked and the monthly total.
- Can change their own password. Can only ever see their own records.

**Admin**
- **Dashboard**: who is in the office right now and since when, plus anyone who
  forgot to sign out on an earlier day.
- **Staff**: add staff (name, Staff ID, department), edit, deactivate /
  reactivate, reset passwords (a temporary password is shown once).
- **Records**: filter by month or date range, and by person. Shows sign-in,
  sign-out, hours and notes. Download as **CSV** or **Excel**.
- **Correct or delete** any entry. Every change is written to the **audit log**
  (who, what, when, old and new values).
- **Daily summary**: present, absent and late arrivals (first sign-in after
  10:00 AM by default).
- **Department E-Books**: admins can upload private DOC, DOCX, PDF and XLSX
  files up to 3 MB; staff can access files only when their department matches.
  XLSX workbooks and DOCX documents can be edited in the browser when
  ONLYOFFICE Docs is configured.

To enable workbook editing, deploy an HTTPS ONLYOFFICE Docs server and set
`ONLYOFFICE_DOCS_URL` plus a random 32-byte `ONLYOFFICE_JWT_SECRET` in the
application environment (for Vercel, add both to the project's Environment
Variables and redeploy). Configure the same JWT secret on the Docs server.
Set `APP_BASE_URL` to the public portal URL if the
editor server cannot reach the request host. The portal signs editor and
callback tokens, checks staff department access, and saves edited XLSX files
back into PostgreSQL. Without the Docs server and secret, E-Books remain
downloadable and the editor button stays hidden.

**Security**
- Passwords hashed with **bcrypt** (12 rounds). Never stored in plain text.
- No public sign-up. Only an admin can create accounts.
- New accounts and reset passwords are temporary: the person must choose their
  own password on first login.
- Sessions stored in PostgreSQL and **expire after 30 minutes of inactivity**
  (configurable).
- **Login rate limiting**: per account (5 failed tries / 15 min) and per IP
  (20 failed tries / 15 min). Only failures count, so a whole office behind one
  internet connection can still log in normally.
- CSRF protection on every form, secure HTTP headers (Helmet, strict Content
  Security Policy), session-fixation protection, HttpOnly/SameSite cookies
  (Secure in production).
- Deactivating someone or resetting their password logs them out everywhere
  immediately.
- CSV/Excel exports are protected against formula injection.

**Time zone**: all times are stored in **UTC** and shown in **Asia/Kolkata**
(configurable with `APP_TIMEZONE`). The sign-in/out time always comes from the
database server clock, never from the user's device.

---

## Folder structure

```
office-attendance/
├── db/
│   └── migrations/
│       └── 001_init.sql        # tables, indexes and constraints
├── public/
│   ├── css/style.css           # all styles (mobile-first)
│   └── js/app.js               # live clock, menu, confirm dialogs
├── scripts/
│   ├── migrate.js              # applies db/migrations/*.sql
│   └── create-admin.js         # creates the first admin account
├── src/
│   ├── server.js               # starts the web server
│   ├── app.js                  # Express setup: security, sessions, routes
│   ├── config.js               # reads settings from .env
│   ├── db.js                   # PostgreSQL pool + transaction helper
│   ├── lib/                    # time zone helpers, passwords, exports, errors
│   ├── middleware/             # login checks, CSRF, rate limiting
│   ├── services/               # database logic (users, attendance, audit log)
│   ├── routes/                 # auth.js, staff.js, admin.js
│   └── views/                  # EJS pages (staff/, admin/, partials/)
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── package.json
```

### Database tables

| Table | Purpose |
|---|---|
| `users` | `id, staff_id, name, department, role, password_hash, active, created_at` + `must_change_password`, `password_changed_at` |
| `attendance` | `id, user_id, sign_in_at, sign_out_at, entered_late, edited_by, created_at, updated_at` + `note` |
| `audit_log` | `id, admin_id, attendance_id, action, old_value, new_value, created_at` (values stored as JSON) |
| `user_sessions` | login sessions |
| `schema_migrations` | which migration files have been applied |

Key rules enforced by the database itself:
- Only **one open entry per person** (partial unique index), so double sign-in
  is impossible even if someone taps the button twice very fast.
- `sign_out_at` must be after `sign_in_at`.
- Staff IDs are unique, ignoring upper/lower case.

---

## Run it locally

### 1. Install the requirements

- **Node.js 18 or newer** — <https://nodejs.org>
- **PostgreSQL 13 or newer** — either install it from
  <https://www.postgresql.org/download/>, or run it with Docker:

  ```bash
  docker run -d --name attendance-db -e POSTGRES_USER=attendance -e POSTGRES_PASSWORD=attendance -e POSTGRES_DB=attendance -p 5432:5432 postgres:16-alpine
  ```

If you installed PostgreSQL yourself, create the database and user once
(in `psql` as the `postgres` user):

```sql
CREATE USER attendance WITH PASSWORD 'attendance';
CREATE DATABASE attendance OWNER attendance;
```

### 2. Get the code and install packages

```bash
cd office-attendance
```

```bash
npm install
```

### 3. Configure

> Step-by-step help for this part, with an explanation of every setting and common errors: **[ENV_SETUP.md](ENV_SETUP.md)**

Copy the example settings file:

```bash
cp .env.example .env
```

(On Windows PowerShell: `Copy-Item .env.example .env`)

Open `.env` and set at least:
- `DATABASE_URL` — your PostgreSQL connection string.
- `SESSION_SECRET` — a long random string. Generate one with:

  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

### 4. Create the tables

```bash
npm run migrate
```

Safe to run again at any time; it only applies new migrations.

### 5. Create the first admin account

```bash
npm run create-admin
```

It asks for a login ID (e.g. `admin`), a name and a password. You can also run
it without prompts:

```bash
ADMIN_ID=admin ADMIN_NAME="Office Admin" ADMIN_PASSWORD='ChooseAStrongPassword1' npm run create-admin
```

Running it again with an existing admin ID resets that admin's password, which
is how you recover if the admin forgets theirs.

### 6. Start the app

```bash
npm start
```

Open <http://localhost:3000>, log in as the admin, go to **Staff → Add staff
member**, and give each person their Staff ID and temporary password.

For development with auto-restart on file changes, use `npm run dev`.

---

## Settings (`.env`)

| Setting | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `DATABASE_SSL` | `false` | Set `true` for hosted databases that need SSL |
| `SESSION_SECRET` | — | Long random string (required) |
| `SESSION_IDLE_MINUTES` | `30` | Log out after this many minutes without activity |
| `PORT` | `3000` | Web server port |
| `NODE_ENV` | `development` | Use `production` when deployed (enables HTTPS-only cookies) |
| `TRUST_PROXY` | `0` | Set `1` behind a reverse proxy / load balancer |
| `APP_TIMEZONE` | `Asia/Kolkata` | Time zone used to display times and decide "which day" |
| `LATE_AFTER` | `10:00` | First sign-in after this time (24h) counts as late |
| `LOGIN_MAX_PER_IP` | `20` | Failed logins allowed per IP per 15 minutes |
| `LOGIN_MAX_FAILS_PER_ACCOUNT` | `5` | Failed logins allowed per Staff ID per 15 minutes |

---

## Deploy

The app must run over **HTTPS** in production (passwords are sent at login).
Always set `NODE_ENV=production` and a strong `SESSION_SECRET`.

### Option A: Your own server with Docker Compose

On a Linux server with Docker installed:

1. Copy the project to the server.
2. Create a `.env` file next to `docker-compose.yml`:

   ```
   SESSION_SECRET=<long random string>
   POSTGRES_PASSWORD=<strong database password>
   TRUST_PROXY=1
   ```

3. Start everything (database migrations run automatically on start):

   ```bash
   docker compose up -d --build
   ```

4. Create the first admin:

   ```bash
   docker compose exec app node scripts/create-admin.js
   ```

5. Put a reverse proxy with HTTPS in front of port 3000. The simplest is
   [Caddy](https://caddyserver.com), which gets certificates automatically.
   A one-line `Caddyfile`:

   ```
   attendance.yourcompany.com {
       reverse_proxy localhost:3000
   }
   ```

**Backups:** schedule a daily database dump, for example:

```bash
docker compose exec -T db pg_dump -U attendance attendance > backup-$(date +%F).sql
```

### Option B: A managed platform (Render, Railway, Fly.io, etc.)

1. Create a managed **PostgreSQL** database on the platform and copy its
   connection string.
2. Create a **web service** from this repository:
   - Build command: `npm ci --omit=dev`
   - Start command: `npm run migrate && npm start`
3. Set environment variables: `DATABASE_URL`, `DATABASE_SSL=true` (if the
   database needs SSL), `SESSION_SECRET`, `NODE_ENV=production`,
   `TRUST_PROXY=1`.
4. After the first deploy, open the platform's shell for the service and run
   `npm run create-admin`.

These platforms provide HTTPS automatically. The `/healthz` URL returns
`{"ok":true}` when the app and database are working; use it as the health
check.

> **Note on rate limiting:** login attempt counters are kept in memory, which
> is right for a single app instance (the normal setup for one office). If you
> ever run several instances, switch `express-rate-limit` to a shared store
> such as Redis.

---

## How it handles common situations

| Situation | What happens |
|---|---|
| Taps **Sign in** twice quickly | Only one sign-in is recorded. |
| Forgot to sign out yesterday | Next visit asks "What time did you leave?" Entry is marked *entered later* and shown that way to the admin. |
| Leaves the page open overnight | The page reloads itself at midnight so the status is current. |
| Leaves the browser idle | Logged out after `SESSION_IDLE_MINUTES`, with a message saying why. |
| Forgot password | Admin uses **Staff → Reset password** and gives them the temporary password. |
| Person leaves the company | Admin **deactivates** them. They can no longer log in; their records are kept. |
| Wrong time recorded | Admin opens the entry from **Records → Edit**, corrects it and adds a note. The change is recorded in the audit log. |

**Known limits** (easy to extend later): no holiday/weekend calendar (the daily
summary counts everyone not signed in as absent), and a shift that crosses
midnight is treated as "forgot to sign out" the next day.
