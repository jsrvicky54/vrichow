# Setting up the `.env` file

The app reads its settings (database, secret key, office rules) from a file
named **`.env`** in the `office-attendance` folder. Follow these steps once.

> **Never share your `.env` file or upload it to GitHub.** It contains your
> database password and secret key. It is already listed in `.gitignore`.

---

## Step 1: Create the `.env` file

Open a terminal **inside the `office-attendance` folder** (next to
`package.json`) and copy the example file:

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Mac / Linux / Git Bash:

```bash
cp .env.example .env
```

The file must be named exactly `.env`, with the dot at the start and no `.txt`
at the end. On Windows, turn on **View → File name extensions** in File
Explorer to check.

---

## Step 2: Create the PostgreSQL database

1. Install PostgreSQL from <https://www.postgresql.org/download/>. Remember the
   password you set for the `postgres` user during installation.
2. Open **SQL Shell (psql)** from the Start menu. Press Enter to accept the
   defaults, then type the `postgres` password.
3. Run these two lines:

   ```sql
   CREATE USER attendance WITH PASSWORD 'attendance';
   CREATE DATABASE attendance OWNER attendance;
   ```

   You can use your own password instead of `'attendance'`. If you do, use the
   same password in Step 3.

**Using Docker instead?** This one command does all of Step 2:

```bash
docker run -d --name attendance-db -e POSTGRES_USER=attendance -e POSTGRES_PASSWORD=attendance -e POSTGRES_DB=attendance -p 5432:5432 postgres:16-alpine
```

---

## Step 3: Set `DATABASE_URL`

Open `.env` in any text editor (Notepad, VS Code) and find this line:

```
DATABASE_URL=postgres://attendance:attendance@localhost:5432/attendance
```

The format is:

```
postgres://USER:PASSWORD@HOST:PORT/DATABASE
```

| Part | Value from Step 2 |
|---|---|
| USER | `attendance` |
| PASSWORD | `attendance` (or the password you chose) |
| HOST | `localhost` (the database is on this computer) |
| PORT | `5432` (PostgreSQL's default) |
| DATABASE | `attendance` |

If you used the commands from Step 2 exactly, the line is already correct.

If your password contains special characters such as `@ : / # ?`, either
choose a simpler password or URL-encode them (for example `@` becomes `%40`).

---

## Step 4: Create your own `SESSION_SECRET`

This secret protects logins. Every installation needs its own.

1. In the terminal, run:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

2. It prints a long line of letters and numbers. Copy it.
3. In `.env`, replace `change-me-to-a-long-random-string` with what you copied:

   ```
   SESSION_SECRET=3f9a1c...your-long-random-text...e72b
   ```

   Don't add spaces or quotes.

---

## Step 5: Check the other settings

The defaults are fine for running on your own computer. Change them only if
needed:

| Setting | Default | What it does |
|---|---|---|
| `DATABASE_SSL` | `false` | Set to `true` if you use a cloud database (Render, Railway, Neon, Supabase). |
| `SESSION_IDLE_MINUTES` | `30` | People are logged out after this many minutes of no activity. |
| `PORT` | `3000` | The site opens at `http://localhost:3000`. |
| `NODE_ENV` | `development` | Change to `production` when the site is live on the internet with HTTPS. |
| `TRUST_PROXY` | `0` | Change to `1` when hosted behind a proxy or on a platform like Render or Railway. |
| `APP_TIMEZONE` | `Asia/Kolkata` | Office time zone. Times are shown in this zone. |
| `LATE_AFTER` | `10:00` | A first sign-in after this time (24-hour format) counts as **late**. |
| `LOGIN_MAX_PER_IP` | `20` | Failed logins allowed from one network per 15 minutes. |
| `LOGIN_MAX_FAILS_PER_ACCOUNT` | `5` | Failed logins allowed for one Staff ID per 15 minutes. |

Save the file.

---

## Step 6: Start the app

In the terminal, inside the `office-attendance` folder, run these one at a
time:

```bash
npm install
```

```bash
npm run migrate
```

```bash
npm run create-admin
```

```bash
npm start
```

- `npm install` downloads the packages the app needs.
- `npm run migrate` creates the database tables.
- `npm run create-admin` asks for an admin login ID, name and password.
- `npm start` starts the website.

Open **<http://localhost:3000>** and log in with the admin account you just
created. Then go to **Staff → Add staff member** to add employees.

---

## Example of a finished `.env`

```
DATABASE_URL=postgres://attendance:attendance@localhost:5432/attendance
DATABASE_SSL=false
SESSION_SECRET=3f9a1c7be04d5a62c8e1f0b9d47a26e5c3b8f1d09a7e4c62b5d8f3a1e9c07b4d2f6a8e1c5b3d97f0
SESSION_IDLE_MINUTES=30
PORT=3000
NODE_ENV=development
TRUST_PROXY=0
APP_TIMEZONE=Asia/Kolkata
LATE_AFTER=10:00
LOGIN_MAX_PER_IP=20
LOGIN_MAX_FAILS_PER_ACCOUNT=5
```

(Don't copy this `SESSION_SECRET`. Generate your own in Step 4.)

---

## Common problems

| Error message | Fix |
|---|---|
| `Missing required environment variable DATABASE_URL` | The `.env` file is missing, has the wrong name (e.g. `.env.txt`), or is in the wrong folder. Go back to Step 1. |
| `password authentication failed for user "attendance"` | The password in `DATABASE_URL` doesn't match the one from Step 2. |
| `database "attendance" does not exist` | The database wasn't created. Repeat Step 2. |
| `connect ECONNREFUSED 127.0.0.1:5432` | PostgreSQL isn't running. Start it (Windows: **Services → postgresql**), or start the Docker container. |
| `SESSION_SECRET must be a long random string` | You set `NODE_ENV=production` but kept the example secret. Do Step 4. |
| `Port 3000 is already in use` / `EADDRINUSE` | Another program uses port 3000. Set `PORT=3001` and open `http://localhost:3001`. |
