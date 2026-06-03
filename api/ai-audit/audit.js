const { verifySessionToken, parseCookies } = require("../../lib/secure-auth");

async function auth(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies["gmn_session"];
  if (!token) return { ok: false };
  const result = await verifySessionToken(token);
  return result.valid ? { ok: true, email: result.email } : { ok: false };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const session = await auth(req);
  if (!session.ok) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const auditId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    return res.status(200).json({ id: auditId, status: "analyzing", project_name: body.project_name });
  }

  if (req.method === "GET") {
    const { id } = req.query;
    if (id) {
      return res.status(200).json({
        id: id,
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
        ai_analysis: "8 critical cross-platform mismatches found.",
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
    }
    return res.status(200).json([]);
  }

  return res.status(405).json({ error: "Method not allowed" });
};
