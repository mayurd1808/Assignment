# Secure Notes

Secure Notes is a full-stack web app for creating a private account and saving personal notes securely. It includes real authentication, a Node.js backend API, and SQLite database storage.

## Features

- User signup and login
- Password hashing with PBKDF2
- Signed HTTP-only session cookies
- SQLite database integration
- Private notes linked to each user account
- Create, view, and delete saved notes
- Responsive frontend served by the backend
- Render deployment configuration included

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js HTTP server
- Database: SQLite
- Authentication: Hashed passwords and signed cookies
- Deployment: Render

## Run Locally

```bash
npm start
```

Open:

```text
http://localhost:3000
```

The database is created automatically at:

```text
data/app.sqlite
```

## Environment Variables

Create a `.env` file or configure these values in your hosting platform:

```bash
PORT=3000
SESSION_SECRET=your-long-random-secret
DATABASE_PATH=./data/app.sqlite
```

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

This project includes `render.yaml` for deploying on Render.

1. Push the project to GitHub.
2. Create a new Render Blueprint from the repository.
3. Render will run `npm start` and generate `SESSION_SECRET`.
4. Open the deployed URL and test signup, login, and note storage.

On Render's free plan, SQLite works but data may reset after restarts or redeploys. For permanent production storage, use a persistent disk or a hosted database such as PostgreSQL.