const bcrypt = require("bcryptjs");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Simple auth check
  const cookies = {};
  (req.headers.cookie || "").split(";").forEach(c => {
    const [k, ...v] = c.trim().split("=");
    if (k) cookies[k.trim()] = v.join("=").trim();
  });
  const token = cookies["gmn_session"];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  // Verify JWT
  try {
    const jose = await import("jose");
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "fallback");
    await jose.jwtVerify(token, secret, { issuer: "gominers-ai-audit", audience: "gominers-dashboard" });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { project_name, issues, sourceCode } = body;

    if (!issues || !issues.length) return res.status(400).json({ error: "No issues to fix" });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

    const contextBlock = sourceCode && sourceCode.length > 50
      ? "## SOURCE CODE:\n" + sourceCode.substring(0, 100000)
      : "## SOURCE CODE: Not available. Generate fixes based on issue descriptions. Provide practical code patterns.";

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
        system: "You are an expert senior engineer. Given audit issues, generate ACTUAL CODE FIXES. When source code is available, generate precise fixes. When not available, generate practical code patterns. Return ONLY valid JSON: {\"summary\":\"...\",\"total_fixes\":0,\"fixes\":[{\"issue_id\":\"\",\"file\":\"\",\"original_snippet\":\"\",\"fixed_snippet\":\"\",\"explanation\":\"\",\"new_files\":[]}],\"dependency_changes\":{\"add\":{},\"remove\":[]}}",
        messages: [{ role: "user", content: "Project: " + (project_name||"Project") + "\n\n## AUDIT ISSUES:\n" + JSON.stringify(issues, null, 2) + "\n\n" + contextBlock }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: "Claude API error: " + err.substring(0, 200) });
    }

    const data = await response.json();
    const text = data.content[0].text;

    let result;
    try { result = JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { result = JSON.parse(m[0]); } catch { result = { error: "Parse error", raw: text.substring(0, 500) }; } }
      else { result = { error: "Parse error", raw: text.substring(0, 500) }; }
    }

    if (result.error) return res.status(500).json(result);
    return res.status(200).json({ ...result, generated_at: new Date().toISOString() });

  } catch (e) {
    return res.status(500).json({ error: "Fix failed: " + e.message });
  }
};
