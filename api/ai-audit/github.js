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

    if (!repo_url) return res.status(400).json({ error: "Repository URL required" });

    const match = repo_url.match(/github\.com\/([^\/]+)\/([^\/\s#]+)/);
    if (!match) return res.status(400).json({ error: "Invalid GitHub URL. Format: https://github.com/owner/repo" });

    const owner = match[1];
    const repo = match[2].replace(/\.git$/, "");

    const headers = { "Accept": "application/vnd.github.v3+json", "User-Agent": "Gominers-AI-Audit" };
    if (github_token) headers["Authorization"] = "Bearer " + github_token;

    // Get default branch
    const repoRes = await fetch("https://api.github.com/repos/" + owner + "/" + repo, { headers });
    if (!repoRes.ok) return res.status(400).json({ error: "Could not access repo. Make sure it's public or provide a GitHub token." });
    const repoData = await repoRes.json();
    const branch = repoData.default_branch || "main";

    // Get tree
    const treeRes = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/git/trees/" + branch + "?recursive=1", { headers });
    if (!treeRes.ok) return res.status(400).json({ error: "Could not fetch repo tree" });
    const treeData = await treeRes.json();

    const codeExtensions = [".js", ".jsx", ".ts", ".tsx", ".vue", ".kt", ".java", ".swift", ".dart", ".json", ".xml", ".gradle", ".yaml", ".yml"];
    const skipDirs = ["node_modules", ".git", "build", "dist", ".next", ".vercel", "__pycache__", ".gradle", "Pods"];

    const allFiles = (treeData.tree || []).filter(f => {
      if (f.type !== "blob") return false;
      if (skipDirs.some(d => f.path.startsWith(d + "/") || f.path.includes("/" + d + "/"))) return false;
      return codeExtensions.some(ext => f.path.endsWith(ext));
    });

    // Fetch files
    const prioritized = allFiles.sort((a, b) => {
      const p = [".ts", ".tsx", ".js", ".jsx", ".vue", ".kt", ".java", ".swift", "package.json", "build.gradle"];
      const aS = p.findIndex(x => a.path.endsWith(x));
      const bS = p.findIndex(x => b.path.endsWith(x));
      return (aS === -1 ? 99 : aS) - (bS === -1 ? 99 : bS);
    }).slice(0, 60);

    let codeBlock = "";
    let fetched = 0;

    for (const file of prioritized) {
      try {
        const fRes = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + file.path + "?ref=" + branch, { headers });
        if (!fRes.ok) continue;
        const fData = await fRes.json();
        if (fData.encoding === "base64" && fData.content) {
          const content = Buffer.from(fData.content, "base64").toString("utf-8");
          if (content.length > 40000) continue;
          codeBlock += "=== " + file.path + " ===\n" + content + "\n\n";
          fetched++;
        }
      } catch (e) { continue; }
    }

    return res.status(200).json({
      repo: owner + "/" + repo,
      branch: branch,
      filesCount: fetched,
      totalFiles: allFiles.length,
      code: codeBlock,
      description: repoData.description || ""
    });

  } catch (e) {
    return res.status(500).json({ error: "Failed: " + e.message });
  }
};
