const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 8787);

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY,
  ADMIN_SUPABASE_EMAIL,
  ADMIN_SUPABASE_PASSWORD,
  ADMIN_PAGE_PASSWORD,
  ADMIN_PAGE_PASSWORD_HASH,
  ADMIN_SESSION_TTL_MINUTES,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
}
if (!ADMIN_SUPABASE_EMAIL || !ADMIN_SUPABASE_PASSWORD) {
  console.error("Missing ADMIN_SUPABASE_EMAIL or ADMIN_SUPABASE_PASSWORD");
}

const sessionTtlMs = Number(ADMIN_SESSION_TTL_MINUTES || 120) * 60 * 1000;
const sessions = new Map();
let adminAuthCache = null;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

function sha256(input) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function passwordMatches(password) {
  if (ADMIN_PAGE_PASSWORD_HASH) {
    return sha256(password) === ADMIN_PAGE_PASSWORD_HASH.toLowerCase();
  }
  if (ADMIN_PAGE_PASSWORD) {
    return password === ADMIN_PAGE_PASSWORD;
  }
  return false;
}

function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + sessionTtlMs;
  sessions.set(token, { expiresAt });
  return { token, expiresAt };
}

function getValidSession(token) {
  const entry = sessions.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return entry;
}

function authMiddleware(req, res, next) {
  const token = req.cookies.admin_session;
  if (!token || !getValidSession(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

async function supabaseRpc(name, params = {}) {
  const adminJwt = await getAdminJwt();
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${adminJwt}`,
    },
    body: JSON.stringify(params),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.message || data.error || `RPC ${name} failed`);
  }
  return data;
}

async function invokeEdgeFunction(name, body = {}) {
  const adminJwt = await getAdminJwt();
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${adminJwt}`,
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || data.message || `Function ${name} failed`);
  }
  return data;
}

async function getAdminJwt() {
  if (adminAuthCache && adminAuthCache.expiresAtMs > Date.now() + 60 * 1000) {
    return adminAuthCache.accessToken;
  }

  const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email: ADMIN_SUPABASE_EMAIL,
      password: ADMIN_SUPABASE_PASSWORD,
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Admin auth failed");
  }

  const expiresIn = Number(data.expires_in || 3600);
  adminAuthCache = {
    accessToken: data.access_token,
    expiresAtMs: Date.now() + expiresIn * 1000,
  };
  return data.access_token;
}

app.post("/api/login", (req, res) => {
  const password = String(req.body?.password || "");
  if (!passwordMatches(password)) {
    return res.status(401).json({ error: "Invalid password" });
  }

  const session = createSession();
  res.cookie("admin_session", session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(session.expiresAt),
  });
  return res.json({ ok: true, expiresAt: session.expiresAt });
});

app.post("/api/logout", authMiddleware, (req, res) => {
  const token = req.cookies.admin_session;
  if (token) sessions.delete(token);
  res.clearCookie("admin_session");
  return res.json({ ok: true });
});

app.get("/api/session", (req, res) => {
  const token = req.cookies.admin_session;
  const session = token ? getValidSession(token) : null;
  return res.json({ authenticated: Boolean(session) });
});

app.get("/api/users", authMiddleware, async (req, res) => {
  try {
    const users = await supabaseRpc("admin_list_users_for_admin");
    return res.json({ users: Array.isArray(users) ? users : [] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/audit", authMiddleware, async (req, res) => {
  const targetUserId = String(req.query.targetUserId || "").trim();
  const limit = Number(req.query.limit || 50);
  if (!targetUserId) {
    return res.status(400).json({ error: "targetUserId is required" });
  }

  try {
    const rows = await supabaseRpc("admin_user_activity_for_target", {
      p_target_user_id: targetUserId,
      p_limit: limit,
    });
    return res.json({ rows: Array.isArray(rows) ? rows : [] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/user-detail", authMiddleware, async (req, res) => {
  const targetUserId = String(req.query.targetUserId || "").trim();
  const activityLimit = Number(req.query.activityLimit || 50);
  const reportsLimit = Number(req.query.reportsLimit || 100);
  if (!targetUserId) {
    return res.status(400).json({ error: "targetUserId is required" });
  }

  try {
    const [subscription, activity, reports] = await Promise.all([
      supabaseRpc("admin_subscription_for_target", {
        p_target_user_id: targetUserId,
      }),
      supabaseRpc("admin_user_activity_for_target", {
        p_target_user_id: targetUserId,
        p_limit: activityLimit,
      }),
      supabaseRpc("admin_reports_for_target", {
        p_target_user_id: targetUserId,
        p_limit: reportsLimit,
      }),
    ]);
    return res.json({
      subscription: subscription || {},
      activity: Array.isArray(activity) ? activity : [],
      reports: Array.isArray(reports) ? reports : [],
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/update-user", authMiddleware, async (req, res) => {
  try {
    const result = await invokeEdgeFunction("admin-update-user", req.body || {});
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Admin web panel running on http://localhost:${port}`);
});
