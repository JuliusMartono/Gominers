import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";
const AUTH_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "fallback");
const SESSION_HOURS = parseInt(process.env.SESSION_DURATION_HOURS || "24");
const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || "5");
const LOCKOUT_MIN = parseInt(process.env.LOCKOUT_DURATION_MINUTES || "30");

const attempts = new Map<string, { count: number; lockedUntil: number | null }>();

export function checkRateLimit(ip: string) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec) return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  if (rec.lockedUntil && now < rec.lockedUntil) return { allowed: false, remaining: 0, retryAfter: Math.ceil((rec.lockedUntil - now) / 1000) };
  if (rec.lockedUntil && now >= rec.lockedUntil) { attempts.delete(ip); return { allowed: true, remaining: MAX_ATTEMPTS - 1 }; }
  if (rec.count >= MAX_ATTEMPTS) { rec.lockedUntil = now + LOCKOUT_MIN * 60000; return { allowed: false, remaining: 0, retryAfter: LOCKOUT_MIN * 60 }; }
  return { allowed: true, remaining: MAX_ATTEMPTS - rec.count - 1 };
}

export function recordAttempt(ip: string, success: boolean) {
  if (success) { attempts.delete(ip); return; }
  const rec = attempts.get(ip) || { count: 0, lockedUntil: null };
  rec.count += 1;
  attempts.set(ip, rec);
}

export async function verifyCredentials(email: string, password: string) {
  if (!email || email.toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase()) return { valid: false, error: "Invalid email or password" };
  if (!ADMIN_PASSWORD_HASH || ADMIN_PASSWORD_HASH.includes("PASTE")) return { valid: false, error: "Server not configured" };
  const match = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!match) return { valid: false, error: "Invalid email or password" };
  return { valid: true };
}

export async function createSessionToken(email: string) {
  return new SignJWT({ email, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .setIssuer("gominers-ai-audit")
    .setAudience("gominers-dashboard")
    .sign(AUTH_SECRET);
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, AUTH_SECRET, { issuer: "gominers-ai-audit", audience: "gominers-dashboard" });
    return { valid: true, email: payload.email as string };
  } catch { return { valid: false }; }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach(c => {
    const [key, ...val] = c.trim().split("=");
    if (key) cookies[key.trim()] = val.join("=").trim();
  });
  return cookies;
}

export function getIp(headers: Record<string, string | string[] | undefined>): string {
  const forwarded = headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0];
  return "unknown";
}

export { ADMIN_EMAIL };
