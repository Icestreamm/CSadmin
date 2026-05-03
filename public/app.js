const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const logoutBtn = document.getElementById("logoutBtn");
const usersTable = document.getElementById("usersTable");
const searchInput = document.getElementById("searchInput");
const editForm = document.getElementById("editForm");
const saveMessage = document.getElementById("saveMessage");
const auditList = document.getElementById("auditList");

const targetUserId = document.getElementById("targetUserId");
const email = document.getElementById("email");
const planType = document.getElementById("planType");
const bonusDays = document.getElementById("bonusDays");
const bonusReports = document.getElementById("bonusReports");
const secondary2 = document.getElementById("secondary2");
const secondary3 = document.getElementById("secondary3");

let users = [];
let selectedUser = null;

function setMessage(el, text) {
  el.textContent = text || "";
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function renderUsers(rows) {
  usersTable.innerHTML = "";
  rows.forEach((u) => {
    const tr = document.createElement("tr");
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    tr.setAttribute("aria-label", `Select user ${u.full_name || u.email || "unknown"}`);
    tr.setAttribute("aria-selected", selectedUser?.user_id === u.user_id ? "true" : "false");
    tr.innerHTML = `
      <td>${u.full_name || "—"}</td>
      <td>${u.email || ""}</td>
      <td>${u.company_name || "—"}</td>
      <td>${u.plan_type || "free"}</td>
      <td>${u.remaining_days ?? "—"}</td>
      <td>${u.reports_usage || "— / —"}</td>
    `;
    tr.addEventListener("click", () => selectUser(u));
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectUser(u);
      }
    });
    usersTable.appendChild(tr);
  });
}

function fillForm(u) {
  targetUserId.value = u.user_id || "";
  email.value = u.email || "";
  planType.value = u.plan_type || "free";
  bonusDays.value = "";
  bonusReports.value = "";

  const secondaries = (u.secondary_emails || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  secondary2.value = secondaries[0] || "";
  secondary3.value = secondaries[1] || "";
}

function renderAudit(rows) {
  auditList.innerHTML = "";
  if (!rows.length) {
    const li = document.createElement("li");
    li.textContent = "No recent changes";
    auditList.appendChild(li);
    return;
  }

  rows.forEach((r) => {
    const li = document.createElement("li");
    const ts = r.created_at ? new Date(r.created_at).toLocaleString() : "";
    const summary = r.new_value ? `${r.action}: ${JSON.stringify(r.new_value)}` : r.action;
    li.textContent = ts ? `[${ts}] ${summary}` : summary;
    auditList.appendChild(li);
  });
}

async function loadUsers() {
  appView.setAttribute("aria-busy", "true");
  const data = await api("/api/users");
  users = data.users || [];
  renderUsers(users);
  appView.setAttribute("aria-busy", "false");
}

async function loadAudit(userId) {
  const data = await api(`/api/audit?targetUserId=${encodeURIComponent(userId)}&limit=5`);
  renderAudit(data.rows || []);
}

async function selectUser(u) {
  selectedUser = u;
  fillForm(u);
  await loadAudit(u.user_id);
}

searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    renderUsers(users);
    return;
  }
  const filtered = users.filter((u) => {
    const em = String(u.email || "").toLowerCase();
    const nm = String(u.full_name || "").toLowerCase();
    return em.includes(q) || nm.includes(q);
  });
  renderUsers(filtered);
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMessage(loginMessage, "");
  const password = document.getElementById("password").value;

  try {
    await api("/api/login", { method: "POST", body: JSON.stringify({ password }) });
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    await loadUsers();
  } catch (error) {
    setMessage(loginMessage, error.message);
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST" });
  } finally {
    appView.classList.add("hidden");
    loginView.classList.remove("hidden");
  }
});

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMessage(saveMessage, "");
  if (!selectedUser || !targetUserId.value) {
    setMessage(saveMessage, "Select a user first");
    return;
  }

  const body = {
    target_user_id: targetUserId.value,
    plan_type: planType.value,
    secondary_2_email: secondary2.value.trim() || null,
    secondary_3_email: secondary3.value.trim() || null,
  };
  if (bonusDays.value.trim()) body.bonus_days = Number(bonusDays.value);
  if (bonusReports.value.trim()) body.bonus_reports = Number(bonusReports.value);

  try {
    await api("/api/update-user", { method: "POST", body: JSON.stringify(body) });
    setMessage(saveMessage, "User updated");
    await loadUsers();
    await loadAudit(targetUserId.value);
  } catch (error) {
    setMessage(saveMessage, error.message);
  }
});

async function bootstrap() {
  try {
    const session = await api("/api/session");
    if (session.authenticated) {
      loginView.classList.add("hidden");
      appView.classList.remove("hidden");
      await loadUsers();
    }
  } catch (_) {
    // No-op: user stays on login screen
  }
}

bootstrap();
