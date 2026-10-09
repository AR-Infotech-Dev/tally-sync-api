const app = document.querySelector("#app");
let refreshTimer;
let latestSnapshot;
let selectedLogLevel = "all";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));
 
async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.message || payload.msg || `Request failed (${response.status}).`);
  return payload;
}

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatUptime(seconds = 0) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days ? `${days}d` : "", `${hours}h`, `${minutes}m`].filter(Boolean).join(" ");
}

function showLogin(message = "", isError = false) {
  clearInterval(refreshTimer);
  app.innerHTML = `
    <section class="login-wrap">
      <div class="login-card">
        <div class="brand"><span class="brand-mark">TS</span><div><p class="eyebrow">FLOWUPS · SERVER</p><h1>Admin Console</h1></div></div>
        <h2>Sign in</h2>
        <p>Sign in to inspect server health, connected Tally Connectors, sales order jobs, and recent activity.</p>
        <form id="login-form" class="login-form">
          <label>Username<input name="username" autocomplete="username" required /></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
          <button class="primary-button" type="submit">Sign in to Console</button>
        </form>
        ${message ? `<p class="notice ${isError ? "error" : ""}" role="alert">${escapeHtml(message)}</p>` : ""}
        <p id="configuration-note" class="notice" hidden></p>
      </div>
    </section>`;

  document.querySelector("#login-form").addEventListener("submit", login);
  api("/api/console/auth/status").then(({ configured }) => {
    if (!configured) {
      const note = document.querySelector("#configuration-note");
      note.hidden = false;
      note.textContent = "Console login is not configured yet. Set CONSOLE_USERNAME and a CONSOLE_PASSWORD with at least 16 characters in the Server environment, then restart the Server.";
      document.querySelector("#login-form button").disabled = true;
    }
  }).catch(() => {});
}

async function login(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  const credentials = Object.fromEntries(new FormData(form));
  button.disabled = true;
  button.textContent = "Signing in…";
  try {
    await api("/api/console/auth/login", { method: "POST", body: JSON.stringify(credentials) });
    await loadSnapshot();
  } catch (error) {
    showLogin(error.message, true);
  }
}

async function logout() {
  try { await api("/api/console/auth/logout", { method: "POST", body: "{}" }); } catch { /* Session expiry still returns to login. */ }
  showLogin();
}

async function loadSnapshot() {
  try {
    latestSnapshot = await api("/api/console/snapshot");
    renderDashboard(latestSnapshot);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => { if (!document.hidden) refreshSnapshot(); }, 15000);
  } catch (error) {
    if (/login|required|expired|session/i.test(error.message)) showLogin("Your session ended. Sign in again.");
    else renderError(error.message);
  }
}

async function refreshSnapshot() {
  try {
    latestSnapshot = await api("/api/console/snapshot");
    renderDashboard(latestSnapshot);
  } catch (error) {
    if (/login|required|expired|session/i.test(error.message)) showLogin("Your session ended. Sign in again.");
    else document.querySelector("#refresh-error").textContent = error.message;
  }
}

function renderError(message) {
  app.innerHTML = `<section class="login-wrap"><div class="login-card"><div class="brand"><span class="brand-mark">TS</span><div><p class="eyebrow">FLOWUPS · SERVER</p><h1>Admin Console</h1></div></div><p class="notice error">${escapeHtml(message)}</p><button class="secondary-button" id="retry-load" type="button">Try again</button></div></section>`;
  document.querySelector("#retry-load").addEventListener("click", loadSnapshot);
}

function renderDashboard(snapshot) {
  const { server, socket, database, jobs, logs } = snapshot;
  const statuses = database.salesOrders?.byStatus || {};
  const socketStatus = socket.status === "online" ? "ok" : "error";
  const dbStatus = database.status === "connected" ? "ok" : "error";
  app.innerHTML = `
    <header class="dashboard-header">
      <div class="dashboard-title"><span class="brand-mark">TS</span><div><p class="eyebrow">FLOWUPS · ADMIN</p><h1>Server Console</h1><p>Runtime health, Connector registrations, queued jobs, and recent server activity.</p></div></div>
      <div class="header-actions"><span class="updated-time" id="updated-time">Updated ${escapeHtml(formatTime(snapshot.capturedAt))}</span><button class="secondary-button" id="refresh-button" type="button">Refresh</button><button class="secondary-button" id="logout-button" type="button">Sign out</button></div>
    </header>
    <p class="notice error" id="refresh-error" role="alert"></p>
    <section class="service-bar">
      <article class="metric"><span class="metric-label"><i class="dot ok"></i> API Server</span><strong>Online</strong><small>Running ${escapeHtml(formatUptime(server.uptimeSeconds))} · ${escapeHtml(server.environment)}</small></article>
      <article class="metric"><span class="metric-label"><i class="dot ${dbStatus}"></i> MongoDB</span><strong>${database.status === "connected" ? "Connected" : "Unavailable"}</strong><small>${database.clients ? `${database.clients.active} active / ${database.clients.total} clients` : "Database metrics unavailable"}</small></article>
      <article class="metric"><span class="metric-label"><i class="dot ${socketStatus}"></i> Socket.IO</span><strong>${socket.registeredCount} registered</strong><small>Authenticated Connector sockets online</small></article>
      <article class="metric"><span class="metric-label"><i class="dot ok"></i> Runtime</span><strong>${escapeHtml(server.nodeVersion)}</strong><small>Started ${escapeHtml(formatTime(server.startedAt))}</small></article>
    </section>
    <section class="queue-grid">
      ${queueCard("Queued", statuses.queued || 0, "queued")}
      ${queueCard("Processing", (statuses.processing || 0) + (statuses.fetching || 0) + (statuses.building_xml || 0) + (statuses.pushing || 0), "processing")}
      ${queueCard("Fetching", statuses.fetching || 0, "processing")}
      ${queueCard("Building XML", statuses.building_xml || 0, "processing")}
      ${queueCard("Pushing to Tally", statuses.pushing || 0, "processing")}
      ${queueCard("Succeeded", statuses.succeeded || 0, "succeeded")}
      ${queueCard("Failed", statuses.failed || 0, "failed")}
    </section>
    <section class="content-grid">
      <div>
        <section class="panel"><div class="panel-heading"><h2>Registered Connectors</h2><span>${socket.connectors.length} online</span></div>${renderConnectorTable(socket.connectors)}</section>
        <section class="panel"><div class="panel-heading"><h2>Recent Sales Order Jobs</h2><span>${jobs.length} recent</span></div>${renderJobsTable(jobs)}</section>
      </div>
      <section class="panel"><div class="panel-heading"><h2>Live Server Activity</h2><div class="log-toolbar"><span>${logs.length} recent</span><select id="log-level" aria-label="Filter log level"><option value="all">All levels</option><option value="info">Info</option><option value="success">Success</option><option value="warn">Warning</option><option value="error">Error</option></select></div></div><div id="log-list" class="log-list">${renderLogs(logs)}</div></section>
    </section>
    <p class="footer-note">Refreshes every 15 seconds. Activity logs are held in memory since the last Server start; sales order jobs are read from MongoDB. API keys and voucher payloads are never shown here.</p>`;

  document.querySelector("#refresh-button").addEventListener("click", refreshSnapshot);
  document.querySelector("#logout-button").addEventListener("click", logout);
  document.querySelector("#log-level").value = selectedLogLevel;
  document.querySelector("#log-level").addEventListener("change", (event) => {
    selectedLogLevel = event.target.value;
    document.querySelector("#log-list").innerHTML = renderLogs(latestSnapshot.logs);
  });
}

function queueCard(label, count, tone) {
  return `<article class="queue-metric ${tone}"><span>${label}</span><strong>${count}</strong></article>`;
}

function renderConnectorTable(connectors) {
  if (!connectors.length) return `<div class="empty">No authenticated Connector sockets are online.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Client ID</th><th>Connector ID</th><th>Socket ID</th><th>Last heartbeat</th></tr></thead><tbody>${connectors.map((connector) => `<tr><td class="mono truncate" title="${escapeHtml(connector.clientId)}">${escapeHtml(connector.clientId)}</td><td class="mono truncate" title="${escapeHtml(connector.connectorId)}">${escapeHtml(connector.connectorId)}</td><td class="mono truncate" title="${escapeHtml(connector.socketId)}">${escapeHtml(connector.socketId)}</td><td class="truncate">${escapeHtml(formatTime(connector.lastSeenAt))}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderJobsTable(jobs) {
  if (!jobs.length) return `<div class="empty">No Sales Order jobs have been stored yet.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Created</th><th>Request</th><th>Status</th><th>Try</th><th>Error</th></tr></thead><tbody>${jobs.map((job) => {
    const voucherNumber = job.sales_order?.voucher_number ? ` · ${job.sales_order.voucher_number}` : "";
    const company = job.destination?.company || job.destination?.company_name || "";
    return `<tr><td class="truncate">${escapeHtml(formatTime(job.created_at))}</td><td class="mono truncate" title="${escapeHtml(job.request_id)}">${escapeHtml(job.request_id)}${escapeHtml(voucherNumber)}</td><td><span class="status-tag ${escapeHtml(job.status)}">${escapeHtml(job.status)}</span></td><td>${Number(job.attempt_count) || 0}</td><td class="truncate" title="${escapeHtml(job.error || company)}">${escapeHtml(job.error || company || "—")}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function renderLogs(logs = []) {
  const filtered = selectedLogLevel === "all" ? logs : logs.filter((entry) => entry.level === selectedLogLevel);
  if (!filtered.length) return `<div class="empty">No activity for this filter.</div>`;
  return filtered.map((entry) => {
    const details = Object.entries(entry).filter(([key]) => !["id", "at", "level", "message", "source"].includes(key)).map(([key, value]) => `${key}=${value}`).join(" · ");
    return `<div class="log-row"><time class="log-time">${escapeHtml(formatTime(entry.at))}</time><span class="log-level ${escapeHtml(entry.level)}">${escapeHtml(entry.level)}</span><span class="log-message">${escapeHtml(entry.message)}</span>${details ? `<span class="log-context">${escapeHtml(details)}</span>` : ""}</div>`;
  }).join("");
}

async function start() {
  try {
    await api("/api/console/auth/me");
    await loadSnapshot();
  } catch {
    showLogin();
  }
}

start();
