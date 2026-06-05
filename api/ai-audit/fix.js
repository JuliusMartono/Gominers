const MIMO_KEY = process.env.MIMO_API_KEY;
const MIMO_BASE = "https://api.xiaomimimo.com/v1";
const MIMO_MODEL = "mimo-v2.5-pro";

async function callMiMo(systemPrompt, userPrompt) {
  console.log("[MiMo] Sending request to", MIMO_BASE, "model:", MIMO_MODEL);
  console.log("[MiMo] System prompt length:", systemPrompt.length);
  console.log("[MiMo] User prompt length:", userPrompt.length);

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

  console.log("[MiMo] Response status:", r.status);

  if (!r.ok) {
    const err = await r.text();
    console.log("[MiMo] Error response:", err.substring(0, 500));
    return { error: "MiMo API " + r.status + ": " + err.substring(0, 300) };
  }

  const data = await r.json();
  console.log("[MiMo] Raw response keys:", Object.keys(data));
  console.log("[MiMo] Choices count:", data.choices ? data.choices.length : 0);

  if (!data.choices || !data.choices.length) {
    console.log("[MiMo] Full response:", JSON.stringify(data).substring(0, 1000));
    return { error: "No choices in response", raw: JSON.stringify(data).substring(0, 500) };
  }

  const choice = data.choices[0];
  console.log("[MiMo] Choice keys:", Object.keys(choice));

  const msg = choice.message;
  if (!msg) {
    console.log("[MiMo] No message in choice:", JSON.stringify(choice).substring(0, 500));
    return { error: "No message in response" };
  }

  const content = msg.content;
  console.log("[MiMo] Content type:", typeof content);
  console.log("[MiMo] Content preview:", JSON.stringify(content).substring(0, 300));

  if (typeof content === "string") return content;
  if (typeof content === "object" && content !== null) return JSON.stringify(content);
  return String(content || "");
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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
    const { project_name, issues, sourceCode, issue_index } = body;

    if (!issues || !issues.length) return res.status(400).json({ error: "No issues to fix" });

    console.log("[Fix] Project:", project_name, "| Total issues:", issues.length, "| Single issue index:", issue_index);

    // Fix one issue at a time if issue_index provided
    let issuesToFix = issues;
    if (typeof issue_index === "number" && issue_index >= 0 && issue_index < issues.length) {
      issuesToFix = [issues[issue_index]];
      console.log("[Fix] Single mode - fixing issue", issue_index, ":", issuesToFix[0].id, issuesToFix[0].title);
    }

    const contextBlock = sourceCode && sourceCode.length > 50
      ? "## SOURCE CODE:\n" + sourceCode.substring(0, 100000)
      : "## SOURCE CODE: Not available. Generate fixes based on issue descriptions only.";

    const issuesSummary = issuesToFix.map((iss, i) =>
      (i+1) + ". [" + (iss.severity||"info") + "] " + (iss.id||"") + " - " + (iss.title||iss.message||"") + (iss.file?" (File: "+iss.file+")":"") + (iss.fix?" Fix hint: "+iss.fix:"")
    ).join("\n");

    console.log("[Fix] Issues summary:", issuesSummary.substring(0, 500));

    const sys = "You are a senior engineer. Generate code fixes for audit issues. IMPORTANT: Respond with ONLY a raw JSON object. No markdown, no code fences, no backticks, no explanation before or after the JSON. Just the raw JSON object.\n\nCRITICAL RULES:\n- NEVER target these excluded files: next.config.js, package.json, package-lock.json, middleware.ts, .env, .gitignore, vercel.json, tsconfig.json, app/layout.tsx, app/layout.js, Dockerfile, pages/_app.tsx, pages/_document.tsx\n- For issues about excluded files, set file to null\n- Only fix files that exist in the provided source code\n\nFormat:\n{\"summary\":\"overview\",\"total_fixes\":number,\"fixes\":[{\"issue_id\":\"id\",\"file\":\"path\",\"original_snippet\":\"the old code\",\"fixed_snippet\":\"the new code\",\"explanation\":\"what was fixed\",\"new_files\":[]}]}";
    const user = "Project: " + (project_name||"Project") + "\n\nIssues to fix:\n" + issuesSummary + "\n\n" + contextBlock;

    console.log("[Fix] Calling MiMo...");
    const text = await callMiMo(sys, user);

    if (typeof text === "object" && text.error) {
      console.log("[Fix] MiMo returned error:", text.error);
      return res.status(500).json(text);
    }

    console.log("[Fix] Raw text from MiMo (first 500 chars):", text.substring(0, 500));

    // Clean the response
    let clean = text.replace(/^```(?:json)?\s*\n?/gm, "").replace(/\n?```\s*$/gm, "").trim();

    // Also try removing leading/trailing non-JSON text
    const jsonStart = clean.indexOf("{");
    const jsonEnd = clean.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      clean = clean.substring(jsonStart, jsonEnd + 1);
    }

    console.log("[Fix] Cleaned text (first 500 chars):", clean.substring(0, 500));

    let result;
    try {
      result = JSON.parse(clean);
      console.log("[Fix] JSON parsed successfully. Fixes count:", result.fixes ? result.fixes.length : 0);
    } catch (e) {
      console.log("[Fix] JSON parse failed:", e.message);
      console.log("[Fix] Cleaned text length:", clean.length);
      console.log("[Fix] First 200 chars:", clean.substring(0, 200));
      console.log("[Fix] Last 200 chars:", clean.substring(clean.length - 200));
      return res.status(500).json({
        error: "Parse error: " + e.message,
        raw_start: clean.substring(0, 200),
        raw_end: clean.substring(clean.length - 200),
        raw_length: clean.length
      });
    }

    return res.status(200).json({
      ...result,
      generated_at: new Date().toISOString(),
      issues_fixed: issuesToFix.length,
      total_issues: issues.length,
      issue_index: typeof issue_index === "number" ? issue_index : null
    });

  } catch (e) {
    console.log("[Fix] Exception:", e.message);
    return res.status(500).json({ error: "Fix failed: " + e.message });
  }
};
