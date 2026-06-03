const { verifySessionToken, parseCookies } = require("../../lib/secure-auth");

async function auth(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies["gmn_session"];
  if (!token) return { ok: false };
  const result = await verifySessionToken(token);
  return result.valid ? { ok: true, email: result.email } : { ok: false };
}

const MIMO_KEY = process.env.MIMO_API_KEY;
const MIMO_BASE = "https://api.xiaomimimo.com/v1";
const MIMO_MODEL = "mimo-v2.5-pro";

async function callMiMo(systemPrompt, userPrompt) {
  const r = await fetch(MIMO_BASE + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + MIMO_KEY
    },
    body: JSON.stringify({
      model: MIMO_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 12000
    })
  });
  if (!r.ok) {
    const err = await r.text();
    return { error: "MiMo API " + r.status + ": " + err.substring(0, 300) };
  }
  const data = await r.json();
  return data.choices[0].message.content;
}

function buildAuditPrompt(projectName, projectVersion, platforms, webScan) {
  let codeSections = [];
  for (const p of platforms) {
    codeSections.push("### " + p.platform.toUpperCase() + " (" + p.name + ")\n" + (p.code || "No code provided").substring(0, 80000));
  }
  const codeBlock = codeSections.join("\n\n");

  let webBlock = "";
  if (webScan) {
    webBlock = "\n\n### WEBSITE SCAN: " + webScan.url + "\nStatus: " + webScan.status + "\nAnalysis: " + JSON.stringify(webScan.analysis) + "\nHTML preview: " + (webScan.html || "").substring(0, 5000);
  }

  const sys = `You are a senior software engineer performing a comprehensive audit. Analyze the code and return a JSON object with this EXACT structure (no markdown, no code fences, just raw JSON):

{
  "overall_score": <0-100>,
  "cross_platform_score": <0-100>,
  "total_checks": <number>,
  "passed_checks": <number>,
  "failed_checks": <number>,
  "warning_checks": <number>,
  "category_scores": {
    "security": {"score": <0-100>, "passed": <n>, "failed": <n>, "warning": <n>},
    "performance": {"score": <0-100>, "passed": <n>, "failed": <n>, "warning": <n>},
    "code_quality": {"score": <0-100>, "passed": <n>, "failed": <n>, "warning": <n>},
    "seo": {"score": <0-100>, "passed": <n>, "failed": <n>, "warning": <n>},
    "accessibility": {"score": <0-100>, "passed": <n>, "failed": <n>, "warning": <n>},
    "dependencies": {"score": <0-100>, "passed": <n>, "failed": <n>, "warning": <n>},
    "auth": {"score": <0-100>, "passed": <n>, "failed": <n>, "warning": <n>},
    "api_design": {"score": <0-100>, "passed": <n>, "failed": <n>, "warning": <n>},
    "database": {"score": <0-100>, "passed": <n>, "failed": <n>, "warning": <n>},
    "testing": {"score": <0-100>, "passed": <n>, "failed": <n>, "warning": <n>},
    "build_deploy": {"score": <0-100>, "passed": <n>, "failed": <n>, "warning": <n>},
    "mobile": {"score": <0-100>, "passed": <n>, "failed": <n>, "warning": <n>},
    "documentation": {"score": <0-100>, "passed": <n>, "failed": <n>, "warning": <n>}
  },
  "platform_scores": {"web": <0-100>, "ios": <0-100>, "android": <0-100>},
  "issues": [{"id": "SEC-01", "severity": "error"|"warning"|"info", "title": "", "message": "", "file": "", "category": "", "fix": ""}],
  "recommendations": ["string"],
  "launch_readiness": {"ready": bool, "blockers": ["string"], "warnings": ["string"]},
  "ai_analysis": "summary text",
  "estimated_fix_hours": "X hours"
}

Perform 100+ checkpoints across ALL categories. Be thorough.`;

  const user = "Project: " + projectName + " v" + (projectVersion || "1.0.0") + "\n\n" + codeBlock + webBlock + "\n\nPerform full 100+ checkpoint audit and return JSON only.";

  return { sys, user };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const session = await auth(req);
  if (!session.ok) return res.status(401).json({ error: "Unauthorized" });

  if (!MIMO_KEY) return res.status(500).json({ error: "MIMO_API_KEY not configured" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { project_name, project_version, platforms, webScan } = body;

    if (!project_name) return res.status(400).json({ error: "Project name required" });
    if ((!platforms || !platforms.length) && !webScan) return res.status(400).json({ error: "No code or URL" });

    const { sys, user } = buildAuditPrompt(project_name, project_version || "", platforms || [], webScan);
    const text = await callMiMo(sys, user);

    if (typeof text === "object" && text.error) return res.status(500).json(text);

    let result;
    try { result = JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) try { result = JSON.parse(m[0]); } catch {}
      if (!result) return res.status(500).json({ error: "Parse error", raw: text.substring(0, 500) });
    }

    result.id = Date.now().toString(36);
    return res.status(200).json(result);

  } catch (e) {
    return res.status(500).json({ error: "Audit failed: " + e.message });
  }
};
