const { verifySessionToken, parseCookies } = require("../../lib/secure-auth");

async function auth(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies["gmn_session"];
  if (!token) return { ok: false };
  const result = await verifySessionToken(token);
  return result.valid ? { ok: true, email: result.email } : { ok: false };
}

const AUDIT_CHECKLIST = `
=== COMPREHENSIVE 100+ POINT AUDIT CHECKLIST ===

## 1. SECURITY (20 checks)
SEC-01: Hardcoded API keys, secrets, tokens in source code
SEC-02: SQL injection vulnerability patterns
SEC-03: XSS (Cross-Site Scripting) vulnerability patterns
SEC-04: CSRF protection implementation
SEC-05: Authentication token storage (localStorage vs httpOnly cookies)
SEC-06: Password hashing implementation (bcrypt, argon2)
SEC-07: Rate limiting on auth endpoints
SEC-08: Input validation and sanitization
SEC-09: CORS configuration (wildcard origins)
SEC-10: Content Security Policy headers
SEC-11: HTTPS enforcement
SEC-12: HSTS headers
SEC-13: Session management (timeout, rotation)
SEC-14: JWT implementation (algorithm, expiration, claims)
SEC-15: Environment variable handling (not committed to git)
SEC-16: Dependency vulnerability patterns
SEC-17: File upload validation
SEC-18: API authentication (bearer tokens, API keys)
SEC-19: Privilege escalation patterns
SEC-20: Sensitive data in logs/console.log

## 2. CROSS-PLATFORM CONSISTENCY (15 checks)
CP-01: API endpoint URL consistency across platforms
CP-02: Request/Response schema consistency
CP-03: Data model field naming consistency (name vs full_name)
CP-04: Authentication flow consistency
CP-05: Error response format consistency
CP-06: Pagination implementation consistency
CP-07: Date/time format consistency
CP-08: Currency/locale handling consistency
CP-09: Image/media URL handling consistency
CP-10: Push notification payload consistency
CP-11: Deep link handling consistency
CP-12: Version checking/update mechanism
CP-13: Shared types/constants definitions
CP-14: API versioning strategy
CP-15: Offline/sync strategy consistency

## 3. PERFORMANCE (12 checks)
PERF-01: Bundle size analysis (large imports)
PERF-02: Code splitting and lazy loading
PERF-03: Image optimization (format, size, lazy loading)
PERF-04: Caching strategy (HTTP headers, service worker)
PERF-05: Database query optimization (N+1 queries)
PERF-06: Unnecessary re-renders (React: memo, useMemo, useCallback)
PERF-07: Memory leak patterns (event listeners, subscriptions)
PERF-08: Third-party script impact
PERF-09: Font loading strategy (font-display)
PERF-10: API response payload size
PERF-11: Compression (gzip, brotli)
PERF-12: CDN usage for static assets

## 4. SEO (8 checks)
SEO-01: Title tag presence and length
SEO-02: Meta description presence and length
SEO-03: Open Graph tags
SEO-04: Canonical URL
SEO-05: Structured data (JSON-LD)
SEO-06: Sitemap.xml
SEO-07: Robots.txt
SEO-08: Heading hierarchy (h1, h2, h3)

## 5. ACCESSIBILITY (8 checks)
A11Y-01: ARIA labels on interactive elements
A11Y-02: Color contrast ratios
A11Y-03: Keyboard navigation support
A11Y-04: Alt text on images
A11Y-05: Form label associations
A11Y-06: Focus management
A11Y-07: Screen reader compatibility
A11Y-08: Reduced motion support

## 6. CODE QUALITY (10 checks)
CQ-01: TypeScript strict mode / type safety
CQ-02: Consistent code style (ESLint/Prettier config)
CQ-03: Dead code detection
CQ-04: Code duplication patterns
CQ-05: Function complexity (cyclomatic complexity)
CQ-06: Proper error boundaries
CQ-07: Naming conventions consistency
CQ-08: Import organization (absolute vs relative)
CQ-09: Magic numbers/strings (should be constants)
CQ-10: TODO/FIXME/HACK comments

## 7. DEPENDENCIES (8 checks)
DEP-01: Outdated dependencies
DEP-02: Known vulnerability packages
DEP-03: License compatibility
DEP-04: Unused dependencies
DEP-05: Duplicate dependencies
DEP-06: Lock file presence (package-lock.json / yarn.lock)
DEP-07: Node version specification (.nvmrc, engines)
DEP-08: Dev dependencies in production

## 8. API DESIGN (10 checks)
API-01: RESTful endpoint naming conventions
API-02: HTTP method correctness (GET for read, POST for create)
API-03: Status code usage (200, 201, 400, 401, 403, 404, 500)
API-04: Error response structure consistency
API-05: Request validation
API-06: Response pagination
API-07: API documentation (OpenAPI/Swagger)
API-08: Versioning strategy
API-09: Rate limiting implementation
API-10: Idempotency for mutations

## 9. AUTHENTICATION & AUTHORIZATION (8 checks)
AUTH-01: Password policy enforcement
AUTH-02: Multi-factor authentication support
AUTH-03: OAuth/SSO implementation
AUTH-04: Role-based access control
AUTH-05: Token refresh mechanism
AUTH-06: Account lockout policy
AUTH-07: Password reset flow security
AUTH-08: Session invalidation on logout

## 10. DATABASE (6 checks)
DB-01: Migration files present and organized
DB-02: Index optimization for queries
DB-03: Connection pooling configuration
DB-04: Data validation at schema level
DB-05: Backup strategy indicators
DB-06: Sensitive data encryption at rest

## 11. TESTING (6 checks)
TEST-01: Unit test coverage
TEST-02: Integration test presence
TEST-03: E2E test presence
TEST-04: Test configuration files
TEST-05: Mock/stub patterns
TEST-06: CI/CD test pipeline

## 12. BUILD & DEPLOYMENT (8 checks)
BUILD-01: CI/CD configuration (GitHub Actions, etc.)
BUILD-02: Environment variable management
BUILD-03: Build optimization (tree shaking, minification)
BUILD-04: Docker configuration
BUILD-05: Deployment rollback strategy
BUILD-06: Health check endpoints
BUILD-07: Feature flag implementation
BUILD-08: Monitoring/alerting setup

## 13. MOBILE-SPECIFIC (8 checks)
MOB-01: App permissions (minimal necessary)
MOB-02: Offline support strategy
MOB-03: Push notification implementation
MOB-04: Deep link handling
MOB-05: App size optimization
MOB-06: Battery usage optimization
MOB-07: Network error handling
MOB-08: Device-specific UI adaptation

## 14. PWA & MODERN WEB (6 checks)
PWA-01: Service worker implementation
PWA-02: Web app manifest
PWA-03: Offline fallback page
PWA-04: Install prompt handling
PWA-05: Background sync
PWA-06: Push notification support

## 15. INTERNATIONALIZATION (4 checks)
I18N-01: i18n framework setup
I18N-02: Hardcoded string detection
I18N-03: RTL support
I18N-04: Date/number/currency formatting

## 16. ERROR HANDLING & MONITORING (6 checks)
MON-01: Global error boundary
MON-02: Error logging service (Sentry, etc.)
MON-03: User-friendly error pages
MON-04: API error retry logic
MON-05: Crash reporting
MON-06: Performance monitoring (Web Vitals)

## 17. DOCUMENTATION (5 checks)
DOC-01: README completeness
DOC-02: API documentation
DOC-03: Environment setup guide
DOC-04: Architecture documentation
DOC-05: Changelog / release notes

## 18. STATE MANAGEMENT (5 checks)
STATE-01: State management pattern consistency
STATE-02: Global state size management
STATE-03: State persistence strategy
STATE-04: Derived state computation
STATE-05: State debug tooling

=== END CHECKLIST ===
`;

async function fetchGitHubRepo(repoUrl, token) {
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\s#]+)/);
  if (!match) throw new Error("Invalid GitHub URL");
  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");
  const headers = { "Accept": "application/vnd.github.v3+json", "User-Agent": "Gominers-AI-Audit" };
  if (token) headers["Authorization"] = "Bearer " + token;

  let branch = "main";
  try {
    const repoRes = await fetch("https://api.github.com/repos/" + owner + "/" + repo, { headers });
    if (repoRes.ok) { const d = await repoRes.json(); branch = d.default_branch || "main"; }
  } catch {}

  const treeRes = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/git/trees/" + branch + "?recursive=1", { headers });
  if (!treeRes.ok) throw new Error("Could not access repo. Make sure it's public or provide a GitHub token.");
  const treeData = await treeRes.json();

  const codeExt = [".js",".jsx",".ts",".tsx",".vue",".kt",".java",".swift",".dart",".json",".xml",".gradle",".yaml",".yml",".css",".scss",".html",".env.example"];
  const skip = ["node_modules",".git","build","dist",".next",".vercel","__pycache__",".gradle","Pods","vendor",".output"];

  const files = (treeData.tree||[]).filter(f => {
    if (f.type !== "blob") return false;
    if (skip.some(d => f.path.startsWith(d+"/") || f.path.includes("/"+d+"/"))) return false;
    return codeExt.some(ext => f.path.endsWith(ext));
  });

  const prioritized = files.sort((a,b) => {
    const p = ["package.json","tsconfig.json","build.gradle","Podfile",".env.example","next.config","app.json","android/build.gradle","app/build.gradle"];
    const aS = p.findIndex(x => a.path.endsWith(x));
    const bS = p.findIndex(x => b.path.endsWith(x));
    return (aS===-1?99:aS)-(bS===-1?99:bS);
  }).slice(0, 60);

  let code = "";
  let fetched = 0;
  for (const file of prioritized) {
    try {
      const fRes = await fetch("https://api.github.com/repos/"+owner+"/"+repo+"/contents/"+file.path+"?ref="+branch, { headers });
      if (!fRes.ok) continue;
      const fData = await fRes.json();
      if (fData.encoding==="base64" && fData.content) {
        const content = Buffer.from(fData.content, "base64").toString("utf-8");
        if (content.length > 40000) continue;
        code += "=== "+file.path+" ===\n"+content+"\n\n";
        fetched++;
      }
    } catch {}
  }
  return { code, filesCount: fetched, totalFiles: files.length, repo: owner+"/"+repo, branch };
}

async function analyzeWithClaude(platforms, projectName, projectVersion, webScan) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "ANTHROPIC_API_KEY not configured" };

  let userMessage = "## Project: " + projectName + (projectVersion ? " v" + projectVersion : "") + "\n\n";

  if (webScan) {
    userMessage += "## LIVE WEBSITE SCAN (" + webScan.url + ")\n";
    userMessage += "Status: " + webScan.status + "\n";
    userMessage += "Analysis:\n" + JSON.stringify(webScan.analysis, null, 2) + "\n";
    userMessage += "HTML (truncated):\n" + (webScan.html||"").substring(0, 50000) + "\n\n";
  }

  for (const p of platforms) {
    userMessage += "## PLATFORM: " + p.platform.toUpperCase() + " (" + p.name + ")\n";
    if (p.repo) userMessage += "Repository: " + p.repo + "\n";
    userMessage += "Files: " + p.filesCount + "/" + p.totalFiles + "\n\n";
    userMessage += p.code.substring(0, 100000) + "\n\n";
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
      max_tokens: 8000,
      system: "You are a senior cross-platform product auditor at Gominers. Perform a comprehensive audit using the 100+ point checklist below. Be thorough, specific, and actionable.\n\n" + AUDIT_CHECKLIST + "\n\nReturn ONLY valid JSON:\n{\n  \"overall_score\": <0-100>,\n  \"cross_platform_score\": <0-100>,\n  \"platform_scores\": { \"web\": <0-100>, \"ios\": <0-100>, \"android\": <0-100> },\n  \"total_checks\": <number>,\n  \"passed_checks\": <number>,\n  \"failed_checks\": <number>,\n  \"warning_checks\": <number>,\n  \"category_scores\": {\n    \"security\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"cross_platform\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"performance\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"seo\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"accessibility\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"code_quality\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"dependencies\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"api_design\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"auth\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"database\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"testing\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"build_deploy\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"mobile\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"pwa\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"i18n\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"monitoring\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"documentation\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>},\n    \"state_management\": {\"score\": <0-100>, \"passed\": <n>, \"failed\": <n>, \"warning\": <n>}\n  },\n  \"issues\": [\n    {\"id\": \"SEC-01\", \"severity\": \"error|warning|info\", \"category\": \"Security\", \"platforms\": [\"web\",\"ios\",\"android\"], \"title\": \"<short title>\", \"message\": \"<detailed description>\", \"file\": \"<file path>\", \"fix\": \"<step by step fix instructions>\"}\n  ],\n  \"ai_analysis\": \"<3-5 paragraph executive summary>\",\n  \"recommendations\": [\"<prioritized recommendation>\", ...],\n  \"launch_readiness\": {\"ready\": true|false, \"blockers\": [\"<critical blocker>\", ...], \"warnings\": [\"<warning>\", ...]},\n  \"estimated_fix_hours\": \"<range>\"\n}",
      messages: [{ role: "user", content: userMessage }]
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
    return { error: "Could not parse AI response", raw: text.substring(0, 500) };
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
    const { project_name, project_version, platforms, webScan } = body;

    if (!project_name) return res.status(400).json({ error: "Project name required" });

    // For GitHub repos, fetch code
    const processedPlatforms = [];
    for (const p of (platforms || [])) {
      if (p.repoUrl && p.repoUrl.includes("github.com") && !p.code) {
        try {
          const fetched = await fetchGitHubRepo(p.repoUrl);
          processedPlatforms.push({ ...p, ...fetched });
        } catch (e) {
          processedPlatforms.push({ ...p, error: e.message });
        }
      } else if (p.code && p.code.trim().length > 20) {
        processedPlatforms.push(p);
      }
    }

    if (!processedPlatforms.length && !webScan) {
      return res.status(400).json({ error: "No valid code or website scan provided" });
    }

    const analysis = await analyzeWithClaude(processedPlatforms, project_name, project_version, webScan);
    if (analysis.error) return res.status(500).json({ error: analysis.error });

    const auditId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    return res.status(200).json({
      id: auditId, project_name, project_version: project_version || "",
      status: "complete", ...analysis,
      created_at: new Date().toISOString(), completed_at: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ error: "Analysis failed: " + e.message });
  }
};
