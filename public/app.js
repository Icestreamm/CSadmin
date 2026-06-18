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

const username = document.getElementById("username");
const accountRole = document.getElementById("accountRole");
const managerUsername = document.getElementById("managerUsername");
const planType = document.getElementById("planType");
const adjustDays = document.getElementById("adjustDays");
const adjustReports = document.getElementById("adjustReports");
const employeeEmail1 = document.getElementById("employeeEmail1");
const employeeEmail2 = document.getElementById("employeeEmail2");
const employeeStatus1 = document.getElementById("employeeStatus1");
const employeeStatus2 = document.getElementById("employeeStatus2");

const updatePlanBtn = document.getElementById("updatePlanBtn");
const saveRoleBtn = document.getElementById("saveRoleBtn");
const applyDaysBtn = document.getElementById("applyDaysBtn");
const applyReportsBtn = document.getElementById("applyReportsBtn");
const inviteEmployee1Btn = document.getElementById("inviteEmployee1Btn");
const inviteEmployee2Btn = document.getElementById("inviteEmployee2Btn");
const cancelEmployee1Btn = document.getElementById("cancelEmployee1Btn");
const cancelEmployee2Btn = document.getElementById("cancelEmployee2Btn");

const planMessage = document.getElementById("planMessage");
const roleMessage = document.getElementById("roleMessage");
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
const USERS_TABLE_COLS = 12;

function setMessage(el, text, isError = true) {
  el.textContent = text || "";
  el.classList.toggle("success", Boolean(text) && !isError);
  el.classList.toggle("error", Boolean(text) && isError);
}

function clearMessages() {
  [planMessage, roleMessage, daysMessage, reportsMessage, employeesMessage].forEach((el) =>
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

function roleBadgeClass(role) {
  return role === "employee" ? "badge employee" : "badge manager";
}

function accountRoleOf(u) {
  const role = (u.account_role || "manager").toLowerCase();
  return role === "employee" ? "employee" : "manager";
}

function displayUsername(u) {
  if (u.username && String(u.username).trim()) return u.username;
  if (u.email && u.email.includes("@")) return u.email.split("@")[0];
  return "—";
}

function employeeEmails(u) {
  return String(u.secondary_emails || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function employeeSlotDisplay(u, slotIndex) {
  const email = employeeEmails(u)[slotIndex] || "";
  const statuses = [u.employee_1_status, u.employee_2_status];
  const usernames = [u.employee_1_username, u.employee_2_username];
  const status = statuses[slotIndex];
  const linkedUsername = usernames[slotIndex];

  if (status === "accepted" && linkedUsername) return linkedUsername;
  if (status === "pending" && email) return `${email} (pending)`;
  if (email) return email;
  return "—";
}

function inviteStatusText(info) {
  const status = info?.status || "";
  if (status === "accepted" && info.username) {
    return `Linked as ${info.username}`;
  }
  if (status === "pending") {
    return info.email_sent_at
      ? "Invitation sent — waiting for employee to register and accept"
      : "Invite created — email pending";
  }
  if (status === "declined") return "Invitation declined";
  if (status === "expired") return "Invitation expired";
  return "";
}

function renderInviteSlot(slot, info = {}) {
  const emailEl = slot === 1 ? employeeEmail1 : employeeEmail2;
  const statusEl = slot === 1 ? employeeStatus1 : employeeStatus2;
  const inviteBtn = slot === 1 ? inviteEmployee1Btn : inviteEmployee2Btn;
  const cancelBtn = slot === 1 ? cancelEmployee1Btn : cancelEmployee2Btn;
  const status = info.status || "";
  const linked = status === "accepted";
  const pending = status === "pending";
  const isManager = accountRole.value === "manager";
  const panelEnabled = !accountRole.disabled && isManager;

  emailEl.value = info.email || "";
  statusEl.textContent = inviteStatusText(info);
  statusEl.className = `inviteStatus small ${
    linked ? "linked" : pending ? "pending" : "muted"
  }`;

  emailEl.disabled = !panelEnabled || linked;
  inviteBtn.disabled = !panelEnabled || linked;
  inviteBtn.textContent = pending ? `Resend Invitation #${slot}` : `Send Invitation #${slot}`;
  cancelBtn.disabled = !panelEnabled || linked || (!info.email && !pending);
}

async function loadEmployeeInvites(userId) {
  if (!userId || accountRoleOf(selectedUser || {}) !== "manager") {
    renderInviteSlot(1, {});
    renderInviteSlot(2, {});
    return;
  }
  try {
    const data = await api(
      `/api/employee-invites?targetUserId=${encodeURIComponent(userId)}`,
    );
    const slots = Array.isArray(data.slots) ? data.slots : [];
    renderInviteSlot(1, slots.find((s) => Number(s.slot) === 1) || {});
    renderInviteSlot(2, slots.find((s) => Number(s.slot) === 2) || {});
  } catch (_) {
    const emails = employeeEmails(selectedUser || {});
    renderInviteSlot(1, { email: emails[0] || "" });
    renderInviteSlot(2, { email: emails[1] || "" });
  }
}

function reportsQuotaLabel(u) {
  if (u.reports_usage && u.reports_limit == null && u.admin_bonus_reports == null) {
    return u.reports_usage;
  }
  const used = Number(u.reports_used_this_month ?? 0);
  const limit = Number(u.reports_limit ?? NaN);
  const plan = (u.plan_type || "free").toLowerCase();
  if (Number.isFinite(limit) && limit >= 999999) return `${used} / ∞`;
  if (Number.isFinite(limit)) return `${used} / ${limit}`;
  const bonus = Number(u.admin_bonus_reports ?? 0);
  if (plan === "plus") return `${used} / ∞`;
  if (plan === "pro") return `${used} / ${40 + bonus}`;
  return `${used} / ${bonus}`;
}

function reportsQuotaFromSubscription(sub) {
  if (!sub) return "—";
  const used = Number(sub.reports_used_this_month ?? 0);
  const limit = Number(sub.reports_limit ?? NaN);
  if (Number.isFinite(limit) && limit >= 999999) return `${used} / ∞ (unlimited)`;
  if (Number.isFinite(limit)) {
    const remaining = Number(sub.reports_remaining ?? Math.max(0, limit - used));
    return `${used} / ${limit} (${remaining} remaining)`;
  }
  const plan = (sub.plan_type || "free").toLowerCase();
  const bonus = Number(sub.admin_bonus_reports ?? 0);
  const computed =
    plan === "plus" ? 999999 : plan === "pro" ? 40 + bonus : bonus;
  if (computed >= 999999) return `${used} / ∞`;
  return `${used} / ${computed} (${Math.max(0, computed - used)} remaining)`;
}

function userSearchText(u) {
  return [
    displayUsername(u),
    u.email,
    u.phone,
    u.full_name,
    u.company_name,
    ...employeeEmails(u),
    u.employee_1_username,
    u.employee_2_username,
    u.manager_username,
    u.manager_email,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function renderUsers(rows) {
  usersTable.innerHTML = "";
  userCount.textContent = rows.length ? `(${rows.length})` : "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = USERS_TABLE_COLS;
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
      `Select user ${displayUsername(u)}`,
    );
    tr.setAttribute(
      "aria-selected",
      selectedUserId === u.user_id ? "true" : "false",
    );
    if (selectedUserId === u.user_id) tr.classList.add("selected");

    setCell(tr, displayUsername(u));
    setCell(tr, u.email || "—");
    setCell(tr, u.phone || "—");
    setCell(tr, u.full_name || "—");
    setCell(tr, u.company_name || "—");

    const roleTd = document.createElement("td");
    const roleBadge = document.createElement("span");
    const role = accountRoleOf(u);
    roleBadge.className = roleBadgeClass(role);
    roleBadge.textContent = role;
    roleTd.appendChild(roleBadge);
    tr.appendChild(roleTd);

    setCell(
      tr,
      role === "employee"
        ? u.manager_username ||
          (u.manager_email ? displayUsername({ email: u.manager_email }) : "—")
        : "—",
    );

    const planTd = document.createElement("td");
    const badge = document.createElement("span");
    const pt = u.plan_type || "free";
    badge.className = planBadgeClass(pt);
    badge.textContent = pt;
    planTd.appendChild(badge);
    tr.appendChild(planTd);

    setCell(tr, u.remaining_days ?? "—");
    setCell(tr, reportsQuotaLabel(u));
    setCell(tr, employeeSlotDisplay(u, 0));
    setCell(tr, employeeSlotDisplay(u, 1));

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

function syncManagerFieldState() {
  const isEmployee = accountRole.value === "employee";
  managerUsername.disabled = !isEmployee || accountRole.disabled;
  if (!isEmployee) managerUsername.value = "";
}

function syncEmployeeInviteState() {
  const isManager = accountRole.value === "manager";
  if (!isManager || accountRole.disabled) {
    renderInviteSlot(1, {});
    renderInviteSlot(2, {});
    employeeEmail1.disabled = true;
    employeeEmail2.disabled = true;
    inviteEmployee1Btn.disabled = true;
    inviteEmployee2Btn.disabled = true;
    cancelEmployee1Btn.disabled = true;
    cancelEmployee2Btn.disabled = true;
    return;
  }
  if (selectedUserId) loadEmployeeInvites(selectedUserId);
}

function setEditEnabled(enabled) {
  accountRole.disabled = !enabled;
  planType.disabled = !enabled;
  adjustDays.disabled = !enabled;
  adjustReports.disabled = !enabled;
  updatePlanBtn.disabled = !enabled;
  saveRoleBtn.disabled = !enabled;
  applyDaysBtn.disabled = !enabled;
  applyReportsBtn.disabled = !enabled;
  syncManagerFieldState();
  syncEmployeeInviteState();
  editHint.classList.toggle("hidden", enabled);
}

async function fillForm(u) {
  username.value = displayUsername(u);
  accountRole.value = accountRoleOf(u);
  managerUsername.value =
    accountRoleOf(u) === "employee"
      ? u.manager_username ||
        (u.manager_email ? displayUsername({ email: u.manager_email }) : "") ||
        ""
      : "";
  planType.value = u.plan_type || "free";
  adjustDays.value = "";
  adjustReports.value = "";
  setEditEnabled(true);
  await loadEmployeeInvites(u.user_id);
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
    ["Username", sub.username || displayUsername(sub)],
    ["Account type", sub.account_role || "manager"],
    ["Their manager", sub.manager_username || sub.manager_email || "—"],
    ["Plan", sub.plan_type || "free"],
    ["Billing period", sub.plan_id || "none"],
    ["Status", sub.status || "inactive"],
    ["Access ends", formatDate(sub.access_end || sub.effective_end)],
    ["Trial used", sub.trial_activated ? "Yes" : "No"],
    ["Report quota (used / limit)", reportsQuotaFromSubscription(sub)],
    ["Bonus reports (admin)", String(sub.admin_bonus_reports ?? 0)],
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
        users.filter((u) => userSearchText(u).includes(q)),
      );
    } else {
      renderUsers(users);
    }
  } catch (error) {
    usersTable.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = USERS_TABLE_COLS;
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
    if (data.warning && selectedUser) {
      detailSubtitle.textContent = `${displayUsername(selectedUser)}${
        selectedUser.full_name ? ` · ${selectedUser.full_name}` : ""
      } — ${data.warning}`;
    }
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
  await fillForm(u);
  detailSubtitle.textContent = `${displayUsername(u)}${u.full_name ? ` · ${u.full_name}` : ""}`;
  const q = searchInput.value.trim().toLowerCase();
  renderUsers(
    q ? users.filter((x) => userSearchText(x).includes(q)) : users,
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
    const result = await api("/api/update-user", {
      method: "POST",
      body: JSON.stringify({ target_user_id: selectedUserId, ...body }),
    });
    let msg = successText;
    if (result?.admin_bonus_reports != null) {
      const used = result.reports_used_this_month ?? selectedUser?.reports_used_this_month ?? 0;
      const plan = (result.plan_type || selectedUser?.plan_type || "free").toLowerCase();
      const bonus = Number(result.admin_bonus_reports);
      const limit =
        plan === "plus" ? "∞" : plan === "pro" ? String(40 + bonus) : String(bonus);
      msg = `${successText} — quota now ${used} / ${limit} (bonus: ${bonus})`;
    }
    setMessage(messageEl, msg, false);
    await loadUsers();
    const refreshed = users.find((u) => u.user_id === selectedUserId);
    if (refreshed) {
      selectedUser = refreshed;
      await fillForm(refreshed);
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
  renderUsers(users.filter((u) => userSearchText(u).includes(q)));
});

refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  try {
    await loadUsers();
    if (selectedUserId) {
      const refreshed = users.find((u) => u.user_id === selectedUserId);
      if (refreshed) {
        selectedUser = refreshed;
        await fillForm(refreshed);
      }
      await loadUserDetail(selectedUserId);
    }
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

accountRole.addEventListener("change", () => {
  syncManagerFieldState();
  syncEmployeeInviteState();
});

async function sendEmployeeInvite(slot) {
  if (!selectedUserId) {
    setMessage(employeesMessage, "Select a manager first");
    return;
  }
  if (accountRole.value !== "manager") {
    setMessage(employeesMessage, "Employee invites are only for manager accounts");
    return;
  }
  const emailEl = slot === 1 ? employeeEmail1 : employeeEmail2;
  const email = emailEl.value.trim();
  if (!email) {
    setMessage(employeesMessage, "Enter the employee email address");
    return;
  }
  const btn = slot === 1 ? inviteEmployee1Btn : inviteEmployee2Btn;
  btn.disabled = true;
  setMessage(employeesMessage, "");
  try {
    const result = await api("/api/employee-invite", {
      method: "POST",
      body: JSON.stringify({
        target_user_id: selectedUserId,
        slot,
        email,
      }),
    });
    const sent = result.email_sent !== false;
    const msg = sent
      ? `Invitation sent to ${email}. They must register and accept to appear as an employee.`
      : result.warning ||
        `Invite saved for ${email} but email was not sent (check Resend / Supabase invite config).`;
    setMessage(employeesMessage, msg, !sent);
    await loadUsers();
    const refreshed = users.find((u) => u.user_id === selectedUserId);
    if (refreshed) {
      selectedUser = refreshed;
      await loadEmployeeInvites(selectedUserId);
    }
    renderUsers(
      searchInput.value.trim()
        ? users.filter((u) =>
            userSearchText(u).includes(searchInput.value.trim().toLowerCase()),
          )
        : users,
    );
  } catch (error) {
    setMessage(employeesMessage, error.message);
  } finally {
    syncEmployeeInviteState();
  }
}

async function cancelEmployeeInvite(slot) {
  if (!selectedUserId) return;
  const btn = slot === 1 ? cancelEmployee1Btn : cancelEmployee2Btn;
  btn.disabled = true;
  setMessage(employeesMessage, "");
  try {
    await api("/api/employee-invite", {
      method: "POST",
      body: JSON.stringify({
        target_user_id: selectedUserId,
        slot,
        cancel: true,
      }),
    });
    setMessage(employeesMessage, `Invitation #${slot} cancelled`, false);
    await loadUsers();
    await loadEmployeeInvites(selectedUserId);
    renderUsers(
      searchInput.value.trim()
        ? users.filter((u) =>
            userSearchText(u).includes(searchInput.value.trim().toLowerCase()),
          )
        : users,
    );
  } catch (error) {
    setMessage(employeesMessage, error.message);
  } finally {
    syncEmployeeInviteState();
  }
}

inviteEmployee1Btn.addEventListener("click", () => sendEmployeeInvite(1));
inviteEmployee2Btn.addEventListener("click", () => sendEmployeeInvite(2));
cancelEmployee1Btn.addEventListener("click", () => cancelEmployeeInvite(1));
cancelEmployee2Btn.addEventListener("click", () => cancelEmployeeInvite(2));

saveRoleBtn.addEventListener("click", () => {
  const role = accountRole.value;
  const body = { role };
  if (role === "employee") {
    const mgr = managerUsername.value.trim();
    if (!mgr) {
      setMessage(roleMessage, "Enter the manager username for employee accounts");
      return;
    }
    body.manager_username = mgr;
  } else {
    body.manager_username = null;
  }
  updateUser(body, roleMessage, "Account type updated");
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
  const raw = adjustReports.value.trim();
  if (!raw) {
    setMessage(reportsMessage, "Enter reports to add (+) or deduct (−)");
    return;
  }
  const delta = Number(raw);
  if (!Number.isFinite(delta) || delta === 0) {
    setMessage(reportsMessage, "Reports must be a non-zero number");
    return;
  }
  if (delta < -999999 || delta > 999999) {
    setMessage(reportsMessage, "Reports must be between -999999 and 999999");
    return;
  }
  updateUser({ adjust_reports: delta }, reportsMessage, "Reports updated");
  adjustReports.value = "";
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
