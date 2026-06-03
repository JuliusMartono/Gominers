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
      max_tokens: 8000
    })
  });
  if (!r.ok) {
    const err = await r.text();
    return { error: "MiMo API " + r.status + ": " + err.substring(0, 300) };
  }
  const data = await r.json();
  return data.choices[0].message.content;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Auth
  const cookies = {};
  (req.headers.cookie || "").split(";").forEach(c => {
    const [k, ...v] = c.trim().split("=");
    if (k) cookies[k.trim()] = v.join("=").trim();
  });
  const token = cookies["gmn_session"];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const jose = await import("jose");
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "fallback");
    await jose.jwtVerify(token, secret, { issuer: "gominers-ai-audit", audience: "gominers-dashboard" });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!MIMO_KEY) return res.status(500).json({ error: "MIMO_API_KEY not configured" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { project_name, issues, sourceCode } = body;

    if (!issues || !issues.length) return res.status(400).json({ error: "No issues to fix" });

    const contextBlock = sourceCode && sourceCode.length > 50
      ? "## SOURCE CODE:\n" + sourceCode.substring(0, 100000)
      : "## SOURCE CODE: Not available. Generate fixes based on issue descriptions only.";

    const issuesSummary = issues.map((iss, i) =>
      (i+1) + ". [" + (iss.severity||"info") + "] " + (iss.id||"") + " - " + (iss.title||iss.message||"") + (iss.file?" (File: "+iss.file+")":"") + (iss.fix?" Fix hint: "+iss.fix:"")
    ).join("\n");

    const sys = "You are a senior engineer. Given audit issues, generate code fixes. Return ONLY raw JSON, no markdown, no code fences. JSON format: {\"summary\":\"overview\",\"total_fixes\":number,\"fixes\":[{\"issue_id\":\"id\",\"file\":\"path\",\"original_snippet\":\"code\",\"fixed_snippet\":\"code\",\"explanation\":\"why\",\"new_files\":[]}]}";
    const user = "Project: " + (project_name||"Project") + "\n\nIssues:\n" + issuesSummary + "\n\n" + contextBlock;

    const text = await callMiMo(sys, user);

    if (typeof text === "object" && text.error) return res.status(500).json(text);

    let result;
    text.replace(/^```(?:json)?\s*\n?/gm, "").replace(/\n?```\s*$/gm, "").trim();

    try { result = JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) try { result = JSON.parse(m[0]); } catch {}
      if (!result) return res.status(500).json({ error: "Parse error", raw: text.substring(0, 500) });
    }

    return res.status(200).json({ ...result, generated_at: new Date().toISOString() });

  } catch (e) {
    return res.status(500).json({ error: "Fix failed: " + e.message });
  }
};
