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
    const { url } = body;
    if (!url) return res.status(400).json({ error: "URL required" });

    const cleanUrl = url.startsWith("http") ? url : "https://" + url;
    const pageRes = await fetch(cleanUrl, {
      headers: { "User-Agent": "Gominers-AI-Audit/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000)
    });

    const html = await pageRes.text();
    const headers = {};
    pageRes.headers.forEach((v, k) => { headers[k] = v; });

    // Extract key info
    const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || "";
    const metaDesc = (html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) || [])[1] || "";
    const viewport = (html.match(/<meta[^>]*name=["']viewport["']/i) || []).length > 0;
    const hasHttps = cleanUrl.startsWith("https://");
    const hasCsp = !!headers["content-security-policy"];
    const hasHsts = !!headers["strict-transport-security"];
    const hasXssProtection = !!headers["x-xss-protection"];
    const hasXFrame = !!headers["x-frame-options"];
    const hasContentType = !!headers["x-content-type-options"];
    const htmlSize = html.length;
    const scripts = (html.match(/<script[^>]*>/gi) || []).length;
    const styles = (html.match(/<link[^>]*stylesheet/gi) || []).length;
    const images = (html.match(/<img[^>]*>/gi) || []).length;
    const hasOg = html.includes('property="og:');
    const hasCanonical = html.includes('rel="canonical"');
    const hasSitemap = false;
    const hasStructuredData = html.includes("application/ld+json");
    const hasAriaLabels = html.includes("aria-label") || html.includes("aria-");
    const hasLang = html.includes("<html") && (html.match(/<html[^>]*lang=["']([^"']+)["']/i) || [])[1];
    const hasCharset = html.includes("charset=");
    const hasFavicon = html.includes("rel=\"icon\"") || html.includes("rel=\"shortcut icon\"");
    const hasManifest = html.includes("manifest.json") || html.includes("rel=\"manifest\"");

    return res.status(200).json({
      url: cleanUrl,
      status: pageRes.status,
      html: html.substring(0, 200000),
      analysis: {
        title, metaDesc, viewport, hasHttps, hasCsp, hasHsts,
        hasXssProtection, hasXFrame, hasContentType,
        htmlSize, scripts, styles, images,
        hasOg, hasCanonical, hasStructuredData,
        hasAriaLabels, hasLang, hasCharset, hasFavicon, hasManifest,
        headers
      }
    });
  } catch (e) {
    return res.status(500).json({ error: "Failed to scan: " + e.message });
  }
};
