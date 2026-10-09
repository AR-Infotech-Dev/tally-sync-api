import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const CONSOLE_COOKIE_NAME = "tally_console_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function getConsoleCredentials() {
  const username = process.env.CONSOLE_USERNAME || "";
  const password = process.env.CONSOLE_PASSWORD || "";
  return { username, password, configured: Boolean(username && password.length >= 16) };
}

function equalText(left, right) {
  const leftHash = createHash("sha256").update(String(left)).digest();
  const rightHash = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function signature(payload, password) {
  const secret = process.env.CONSOLE_SESSION_SECRET || password;
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function isConsoleConfigured() {
  return getConsoleCredentials().configured;
}

export function verifyConsoleCredentials(username, password) {
  const credentials = getConsoleCredentials();
  if (!credentials.configured) return false;
  return equalText(username, credentials.username) && equalText(password, credentials.password);
}

export function createConsoleSession(username) {
  const { password } = getConsoleCredentials();
  const payload = Buffer.from(JSON.stringify({ username, expiresAt: Date.now() + SESSION_TTL_MS })).toString("base64url");
  return `${payload}.${signature(payload, password)}`;
}

export function verifyConsoleSession(token) {
  const credentials = getConsoleCredentials();
  if (!credentials.configured || typeof token !== "string") return null;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;

  const expectedSignature = signature(payload, credentials.password);
  if (!equalText(suppliedSignature, expectedSignature)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (session.username !== credentials.username || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) return null;
    return { username: session.username, expiresAt: session.expiresAt };
  } catch {
    return null;
  }
}

export const consoleSessionCookieOptions = Object.freeze({
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/api/console",
  maxAge: SESSION_TTL_MS,
});
