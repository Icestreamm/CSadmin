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
      Prefer: "return=representation",
    },
    body: JSON.stringify(params),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.message || data.error || `RPC ${name} failed`);
  }
  return data;
}

function mapAuditRowsToActivity(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    kind: "admin",
    action: row.action,
    summary: row.note || row.action || "Admin event",
    created_at: row.created_at,
    meta: {
      previous_value: row.previous_value,
      new_value: row.new_value,
    },
  }));
}

async function fetchUserActivity(targetUserId, limit) {
  try {
    const rows = await supabaseRpc("admin_user_activity_for_target", {
      p_target_user_id: targetUserId,
      p_limit: limit,
    });
    return {
      rows: Array.isArray(rows) ? rows : [],
      warning: null,
    };
  } catch (primaryError) {
    const message = String(primaryError.message || primaryError);
    if (!message.toLowerCase().includes("admin_user_activity_for_target")) {
      throw primaryError;
    }

    try {
      const fallbackRows = await supabaseRpc("admin_audit_log_for_target", {
        p_target_user_id: targetUserId,
        p_limit: Math.min(limit, 50),
      });
      return {
        rows: mapAuditRowsToActivity(fallbackRows),
        warning:
          "Full activity history unavailable. Run supabase/FIX_ADMIN_USER_HISTORY.sql in Supabase SQL Editor.",
      };
    } catch (_) {
      throw new Error(
        `${message}. Run supabase/FIX_ADMIN_USER_HISTORY.sql in Supabase SQL Editor.`,
      );
    }
  }
}

async function fetchUserReports(targetUserId, limit) {
  try {
    const rows = await supabaseRpc("admin_reports_for_target", {
      p_target_user_id: targetUserId,
      p_limit: limit,
    });
    return {
      rows: Array.isArray(rows) ? rows : [],
      warning: null,
    };
  } catch (error) {
    const message = String(error.message || error);
    if (message.toLowerCase().includes("admin_reports_for_target")) {
      return {
        rows: [],
        warning:
          "Reports list unavailable. Run supabase/FIX_ADMIN_USER_HISTORY.sql in Supabase SQL Editor.",
      };
    }
    throw error;
  }
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

const MUTATION_FIELDS = [
  "plan_type",
  "adjust_days",
  "bonus_days",
  "adjust_reports",
  "bonus_reports",
  "secondary_2_email",
  "secondary_3_email",
  "secondary_2_username",
  "secondary_3_username",
  "role",
  "manager_email",
  "manager_username",
];

async function resolveUsername(username) {
  const value = String(username || "").trim();
  if (!value) return null;
  const rows = await supabaseRpc("admin_resolve_user_by_username", {
    p_username: value,
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.user_id) {
    throw new Error(`Username not found: ${value}`);
  }
  return row;
}

async function mapUsernamesToEmails(body) {
  const out = { ...body };

  if (body.manager_username !== undefined) {
    if (!String(body.manager_username || "").trim()) {
      out.manager_email = null;
    } else {
      const row = await resolveUsername(body.manager_username);
      out.manager_email = row.email;
    }
    delete out.manager_username;
  }

  if (body.secondary_2_username !== undefined) {
    if (!String(body.secondary_2_username || "").trim()) {
      out.secondary_2_email = null;
    } else {
      const row = await resolveUsername(body.secondary_2_username);
      out.secondary_2_email = row.email;
    }
    delete out.secondary_2_username;
  }

  if (body.secondary_3_username !== undefined) {
    if (!String(body.secondary_3_username || "").trim()) {
      out.secondary_3_email = null;
    } else {
      const row = await resolveUsername(body.secondary_3_username);
      out.secondary_3_email = row.email;
    }
    delete out.secondary_3_username;
  }

  return out;
}

function presentMutations(body) {
  return MUTATION_FIELDS.filter((field) => body[field] !== undefined);
}

function prepareEdgeBody(body) {
  const edgeBody = { ...body };
  if (edgeBody.adjust_days !== undefined && edgeBody.bonus_days === undefined) {
    const delta = Math.floor(Number(edgeBody.adjust_days));
    if (delta > 0) edgeBody.bonus_days = delta;
  }
  if (edgeBody.adjust_reports !== undefined && edgeBody.bonus_reports === undefined) {
    const delta = Math.floor(Number(edgeBody.adjust_reports));
    if (delta > 0) edgeBody.bonus_reports = delta;
  }
  return edgeBody;
}

async function applyUserUpdate(body) {
  const mappedBody = await mapUsernamesToEmails(body);
  const targetUserId = String(mappedBody.target_user_id || "").trim();
  if (!targetUserId) {
    throw new Error("target_user_id required");
  }

  const mutations = presentMutations(mappedBody);

  if (mutations.length === 1 && mutations[0] === "adjust_days") {
    try {
      return await supabaseRpc("admin_adjust_user_days", {
        p_target_user_id: targetUserId,
        p_delta: Math.floor(Number(mappedBody.adjust_days)),
      });
    } catch (rpcError) {
      const delta = Math.floor(Number(mappedBody.adjust_days));
      if (delta < 0) throw rpcError;
      return invokeEdgeFunction("admin-update-user", prepareEdgeBody(mappedBody));
    }
  }

  if (mutations.length === 1 && mutations[0] === "adjust_reports") {
    try {
      return await supabaseRpc("admin_adjust_user_reports", {
        p_target_user_id: targetUserId,
        p_delta: Math.floor(Number(mappedBody.adjust_reports)),
      });
    } catch (rpcError) {
      const delta = Math.floor(Number(mappedBody.adjust_reports));
      if (delta < 0) {
        throw new Error(
          `Report deduction requires Supabase RPC admin_adjust_user_reports: ${rpcError.message}`,
        );
      }
      console.warn("admin_adjust_user_reports RPC failed, falling back to edge:", rpcError.message);
      return invokeEdgeFunction("admin-update-user", mappedBody);
    }
  }

  const edgeBody = prepareEdgeBody(mappedBody);

  try {
    return await invokeEdgeFunction("admin-update-user", edgeBody);
  } catch (error) {
    const msg = String(error.message || "");
    if (msg.toLowerCase().includes("no changes") && mappedBody.adjust_days !== undefined) {
      return supabaseRpc("admin_adjust_user_days", {
        p_target_user_id: targetUserId,
        p_delta: Math.floor(Number(mappedBody.adjust_days)),
      });
    }
    if (msg.toLowerCase().includes("no changes") && mappedBody.adjust_reports !== undefined) {
      return supabaseRpc("admin_adjust_user_reports", {
        p_target_user_id: targetUserId,
        p_delta: Math.floor(Number(mappedBody.adjust_reports)),
      });
    }
    throw error;
  }
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
    const { rows, warning } = await fetchUserActivity(targetUserId, limit);
    return res.json({ rows, warning });
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
    const subscription = await supabaseRpc("admin_subscription_for_target", {
      p_target_user_id: targetUserId,
    });
    const [activityResult, reportsResult] = await Promise.all([
      fetchUserActivity(targetUserId, activityLimit),
      fetchUserReports(targetUserId, reportsLimit),
    ]);
    const warnings = [activityResult.warning, reportsResult.warning].filter(Boolean);
    return res.json({
      subscription: subscription || {},
      activity: activityResult.rows,
      reports: reportsResult.rows,
      warning: warnings.length ? warnings.join(" ") : null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/employee-invites", authMiddleware, async (req, res) => {
  const targetUserId = String(req.query.targetUserId || "").trim();
  if (!targetUserId) {
    return res.status(400).json({ error: "targetUserId is required" });
  }

  try {
    const data = await supabaseRpc("admin_manager_employee_invites", {
      p_manager_user_id: targetUserId,
    });
    return res.json(data || { slots: [] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/employee-invite", authMiddleware, async (req, res) => {
  const targetUserId = String(req.body?.target_user_id || "").trim();
  const slot = Number(req.body?.slot);
  const cancel = req.body?.cancel === true;
  const email = cancel ? null : String(req.body?.email || "").trim() || null;

  if (!targetUserId) {
    return res.status(400).json({ error: "target_user_id required" });
  }
  if (![1, 2].includes(slot)) {
    return res.status(400).json({ error: "slot must be 1 or 2" });
  }
  if (!cancel && !email) {
    return res.status(400).json({ error: "employee email required" });
  }
  if (!cancel && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "enter a valid email address" });
  }

  try {
    const saveResult = await supabaseRpc("admin_save_employee_invite", {
      p_manager_user_id: targetUserId,
      p_slot: slot,
      p_email: email,
    });

    if (saveResult?.cancelled) {
      return res.json({ ok: true, cancelled: true, slot });
    }

    const inviteId = saveResult?.invite_id;
    if (!inviteId) {
      return res.status(500).json({ error: "Invite was not created" });
    }

    try {
      const sendResult = await invokeEdgeFunction("send-employee-invite", {
        invite_id: inviteId,
      });
      return res.json({
        ok: true,
        invite: saveResult,
        email_sent: Boolean(sendResult.email_sent),
        accept_link: sendResult.accept_link || null,
      });
    } catch (sendErr) {
      return res.json({
        ok: true,
        invite: saveResult,
        email_sent: false,
        warning: `Invite saved but email failed: ${sendErr.message}`,
      });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/update-user", authMiddleware, async (req, res) => {
  try {
    const result = await applyUserUpdate(req.body || {});
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
