import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifySessionToken, parseCookies } from "../../lib/secure-auth";

async function auth(req: VercelRequest): Promise<{ ok: boolean; email?: string }> {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies["gmn_session"];
  if (!token) return { ok: false };
  const result = await verifySessionToken(token);
  return result.valid ? { ok: true, email: result.email } : { ok: false };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const session = await auth(req);
  if (!session.ok) return res.status(401).json({ error: "Unauthorized" });

  // POST = Create audit
  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const auditId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    return res.status(200).json({ id: auditId, status: "analyzing", project_name: body.project_name });
  }

  // GET = Get audit by id or list history
  if (req.method === "GET") {
    const { id } = req.query;
    if (id) {
      return res.status(200).json({
        id,
        project_name: "Demo Project",
        project_version: "v1.0.0",
        status: "complete",
        overall_score: 76,
        cross_platform_score: 58,
        platform_scores: { web: 82, ios: 64, android: 71 },
        total_checks: 27,
        passed_checks: 14,
        failed_checks: 8,
        warning_checks: 5,
        platforms: ["web", "ios", "android"],
        ai_analysis: "8 critical cross-platform mismatches found. Order API schemas differ across all 3 platforms. Payment gateway split between DOKU (web) and Stripe (mobile) needs unification. Estimated fix time: 6-8 hours.",
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
    }
    return res.status(200).json([]);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
