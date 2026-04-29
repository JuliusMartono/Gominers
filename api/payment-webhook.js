// www.gominers.id/api/payment-webhook
// Central payment webhook router for all GOMiners sister products
// DOKU sends ALL notifications here → routes to correct product

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — proxy status/verify calls to correct product
  if (req.method === 'GET') {
    const { product, ...rest } = req.query;
    const target = getProductWebhook(product || 'cryptosignal');
    const params = new URLSearchParams(rest).toString();
    const upstream = await fetch(`${target}?${params}`);
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  }

  // POST — DOKU payment notification
  if (req.method === 'POST') {
    const body = req.body || {};
    console.log('GOMiners central webhook received:', JSON.stringify(body));

    // Auto-detect which product this payment belongs to
    const product = detectProduct(req, body);
    const targetUrl = getProductWebhook(product);

    console.log(`Routing → ${product}: ${targetUrl}`);

    try {
      const upstream = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await upstream.json().catch(() => ({ ok: true }));
      console.log(`${product} responded:`, upstream.status);

      // Always return 200 to DOKU so it doesn't retry
      return res.status(200).json({ ok: true, routed_to: product });
    } catch (err) {
      console.error('Routing error:', err.message);
      // Still return 200 to DOKU — log error internally
      return res.status(200).json({ ok: true, error: 'routing_failed' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
};

// ── Product detection logic ──────────────────────────────────────────────────
function detectProduct(req, body = {}) {
  // 1. Explicit query param ?product=cryptosignal
  if (req.query?.product) return req.query.product;

  // 2. additional_info.product in DOKU payload
  if (body?.additional_info?.product) return body.additional_info.product;

  // 3. Invoice number prefix
  const invoice = body?.order?.invoice_number || '';
  if (invoice.startsWith('CS-') || invoice.includes('-CS-')) return 'cryptosignal';
  if (invoice.startsWith('GM-') || invoice.includes('-GM-')) return 'gominers';

  // 4. Plan name hint
  const plan = (body?.additional_info?.plan || '').toLowerCase();
  if (plan.includes('crypto') || plan.includes('signal')) return 'cryptosignal';
  if (plan.includes('miner') || plan.includes('saas')) return 'gominers';

  // Default → cryptosignal (current active product)
  return 'cryptosignal';
}

// ── Product webhook routing table ────────────────────────────────────────────
function getProductWebhook(product) {
  const routes = {
    'cryptosignal': 'https://cryptosignal.id/api/payment-webhook',
    'gominers':     'https://www.gominers.id/api/gominers-payment',
    // Future sister products:
    // 'product3': 'https://product3.com/api/payment-webhook',
  };
  return routes[product] || routes['cryptosignal'];
}
