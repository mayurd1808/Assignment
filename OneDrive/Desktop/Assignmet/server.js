const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-before-deploying";
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, "data", "app.sqlite");
const PUBLIC_DIR = path.join(__dirname, "public");
const COOKIE_NAME = "round2_session";

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

const db = new DatabaseSync(DATABASE_PATH);
db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const queries = {
  createUser: "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
  findUserByEmail: "SELECT * FROM users WHERE email = ?",
  findUserById: "SELECT id, name, email, created_at FROM users WHERE id = ?",
  listNotes: "SELECT id, title, body, created_at FROM notes WHERE user_id = ? ORDER BY id DESC",
  createNote: "INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?)",
  deleteNote: "DELETE FROM notes WHERE id = ? AND user_id = ?"
};

function runQuery(name, ...params) {
  return db.prepare(queries[name]).run(...params);
}

function getQuery(name, ...params) {
  return db.prepare(queries[name]).get(...params);
}

function allQuery(name, ...params) {
  return db.prepare(queries[name]).all(...params);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, originalHash] = storedHash.split(":");
  const candidateHash = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(candidateHash, "hex"), Buffer.from(originalHash, "hex"));
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function createSessionCookie(userId) {
  const payload = JSON.stringify({ userId, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 });
  const encodedPayload = Buffer.from(payload).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter(([name, value]) => name && value)
  );
}

function getSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || sign(encodedPayload) !== signature) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload.userId || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON payload."));
      }
    });
    req.on("error", reject);
  });
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getCurrentUser(req) {
  const session = getSession(req);
  if (!session) return null;
  return getQuery("findUserById", session.userId) || null;
}

async function requireUser(req, res) {
  const user = getCurrentUser(req);
  if (!user) {
    sendError(res, 401, "Please log in to continue.");
    return null;
  }
  return user;
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, database: "sqlite", time: new Date().toISOString() });
  }

  if (req.method === "GET" && pathname === "/api/me") {
    const user = getCurrentUser(req);
    return sendJson(res, 200, { user });
  }

  if (req.method === "POST" && pathname === "/api/signup") {
    const body = await readBody(req);
    const name = cleanString(body.name);
    const email = cleanString(body.email).toLowerCase();
    const password = cleanString(body.password);

    if (name.length < 2) return sendError(res, 400, "Name must be at least 2 characters.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendError(res, 400, "Enter a valid email address.");
    if (password.length < 8) return sendError(res, 400, "Password must be at least 8 characters.");

    try {
      const result = runQuery("createUser", name, email, hashPassword(password));
      const token = createSessionCookie(result.lastInsertRowid);
      return sendJson(res, 201, { user: getQuery("findUserById", result.lastInsertRowid) }, {
        "Set-Cookie": `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
      });
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) return sendError(res, 409, "An account already exists for this email.");
      throw error;
    }
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await readBody(req);
    const email = cleanString(body.email).toLowerCase();
    const password = cleanString(body.password);
    const user = getQuery("findUserByEmail", email);

    if (!user || !verifyPassword(password, user.password_hash)) {
      return sendError(res, 401, "Invalid email or password.");
    }

    const token = createSessionCookie(user.id);
    return sendJson(res, 200, { user: getQuery("findUserById", user.id) }, {
      "Set-Cookie": `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
    });
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    return sendJson(res, 200, { ok: true }, {
      "Set-Cookie": `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
    });
  }

  if (req.method === "GET" && pathname === "/api/notes") {
    const user = await requireUser(req, res);
    if (!user) return;
    return sendJson(res, 200, { notes: allQuery("listNotes", user.id) });
  }

  if (req.method === "POST" && pathname === "/api/notes") {
    const user = await requireUser(req, res);
    if (!user) return;

    const body = await readBody(req);
    const title = cleanString(body.title);
    const noteBody = cleanString(body.body);
    if (!title || !noteBody) return sendError(res, 400, "Both title and note are required.");

    runQuery("createNote", user.id, title.slice(0, 120), noteBody.slice(0, 2000));
    return sendJson(res, 201, { notes: allQuery("listNotes", user.id) });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/notes/")) {
    const user = await requireUser(req, res);
    if (!user) return;

    const id = Number(pathname.split("/").at(-1));
    if (!Number.isInteger(id)) return sendError(res, 400, "Invalid note id.");

    runQuery("deleteNote", id, user.id);
    return sendJson(res, 200, { notes: allQuery("listNotes", user.id) });
  }

  sendError(res, 404, "API route not found.");
}

function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, file) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) {
          res.writeHead(404);
          return res.end("Not found");
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fallback);
      });
      return;
    }

    const extension = path.extname(filePath);
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    };

    res.writeHead(200, { "Content-Type": contentTypes[extension] || "application/octet-stream" });
    res.end(file);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
      return;
    }

    serveStatic(req, res, pathname);
  } catch (error) {
    console.error(error);
    sendError(res, 500, "Something went wrong on the server.");
  }
});

server.listen(PORT, () => {
  console.log(`Round 2 auth website running on http://localhost:${PORT}`);
  console.log(`SQLite database: ${DATABASE_PATH}`);
});
