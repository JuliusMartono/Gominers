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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const session = await auth(req);
  if (!session.ok) return res.status(401).json({ error: "Unauthorized" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { repo_url, github_token } = body;

    if (!repo_url || !github_token) return res.status(400).json({ error: "Repository URL and token required" });

    const match = repo_url.match(/github\.com\/([^\/]+)\/([^\/\s#]+)/);
    if (!match) return res.status(400).json({ error: "Invalid GitHub URL" });

    const owner = match[1];
    const repo = match[2].replace(/\.git$/, "");

    const headers = {
      "Accept": "application/vnd.github.v3+json",
      "Authorization": "Bearer " + github_token,
      "User-Agent": "Gominers-AI-Audit"
    };

    // 1. Check token is valid
    const userRes = await fetch("https://api.github.com/user", { headers });
    if (!userRes.ok) return res.status(401).json({ error: "Invalid GitHub token", valid: false });
    const userData = await userRes.json();

    // 2. Check repo access
    const repoRes = await fetch("https://api.github.com/repos/" + owner + "/" + repo, { headers });
    if (!repoRes.ok) return res.status(403).json({ error: "Token does not have access to " + owner + "/" + repo, valid: false });
    const repoData = await repoRes.json();

    // 3. Check write permission
    const perms = repoData.permissions || {};
    const canWrite = perms.push || perms.admin;

    return res.status(200).json({
      valid: true,
      can_write: canWrite,
      username: userData.login,
      repo: owner + "/" + repo,
      default_branch: repoData.default_branch || "main",
      is_private: repoData.private,
      permissions: perms
    });

  } catch (e) {
    return res.status(500).json({ error: "Validation failed: " + e.message, valid: false });
  }
};
