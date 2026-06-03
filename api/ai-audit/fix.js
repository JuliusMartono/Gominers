const { verifySessionToken, parseCookies } = require("../../lib/secure-auth");

async function auth(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies["gmn_session"];
  if (!token) return { ok: false };
  const result = await verifySessionToken(token);
  return result.valid ? { ok: true, email: result.email } : { ok: false };
}

async function generateFixes(issues, sourceCode, projectName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "ANTHROPIC_API_KEY not configured" };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: `You are an expert senior engineer. Given audit issues and source code, generate ACTUAL CODE FIXES for each file.

Return ONLY valid JSON:
{
  "summary": "What was fixed overall",
  "total_fixes": <number>,
  "fixes": [
    {
      "issue_id": "SEC-01",
      "file": "src/config/auth.ts",
      "original_snippet": "the exact code that needs to change (10-30 lines)",
      "fixed_snippet": "the replacement code",
      "explanation": "what was fixed and why",
      "new_files": [
        {
          "path": "src/types/shared.ts",
          "content": "full file content if a new file needs to be created"
        }
      ]
    }
  ],
  "dependency_changes": {
    "add": {"package": "version"},
    "remove": ["package"]
  },
  "config_changes": [
    {
      "file": "next.config.js",
      "original_snippet": "old config",
      "fixed_snippet": "new config"
    }
  ]
}

Rules:
- Generate REAL working code, not pseudocode
- Keep existing functionality intact
- Follow the project's existing code style
- For security fixes, be thorough but not breaking
- For cross-platform fixes, ensure consistency
- Include all necessary imports
- For new dependency additions, specify exact version`,
      messages: [{ role: "user", content: `Project: ${projectName}\n\n## AUDIT ISSUES:\n${JSON.stringify(issues, null, 2)}\n\n## SOURCE CODE:\n${sourceCode.substring(0, 120000)}` }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    return { error: "Claude API error: " + err.substring(0, 200) };
  }

  const data = await response.json();
  const text = data.content[0].text;
  try { return JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]); } catch {}
    return { error: "Could not parse fix response", raw: text.substring(0, 500) };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const session = await auth(req);
  if (!session.ok) return res.status(401).json({ error: "Unauthorized" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { project_name, issues, sourceCode } = body;

    if (!issues || !issues.length) return res.status(400).json({ error: "No issues to fix" });
    if (!sourceCode) return res.status(400).json({ error: "Source code required for fixing" });

    const fixes = await generateFixes(issues, sourceCode, project_name || "Project");
    if (fixes.error) return res.status(500).json({ error: fixes.error });

    return res.status(200).json({ ...fixes, generated_at: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: "Fix generation failed: " + e.message });
  }
};
