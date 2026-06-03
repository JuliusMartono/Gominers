import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyCredentials, createSessionToken, verifySessionToken, checkRateLimit, recordAttempt, parseCookies, getIp } from "../../lib/secure-auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // POST = Login
  if (req.method === "POST") {
    try {
      const { email, password } = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!email || !password) return res.status(400).json({ error: "Email and password required" });

      const ip = getIp(req.headers as any);
      const rate = checkRateLimit(ip);
      if (!rate.allowed) return res.status(429).json({ error: `Too many attempts. Try again in ${Math.ceil((rate.retryAfter || 0) / 60)} minutes.`, locked: true });

      const result = await verifyCredentials(email.trim(), password);
      if (!result.valid) {
        recordAttempt(ip, false);
        return res.status(401).json({ error: result.error, remaining: rate.remaining - 1 });
      }

      recordAttempt(ip, true);
      const token = await createSessionToken(email.trim());

      res.setHeader("Set-Cookie", `gmn_session=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${24 * 60 * 60}; Path=/`);
      return res.status(200).json({ success: true, email: email.trim() });
    } catch {
      return res.status(400).json({ error: "Invalid request" });
    }
  }

  // GET = Check session
  if (req.method === "GET") {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies["gmn_session"];
    if (!token) return res.status(401).json({ authenticated: false });

    const result = await verifySessionToken(token);
    if (!result.valid) return res.status(401).json({ authenticated: false });
    return res.status(200).json({ authenticated: true, email: result.email });
  }

  // DELETE = Logout
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", "gmn_session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/");
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
