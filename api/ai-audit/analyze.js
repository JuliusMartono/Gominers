const { verifySessionToken, parseCookies } = require("../../lib/secure-auth");

async function auth(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies["gmn_session"];
  if (!token) return { ok: false };
  const result = await verifySessionToken(token);
  return result.valid ? { ok: true, email: result.email } : { ok: false };
}

async function fetchGitHubRepo(repoUrl, token) {
  // Parse owner/repo from URL
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\s#]+)/);
  if (!match) throw new Error("Invalid GitHub URL");
  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");

  const headers = { "Accept": "application/vnd.github.v3+json", "User-Agent": "Gominers-AI-Audit" };
  if (token) headers["Authorization"] = "Bearer " + token;

  // Get repo tree
  const treeRes = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/git/trees/main?recursive=1", { headers });
  if (!treeRes.ok) {
    const masterRes = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/git/trees/master?recursive=1", { headers });
    if (!masterRes.ok) throw new Error("Could not fetch repo tree. Check if repo is public.");
    const masterData = await masterRes.json();
    return await fetchFiles(owner, repo, masterData, headers);
  }
  const treeData = await treeRes.json();
  return await fetchFiles(owner, repo, treeData, headers);
}

async function fetchFiles(owner, repo, treeData, headers) {
  const codeExtensions = [".js", ".jsx", ".ts", ".tsx", ".vue", ".kt", ".java", ".swift", ".dart", ".json", ".xml", ".gradle", ".yaml", ".yml"];
  const skipDirs = ["node_modules", ".git", "build", "dist", ".next", ".vercel", "__pycache__", ".gradle", "Pods"];

  const files = (treeData.tree || []).filter(f => {
    if (f.type !== "blob") return false;
    if (skipDirs.some(d => f.path.startsWith(d + "/") || f.path.includes("/" + d + "/"))) return false;
    return codeExtensions.some(ext => f.path.endsWith(ext));
  });

  // Fetch top 80 most important files (limit to avoid huge payloads)
  const prioritized = files.sort((a, b) => {
    const priority = [".ts", ".tsx", ".js", ".jsx", ".vue", ".kt", ".java", ".swift", "package.json", "build.gradle"];
    const aScore = priority.findIndex(p => a.path.endsWith(p));
    const bScore = priority.findIndex(p => b.path.endsWith(p));
    return (aScore === -1 ? 99 : aScore) - (bScore === -1 ? 99 : bScore);
  }).slice(0, 80);

  let codeBlock = "";
  let fetched = 0;

  for (const file of prioritized) {
    try {
      const res = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + file.path, { headers });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.encoding === "base64" && data.content) {
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        if (content.length > 50000) continue; // Skip huge files
        codeBlock += "=== " + file.path + " ===\n" + content + "\n\n";
        fetched++;
      }
    } catch (e) { continue; }
  }

  return { code: codeBlock, filesCount: fetched, totalFiles: files.length };
}

async function analyzeWithClaude(platforms) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "ANTHROPIC_API_KEY not configured" };

  let systemPrompt = `You are a senior cross-platform code auditor. Analyze the provided code from multiple platforms and return a JSON report.

IMPORTANT: Return ONLY valid JSON, no markdown, no explanation. Structure:
{
  "overall_score": <0-100>,
  "cross_platform_score": <0-100>,
  "platform_scores": { "web": <0-100>, "ios": <0-100>, "android": <0-100> },
  "total_checks": <number>,
  "passed_checks": <number>,
  "failed_checks": <number>,
  "warning_checks": <number>,
  "issues": [
    { "severity": "error|warning|info", "platforms": ["web","ios","android"], "message": "<description>", "type": "API|Schema|Security|Config|Architecture|Integration", "file": "<file path>", "fix": "<how to fix>" }
  ],
  "ai_analysis": "<2-3 paragraph summary of critical findings>",
  "recommendations": ["<actionable recommendation>", ...],
  "estimated_fix_hours": "<range>"
}

Check for:
1. API endpoint consistency across platforms (same URLs, same params)
2. Data schema consistency (same field names, types)
3. Authentication flow consistency
4. Dependency versions alignment
5. Security issues (hardcoded secrets, insecure storage)
6. Shared types/constants alignment
7. Error handling patterns
8. State management patterns
9. Build configuration issues
10. Platform-specific code quality`;

  let userMessage = "Analyze these cross-platform codebases:\n\n";
  for (const p of platforms) {
    userMessage += "## PLATFORM: " + p.platform.toUpperCase() + " (" + p.name + ")\n";
    userMessage += "Files scanned: " + p.filesCount + "/" + p.totalFiles + "\n\n";
    userMessage += p.code.substring(0, 120000) + "\n\n";
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    return { error: "Claude API error: " + err };
  }

  const data = await response.json();
  const text = data.content[0].text;

  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { error: "Could not parse AI response", raw: text };
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
    const { project_name, project_version, platforms } = body;

    if (!project_name || !platforms || !platforms.length) {
      return res.status(400).json({ error: "Project name and at least one platform required" });
    }

    // Validate platforms have code
    const validPlatforms = platforms.filter(p => p.code && p.code.trim().length > 20);
    if (!validPlatforms.length) {
      return res.status(400).json({ error: "No valid code found. Provide GitHub URLs or paste code." });
    }

    // Run AI analysis
    const analysis = await analyzeWithClaude(validPlatforms);

    if (analysis.error) {
      return res.status(500).json({ error: analysis.error });
    }

    const auditId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    return res.status(200).json({
      id: auditId,
      project_name: project_name,
      project_version: project_version || "",
      status: "complete",
      ...analysis,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    });

  } catch (e) {
    return res.status(500).json({ error: "Analysis failed: " + e.message });
  }
};
