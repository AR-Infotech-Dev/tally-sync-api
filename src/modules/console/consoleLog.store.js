const MAX_ENTRIES = 500;
const entries = [];

/** Keeps a bounded in-memory event log for the admin console. */
export function recordConsoleLog(level, message, details = {}) {
  entries.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    level,
    message: String(message).slice(0, 500),
    ...details,
  });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
}

export function listConsoleLogs(limit = 100) {
  return entries.slice(0, Math.min(200, Math.max(1, Number(limit) || 100)));
}
