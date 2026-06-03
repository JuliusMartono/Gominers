const bcrypt = require("bcryptjs");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";
const SESSION_HOURS = parseInt(process.env.SESSION_DURATION_HOURS || "24");
const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || "5");
const LOCKOUT_MIN = parseInt(process.env.LOCKOUT_DURATION_MINUTES || "30");

const attempts = new Map();

let _jose = null;
async function getJose() {
  if (!_jose) _jose = await import("jose");
  return _jose;
}

function getSecret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "fallback");
}

function checkRateLimit(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec) return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  if (rec.lockedUntil && now < rec.lockedUntil) return { allowed: false, remaining: 0, retryAfter: Math.ceil((rec.lockedUntil - now) / 1000) };
  if (rec.lockedUntil && now >= rec.lockedUntil) { attempts.delete(ip); return { allowed: true, remaining: MAX_ATTEMPTS - 1 }; }
  if (rec.count >= MAX_ATTEMPTS) { rec.lockedUntil = now + LOCKOUT_MIN * 60000; return { allowed: false, remaining: 0, retryAfter: LOCKOUT_MIN * 60 }; }
  return { allowed: true, remaining: MAX_ATTEMPTS - rec.count - 1 };
}

function recordAttempt(ip, success) {
  if (success) { attempts.delete(ip); return; }
  const rec = attempts.get(ip) || { count: 0, lockedUntil: null };
  rec.count += 1;
  attempts.set(ip, rec);
}

async function verifyCredentials(email, password) {
  if (!email || email.toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase()) return { valid: false, error: "Invalid email or password" };
  if (!ADMIN_PASSWORD_HASH || ADMIN_PASSWORD_HASH.includes("PASTE")) return { valid: false, error: "Server not configured" };
  const match = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!match) return { valid: false, error: "Invalid email or password" };
  return { valid: true };
}

async function createSessionToken(email) {
  const jose = await getJose();
  return new jose.SignJWT({ email, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_HOURS + "h")
    .setIssuer("gominers-ai-audit")
    .setAudience("gominers-dashboard")
    .sign(getSecret());
}

async function verifySessionToken(token) {
  try {
    const jose = await getJose();
    const { payload } = await jose.jwtVerify(token, getSecret(), { issuer: "gominers-ai-audit", audience: "gominers-dashboard" });
    return { valid: true, email: payload.email };
  } catch { return { valid: false }; }
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach(c => {
    const [key, ...val] = c.trim().split("=");
    if (key) cookies[key.trim()] = val.join("=").trim();
  });
  return cookies;
}

function getIp(headers) {
  const forwarded = headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0];
  return "unknown";
}

module.exports = { checkRateLimit, recordAttempt, verifyCredentials, createSessionToken, verifySessionToken, parseCookies, getIp, ADMIN_EMAIL };
