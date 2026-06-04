const MIMO_KEY = process.env.MIMO_API_KEY;
const MIMO_BASE = "https://api.xiaomimimo.com/v1";
const MIMO_MODEL = "mimo-v2.5-pro";

// Files that should NEVER be modified by auto-fix
const EXCLUDED_FILES = [
  "next.config.js", "next.config.ts", "next.config.mjs",
  "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "middleware.ts", "middleware.js", "middleware.tsx",
  ".env", ".env.local", ".env.production", ".env.development",
  "vercel.json", "tsconfig.json", "tailwind.config.js", "tailwind.config.ts",
  "postcss.config.js", "postcss.config.mjs",
  ".gitignore", ".eslintrc.js", ".eslintrc.json", "eslint.config.mjs",
  "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
  "app/layout.tsx", "app/layout.js", "app/layout.jsx",
  "pages/_app.tsx", "pages/_app.js", "pages/_document.tsx", "pages/_document.js",
  "app/manifest.json", "public/manifest.json",
  "android/app/build.gradle", "ios/Podfile",
  "capacitor.config.ts", "capacitor.config.js",
  "app.yaml", "app.json"
];

// File extensions that should never be created
const EXCLUDED_EXTENSIONS = [
  ".env", ".pem", ".key", ".cert", ".crt", ".p12", ".jks"
];

function isExcludedFile(filePath) {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  for (const excl of EXCLUDED_FILES) {
    if (normalized === excl.toLowerCase() || normalized.endsWith("/" + excl.toLowerCase())) {
      return true;
    }
  }
  for (const ext of EXCLUDED_EXTENSIONS) {
    if (normalized.endsWith(ext)) return true;
  }
  return false;
}

async function getFileSHA(owner, repo, filePath, token, branch) {
  const url = "https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + filePath + "?ref=" + branch;
  const r = await fetch(url, {
    headers: {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Gominers-AI-Audit"
    }
  });
  if (!r.ok) return null;
  const data = await r.json();
  return { sha: data.sha, content: Buffer.from(data.content, "base64").toString("utf-8") };
}

async function updateFile(owner, repo, filePath, content, sha, token, branch, message) {
  const url = "https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + filePath;
  const r = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Gominers-AI-Audit"
    },
    body: JSON.stringify({
      message: message,
      content: Buffer.from(content).toString("base64"),
      sha: sha,
      branch: branch
    })
  });
  if (!r.ok) {
    const err = await r.json();
    return { ok: false, error: err.message || "GitHub API error" };
  }
  const data = await r.json();
  return { ok: true, commit_url: data.commit.html_url };
}

async function listRepoFiles(owner, repo, token, branch, path) {
  path = path || "";
  const url = "https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + path + "?ref=" + branch;
  const r = await fetch(url, {
    headers: {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Gominers-AI-Audit"
    }
  });
  if (!r.ok) return [];
  const items = await r.json();
  let files = [];
  for (const item of items) {
    if (item.type === "file") {
      files.push(item.path);
    } else if (item.type === "directory" && !["node_modules", ".git", ".next", "build", "dist", ".vercel"].includes(item.name)) {
      const subFiles = await listRepoFiles(owner, repo, token, branch, item.path);
      files = files.concat(subFiles);
    }
  }
  return files;
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

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { repo_url, github_token, fixes, branch, mode } = body;

    if (!repo_url || !github_token) return res.status(400).json({ error: "Repo URL and token required" });
    if (!fixes || !fixes.length) return res.status(400).json({ error: "No fixes to apply" });

    // Parse repo URL
    const match = repo_url.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
    if (!match) return res.status(400).json({ error: "Invalid GitHub URL" });
    const owner = match[1];
    const repo = match[2].replace(/\.git$/, "");
    const targetBranch = branch || "main";

    // DRY RUN MODE — preview only, no changes
    if (mode === "preview") {
      const existingFiles = await listRepoFiles(owner, repo, github_token, targetBranch);
      const preview = [];

      for (const fix of fixes) {
        const file = fix.file;
        if (!file) {
          preview.push({ fix_id: fix.issue_id, file: null, action: "skip", reason: "No file path" });
          continue;
        }

        if (isExcludedFile(file)) {
          preview.push({ fix_id: fix.issue_id, file: file, action: "skip", reason: "Excluded file" });
          continue;
        }

        const exists = existingFiles.some(f => f.toLowerCase() === file.toLowerCase());
        if (!exists) {
          preview.push({ fix_id: fix.issue_id, file: file, action: "skip", reason: "File does not exist in repo" });
          continue;
        }

        if (!fix.fixed_snippet || fix.fixed_snippet.trim().length < 5) {
          preview.push({ fix_id: fix.issue_id, file: file, action: "skip", reason: "No fix code provided" });
          continue;
        }

        preview.push({
          fix_id: fix.issue_id,
          file: file,
          action: "edit",
          explanation: fix.explanation || ""
        });
      }

      const editable = preview.filter(p => p.action === "edit").length;
      const skipped = preview.filter(p => p.action === "skip").length;

      return res.status(200).json({
        mode: "preview",
        total_fixes: fixes.length,
        will_edit: editable,
        will_skip: skipped,
        preview: preview
      });
    }

    // APPLY MODE — actually push changes
    const results = [];
    const existingFiles = await listRepoFiles(owner, repo, github_token, targetBranch);

    for (const fix of fixes) {
      const file = fix.file;

      // SAFETY: Skip if no file
      if (!file) {
        results.push({ fix_id: fix.issue_id, file: null, status: "skipped", reason: "No file path" });
        continue;
      }

      // SAFETY: Skip excluded files
      if (isExcludedFile(file)) {
        results.push({ fix_id: fix.issue_id, file: file, status: "skipped", reason: "Excluded file (config/core)" });
        continue;
      }

      // SAFETY: Only edit existing files, never create new
      const exists = existingFiles.some(f => f.toLowerCase() === file.toLowerCase());
      if (!exists) {
        results.push({ fix_id: fix.issue_id, file: file, status: "skipped", reason: "File not in repo" });
        continue;
      }

      // SAFETY: Need actual fix code
      if (!fix.fixed_snippet || fix.fixed_snippet.trim().length < 5) {
        results.push({ fix_id: fix.issue_id, file: file, status: "skipped", reason: "No fix code" });
        continue;
      }

      try {
        // Get current file
        const current = await getFileSHA(owner, repo, file, github_token, targetBranch);
        if (!current) {
          results.push({ fix_id: fix.issue_id, file: file, status: "skipped", reason: "Cannot read file" });
          continue;
        }

        // Apply fix: replace original_snippet with fixed_snippet in file content
        let newContent = current.content;
        const original = fix.original_snippet || "";
        const fixed = fix.fixed_snippet || "";

        if (original && original.length > 10 && newContent.includes(original)) {
          // Direct replacement
          newContent = newContent.replace(original, fixed);
        } else {
          // Try to find similar content and append fix as comment
          // Or skip if we can't find the original
          results.push({ fix_id: fix.issue_id, file: file, status: "skipped", reason: "Cannot locate original code in file" });
          continue;
        }

        // SAFETY: Verify content actually changed
        if (newContent === current.content) {
          results.push({ fix_id: fix.issue_id, file: file, status: "skipped", reason: "No change after fix" });
          continue;
        }

        // SAFETY: Verify file size change is reasonable (< 50% increase)
        const sizeDiff = Math.abs(newContent.length - current.content.length);
        const sizeRatio = sizeDiff / current.content.length;
        if (sizeRatio > 0.5) {
          results.push({ fix_id: fix.issue_id, file: file, status: "skipped", reason: "Change too large (>50%)" });
          continue;
        }

        // Push to GitHub
        const commitMsg = "fix(" + (fix.issue_id || "AI") + "): " + (fix.explanation || "Auto-fix").substring(0, 72);
        const result = await updateFile(owner, repo, file, newContent, current.sha, github_token, targetBranch, commitMsg);

        if (result.ok) {
          results.push({ fix_id: fix.issue_id, file: file, status: "applied", commit_url: result.commit_url });
        } else {
          results.push({ fix_id: fix.issue_id, file: file, status: "error", reason: result.error });
        }

      } catch (e) {
        results.push({ fix_id: fix.issue_id, file: file, status: "error", reason: e.message.substring(0, 100) });
      }
    }

    const applied = results.filter(r => r.status === "applied").length;
    const skipped = results.filter(r => r.status === "skipped").length;
    const errors = results.filter(r => r.status === "error").length;

    return res.status(200).json({
      summary: applied + " applied, " + skipped + " skipped, " + errors + " errors",
      total: results.length,
      applied: applied,
      skipped: skipped,
      errors: errors,
      results: results
    });

  } catch (e) {
    return res.status(500).json({ error: "Apply failed: " + e.message });
  }
};
