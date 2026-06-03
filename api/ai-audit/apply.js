const { verifySessionToken, parseCookies } = require("../../lib/secure-auth");

async function auth(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies["gmn_session"];
  if (!token) return { ok: false };
  const result = await verifySessionToken(token);
  return result.valid ? { ok: true, email: result.email } : { ok: false };
}

async function getFileSHA(owner, repo, path, branch, headers) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  return data.sha;
}

async function commitFile(owner, repo, path, content, message, branch, headers, sha) {
  const body = {
    message,
    content: Buffer.from(content).toString("base64"),
    branch
  };
  if (sha) body.sha = sha;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Failed to commit ${path}: ${err.message || JSON.stringify(err)}`);
  }
  return await res.json();
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
    const { repo_url, github_token, fixes, branch } = body;

    if (!repo_url) return res.status(400).json({ error: "Repository URL required" });
    if (!github_token) return res.status(400).json({ error: "GitHub Personal Access Token required for write access" });
    if (!fixes || !fixes.length) return res.status(400).json({ error: "No fixes to apply" });

    const match = repo_url.match(/github\.com\/([^\/]+)\/([^\/\s#]+)/);
    if (!match) return res.status(400).json({ error: "Invalid GitHub URL" });

    const owner = match[1];
    const repo = match[2].replace(/\.git$/, "");
    const targetBranch = branch || "main";
    const headers = {
      "Accept": "application/vnd.github.v3+json",
      "Authorization": "Bearer " + github_token,
      "User-Agent": "Gominers-AI-Audit"
    };

    const results = [];

    for (const fix of fixes) {
      // Apply file modifications
      if (fix.file && fix.fixed_snippet) {
        try {
          // Get current file content
          const fileRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${fix.file}?ref=${targetBranch}`, { headers });
          if (fileRes.ok) {
            const fileData = await fileRes.json();
            let content = Buffer.from(fileData.content, "base64").toString("utf-8");

            // Apply the fix by replacing the original snippet
            if (fix.original_snippet && content.includes(fix.original_snippet.trim())) {
              content = content.replace(fix.original_snippet.trim(), fix.fixed_snippet.trim());
            } else {
              // If exact match not found, replace entire file with fixed snippet
              content = fix.fixed_snippet;
            }

            await commitFile(owner, repo, fix.file, content, `fix(${fix.issue_id}): ${fix.explanation || "Auto-fix by Gominers AI"}`, targetBranch, headers, fileData.sha);
            results.push({ file: fix.file, status: "fixed", issue: fix.issue_id });
          } else {
            // File doesn't exist, create it
            await commitFile(owner, repo, fix.file, fix.fixed_snippet, `feat(${fix.issue_id}): Create ${fix.file} - ${fix.explanation || "Auto-fix"}`, targetBranch, headers, null);
            results.push({ file: fix.file, status: "created", issue: fix.issue_id });
          }
        } catch (e) {
          results.push({ file: fix.file, status: "error", error: e.message, issue: fix.issue_id });
        }
      }

      // Create new files
      if (fix.new_files) {
        for (const nf of fix.new_files) {
          try {
            const existingSHA = await getFileSHA(owner, repo, nf.path, targetBranch, headers);
            await commitFile(owner, repo, nf.path, nf.content, `feat(${fix.issue_id}): Create ${nf.path}`, targetBranch, headers, existingSHA);
            results.push({ file: nf.path, status: existingSHA ? "updated" : "created", issue: fix.issue_id });
          } catch (e) {
            results.push({ file: nf.path, status: "error", error: e.message, issue: fix.issue_id });
          }
        }
      }
    }

    const fixed = results.filter(r => r.status === "fixed" || r.status === "created" || r.status === "updated").length;
    const errors = results.filter(r => r.status === "error").length;

    return res.status(200).json({
      success: true,
      summary: `${fixed} files fixed, ${errors} errors`,
      branch: targetBranch,
      repo: owner + "/" + repo,
      results,
      commit_url: `https://github.com/${owner}/${repo}/tree/${targetBranch}`
    });
  } catch (e) {
    return res.status(500).json({ error: "Apply failed: " + e.message });
  }
};
