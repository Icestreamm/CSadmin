const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const logoutBtn = document.getElementById("logoutBtn");
const refreshBtn = document.getElementById("refreshBtn");
const usersTable = document.getElementById("usersTable");
const usersLoading = document.getElementById("usersLoading");
const userCount = document.getElementById("userCount");
const searchInput = document.getElementById("searchInput");
const editHint = document.getElementById("editHint");

const email = document.getElementById("email");
const planType = document.getElementById("planType");
const adjustDays = document.getElementById("adjustDays");
const bonusReports = document.getElementById("bonusReports");
const secondary2 = document.getElementById("secondary2");
const secondary3 = document.getElementById("secondary3");

const updatePlanBtn = document.getElementById("updatePlanBtn");
const applyDaysBtn = document.getElementById("applyDaysBtn");
const applyReportsBtn = document.getElementById("applyReportsBtn");
const saveEmployeesBtn = document.getElementById("saveEmployeesBtn");

const planMessage = document.getElementById("planMessage");
const daysMessage = document.getElementById("daysMessage");
const reportsMessage = document.getElementById("reportsMessage");
const employeesMessage = document.getElementById("employeesMessage");

const userDetailSection = document.getElementById("userDetailSection");
const detailSubtitle = document.getElementById("detailSubtitle");
const subscriptionSnapshot = document.getElementById("subscriptionSnapshot");
const activityList = document.getElementById("activityList");
const activityLoading = document.getElementById("activityLoading");
const reportsTableBody = document.getElementById("reportsTableBody");
const reportsLoading = document.getElementById("reportsLoading");

let users = [];
let selectedUser = null;
let selectedUserId = null;

function setMessage(el, text, isError = true) {
  el.textContent = text || "";
  el.classList.toggle("success", Boolean(text) && !isError);
  el.classList.toggle("error", Boolean(text) && isError);
}

function clearMessages() {
  [planMessage, daysMessage, reportsMessage, employeesMessage].forEach((el) =>
    setMessage(el, ""),
  );
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

function planBadgeClass(plan) {
  if (plan === "plus") return "badge plus";
  if (plan === "pro") return "badge pro";
  return "badge free";
}

function kindBadgeClass(kind) {
  if (kind === "purchase") return "badge purchase";
  if (kind === "trial") return "badge trial";
  return "badge admin";
}

function setCell(tr, text) {
  const td = document.createElement("td");
  td.textContent = text ?? "—";
  tr.appendChild(td);
}

function renderUsers(rows) {
  usersTable.innerHTML = "";
  userCount.textContent = rows.length ? `(${rows.length})` : "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "No users found";
    td.className = "emptyCell";
    tr.appendChild(td);
    usersTable.appendChild(tr);
    return;
  }

  rows.forEach((u) => {
    const tr = document.createElement("tr");
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    tr.setAttribute(
      "aria-label",
      `Select user ${u.full_name || u.email || "unknown"}`,
    );
    tr.setAttribute(
      "aria-selected",
      selectedUserId === u.user_id ? "true" : "false",
    );
    if (selectedUserId === u.user_id) tr.classList.add("selected");

    setCell(tr, u.full_name || "—");
    setCell(tr, u.email || "");
    setCell(tr, u.company_name || "—");

    const planTd = document.createElement("td");
    const badge = document.createElement("span");
    const pt = u.plan_type || "free";
    badge.className = planBadgeClass(pt);
    badge.textContent = pt;
    planTd.appendChild(badge);
    tr.appendChild(planTd);

    setCell(tr, u.remaining_days ?? "—");
    setCell(tr, u.reports_usage || "— / —");

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

function setEditEnabled(enabled) {
  planType.disabled = !enabled;
  adjustDays.disabled = !enabled;
  bonusReports.disabled = !enabled;
  secondary2.disabled = !enabled;
  secondary3.disabled = !enabled;
  updatePlanBtn.disabled = !enabled;
  applyDaysBtn.disabled = !enabled;
  applyReportsBtn.disabled = !enabled;
  saveEmployeesBtn.disabled = !enabled;
  editHint.classList.toggle("hidden", enabled);
}

function fillForm(u) {
  email.value = u.email || "";
  planType.value = u.plan_type || "free";
  adjustDays.value = "";
  bonusReports.value = "";

  const secondaries = (u.secondary_emails || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  secondary2.value = secondaries[0] || "";
  secondary3.value = secondaries[1] || "";
  setEditEnabled(true);
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function formatMoney(amount, currency) {
  if (amount == null || amount === "") return "—";
  const cur = currency || "";
  return `${Number(amount).toFixed(2)} ${cur}`.trim();
}

function renderSnapshot(sub) {
  subscriptionSnapshot.innerHTML = "";
  if (!sub || !Object.keys(sub).length) {
    subscriptionSnapshot.textContent = "No subscription record yet.";
    return;
  }

  const items = [
    ["Plan", sub.plan_type || "free"],
    ["Billing period", sub.plan_id || "none"],
    ["Status", sub.status || "inactive"],
    ["Access ends", formatDate(sub.access_end || sub.effective_end)],
    ["Trial used", sub.trial_activated ? "Yes" : "No"],
    ["Reports this month", String(sub.reports_used_this_month ?? 0)],
    ["Bonus reports", String(sub.admin_bonus_reports ?? 0)],
    ["RevenueCat", sub.revenuecat_entitlement || "—"],
  ];

  items.forEach(([label, value]) => {
    const div = document.createElement("div");
    div.className = "snapshotItem";
    const dt = document.createElement("span");
    dt.className = "snapshotLabel";
    dt.textContent = label;
    const dd = document.createElement("span");
    dd.textContent = value;
    div.appendChild(dt);
    div.appendChild(dd);
    subscriptionSnapshot.appendChild(div);
  });
}

function renderActivity(rows) {
  activityList.innerHTML = "";
  if (!rows.length) {
    const li = document.createElement("li");
    li.textContent = "No activity recorded for this user.";
    li.className = "emptyCell";
    activityList.appendChild(li);
    return;
  }

  rows.forEach((r) => {
    const li = document.createElement("li");
    li.className = "timelineItem";

    const badge = document.createElement("span");
    badge.className = kindBadgeClass(r.kind);
    badge.textContent = r.kind || "event";

    const ts = document.createElement("span");
    ts.className = "timelineTs";
    ts.textContent = formatDate(r.created_at);

    const summary = document.createElement("div");
    summary.className = "timelineSummary";
    summary.textContent = r.summary || r.action || "Event";

    li.appendChild(badge);
    li.appendChild(ts);
    li.appendChild(summary);
    activityList.appendChild(li);
  });
}

function renderReports(rows) {
  reportsTableBody.innerHTML = "";
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "No reports for this user.";
    td.className = "emptyCell";
    tr.appendChild(td);
    reportsTableBody.appendChild(tr);
    return;
  }

  rows.forEach((r) => {
    const tr = document.createElement("tr");
    const vehicle =
      r.car_full_name ||
      [r.car_make, r.car_model, r.car_year].filter(Boolean).join(" ") ||
      "—";
    setCell(tr, formatDate(r.created_at));
    setCell(tr, r.customer_name || "—");
    setCell(tr, r.plate_number || "—");
    setCell(tr, vehicle);
    setCell(tr, r.status || "—");
    setCell(tr, formatMoney(r.final_cost_local, r.currency));
    setCell(tr, r.photo_count != null ? String(r.photo_count) : "—");
    reportsTableBody.appendChild(tr);
  });
}

async function loadUsers() {
  usersLoading.classList.remove("hidden");
  try {
    const data = await api("/api/users");
    users = data.users || [];
    const q = searchInput.value.trim().toLowerCase();
    if (q) {
      renderUsers(
        users.filter((u) => {
          const em = String(u.email || "").toLowerCase();
          const nm = String(u.full_name || "").toLowerCase();
          return em.includes(q) || nm.includes(q);
        }),
      );
    } else {
      renderUsers(users);
    }
  } catch (error) {
    usersTable.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = `Failed to load users: ${error.message}`;
    td.className = "emptyCell error";
    tr.appendChild(td);
    usersTable.appendChild(tr);
  } finally {
    usersLoading.classList.add("hidden");
  }
}

async function loadUserDetail(userId) {
  userDetailSection.classList.remove("hidden");
  activityLoading.classList.remove("hidden");
  reportsLoading.classList.remove("hidden");
  activityList.innerHTML = "";
  reportsTableBody.innerHTML = "";

  try {
    const data = await api(
      `/api/user-detail?targetUserId=${encodeURIComponent(userId)}&activityLimit=50&reportsLimit=100`,
    );
    renderSnapshot(data.subscription);
    renderActivity(data.activity || []);
    renderReports(data.reports || []);
  } catch (error) {
    subscriptionSnapshot.textContent = `Failed to load history: ${error.message}`;
    activityList.innerHTML = "";
    reportsTableBody.innerHTML = "";
  } finally {
    activityLoading.classList.add("hidden");
    reportsLoading.classList.add("hidden");
  }
}

async function selectUser(u) {
  selectedUser = u;
  selectedUserId = u.user_id;
  clearMessages();
  fillForm(u);
  detailSubtitle.textContent = `${u.full_name || "User"} · ${u.email || ""}`;
  renderUsers(
    searchInput.value.trim()
      ? users.filter((x) => {
          const q = searchInput.value.trim().toLowerCase();
          const em = String(x.email || "").toLowerCase();
          const nm = String(x.full_name || "").toLowerCase();
          return em.includes(q) || nm.includes(q);
        })
      : users,
  );
  await loadUserDetail(u.user_id);
}

async function updateUser(body, messageEl, successText) {
  if (!selectedUserId) {
    setMessage(messageEl, "Select a user first");
    return;
  }
  setMessage(messageEl, "");
  try {
    await api("/api/update-user", {
      method: "POST",
      body: JSON.stringify({ target_user_id: selectedUserId, ...body }),
    });
    setMessage(messageEl, successText, false);
    await loadUsers();
    const refreshed = users.find((u) => u.user_id === selectedUserId);
    if (refreshed) {
      selectedUser = refreshed;
      fillForm(refreshed);
    }
    await loadUserDetail(selectedUserId);
  } catch (error) {
    setMessage(messageEl, error.message);
  }
}

searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    renderUsers(users);
    return;
  }
  renderUsers(
    users.filter((u) => {
      const em = String(u.email || "").toLowerCase();
      const nm = String(u.full_name || "").toLowerCase();
      return em.includes(q) || nm.includes(q);
    }),
  );
});

refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  try {
    await loadUsers();
    if (selectedUserId) await loadUserDetail(selectedUserId);
  } finally {
    refreshBtn.disabled = false;
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMessage(loginMessage, "");
  const password = document.getElementById("password").value;
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
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
    selectedUser = null;
    selectedUserId = null;
    setEditEnabled(false);
    userDetailSection.classList.add("hidden");
  }
});

updatePlanBtn.addEventListener("click", () => {
  updateUser({ plan_type: planType.value }, planMessage, "Plan updated");
});

applyDaysBtn.addEventListener("click", () => {
  const raw = adjustDays.value.trim();
  if (!raw) {
    setMessage(daysMessage, "Enter days to add (+) or deduct (−)");
    return;
  }
  const delta = Number(raw);
  if (!Number.isFinite(delta) || delta === 0) {
    setMessage(daysMessage, "Days must be a non-zero number");
    return;
  }
  if (delta < -9999 || delta > 9999) {
    setMessage(daysMessage, "Days must be between -9999 and 9999");
    return;
  }
  updateUser({ adjust_days: delta }, daysMessage, "Days updated");
  adjustDays.value = "";
});

applyReportsBtn.addEventListener("click", () => {
  const raw = bonusReports.value.trim();
  if (!raw) {
    setMessage(reportsMessage, "Enter bonus reports to add");
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 999999) {
    setMessage(reportsMessage, "Bonus reports must be 1–999999");
    return;
  }
  updateUser({ bonus_reports: n }, reportsMessage, "Bonus reports added");
  bonusReports.value = "";
});

saveEmployeesBtn.addEventListener("click", () => {
  updateUser(
    {
      secondary_2_email: secondary2.value.trim() || null,
      secondary_3_email: secondary3.value.trim() || null,
    },
    employeesMessage,
    "Employee emails saved",
  );
});

async function bootstrap() {
  setEditEnabled(false);
  try {
    const session = await api("/api/session");
    if (session.authenticated) {
      loginView.classList.add("hidden");
      appView.classList.remove("hidden");
      await loadUsers();
    }
  } catch (_) {
    // stay on login
  }
}

bootstrap();
