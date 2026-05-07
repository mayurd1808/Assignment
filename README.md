# Round 2 Assignment: Full-Stack Auth Website

VaultBoard is a deployable full-stack website with real user authentication, a backend API, and SQLite database storage.

## Features

- Signup and login with server-side validation
- Password hashing with PBKDF2
- Signed HTTP-only session cookies
- SQLite database with `users` and `notes` tables
- Authenticated CRUD-style note storage
- Static frontend served by the Node backend
- Render deployment configuration included

## Run Locally

```bash
npm start
```

Open `http://localhost:3000`.

The database is created automatically at `data/app.sqlite`.

## API Routes

- `POST /api/signup`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `GET /api/notes`
- `POST /api/notes`
- `DELETE /api/notes/:id`
- `GET /api/health`

## Deployment

This project includes `render.yaml` for Render deployment.

1. Push the project to GitHub.
2. Create a new Render Blueprint from the repository.
3. Render will use `npm start`, generate `SESSION_SECRET`, and mount a persistent SQLite disk at `/var/data`.
4. After deployment, open the Render URL and test signup/login.

For other platforms, set these environment variables:

```bash
PORT=3000
SESSION_SECRET=your-long-random-secret
DATABASE_PATH=/persistent/path/app.sqlite
```
