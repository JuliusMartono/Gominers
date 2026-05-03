// api/payment-webhook.js
// GoMiners.id — Universal DOKU Payment Webhook
// Handles ALL GoMiners family products from one endpoint
//
// DOKU Dashboard → Settings → HTTP Notifications → URL:
//   https://www.gominers.id/api/payment-webhook
//
// Invoice prefix routing:
//   CGI-xxx → CekGejala.id (Supabase)
//   CSI-xxx → CryptoSignal.id (add config when ready)
//   GMI-xxx → GoMiners.id (add config when ready)

const crypto = require('crypto')
const https  = require('https')

const DOKU_SECRET_KEY = 'SK-QKbcPUHEiwGFsqws0Wts'

// ─── Product Handlers ─────────────────────────────────────────────────────────
// Each product defines how to: find invoice, update invoice, upgrade user
// Add new products here without touching the main webhook logic

const PRODUCT_HANDLERS = {

  // ── CekGejala.id (Supabase) ────────────────────────────────────────────────
  'CGI': {
    name: 'CekGejala.id',
    async findInvoice(invoiceNumber) {
      const res = await supabaseGet(
        process.env.CEKGEJALA_SUPABASE_URL,
        process.env.CEKGEJALA_SUPABASE_KEY,
        `invoices?invoice_number=eq.${invoiceNumber}&select=*`
      )
      return res?.[0] || null
    },
    async updateInvoice(invoiceNumber, data) {
      return supabasePatch(
        process.env.CEKGEJALA_SUPABASE_URL,
        process.env.CEKGEJALA_SUPABASE_KEY,
        `invoices?invoice_number=eq.${invoiceNumber}`,
        data
      )
    },
    async upgradeUser(userId, planDays) {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + (planDays || 30))
      return supabasePatch(
        process.env.CEKGEJALA_SUPABASE_URL,
        process.env.CEKGEJALA_SUPABASE_KEY,
        `profiles?id=eq.${userId}`,
        { plan: 'pro', plan_expires_at: expiresAt.toISOString(), updated_at: new Date().toISOString() }
      )
    }
  },

  // ── CryptoSignal.id — add database config when you share what DB it uses ──
  'CSI': {
    name: 'CryptoSignal.id',
    async findInvoice(invoiceNumber) {
      // TODO: implement based on CryptoSignal database
      // If Supabase: copy CGI handler above with CRYPTOSIGNAL_SUPABASE_URL
      // If Firebase: use Firebase REST API
      // If other: implement accordingly
      console.log(`[CSI] findInvoice not implemented yet for: ${invoiceNumber}`)
      return null
    },
    async updateInvoice(invoiceNumber, data) {
      console.log(`[CSI] updateInvoice not implemented yet`)
    },
    async upgradeUser(userId, planDays) {
      console.log(`[CSI] upgradeUser not implemented yet`)
    }
  },
  'FMI': {
    name: 'FixMine.app',
    async findInvoice(invoiceNumber) {
      const res = await supabaseGet(
        process.env.FIXMINE_SUPABASE_URL,
        process.env.FIXMINE_SUPABASE_KEY,
        `invoices?invoice_number=eq.${invoiceNumber}&select=*`
      )
      return res?.[0] || null
    },
    async updateInvoice(invoiceNumber, data) {
      return supabasePatch(
        process.env.FIXMINE_SUPABASE_URL,
        process.env.FIXMINE_SUPABASE_KEY,
        `invoices?invoice_number=eq.${invoiceNumber}`,
        data
      )
    },
    async upgradeUser(userId, planDays) {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + (planDays || 30))
      return supabasePatch(
        process.env.FIXMINE_SUPABASE_URL,
        process.env.FIXMINE_SUPABASE_KEY,
        `profiles?id=eq.${userId}`,
        { plan: 'pro', plan_expires_at: expiresAt.toISOString(), updated_at: new Date().toISOString() }
      )
    }
  },

}

// ─── Supabase Helpers ─────────────────────────────────────────────────────────

function supabaseGet(url, key, path) {
  return supabaseReq(url, key, 'GET', path, null)
}

function supabasePatch(url, key, path, body) {
  return supabaseReq(url, key, 'PATCH', path, body)
}

function supabaseReq(baseUrl, key, method, path, body) {
  return new Promise((resolve, reject) => {
    if (!baseUrl || !key) {
      console.error(`Supabase not configured: baseUrl=${!!baseUrl} key=${!!key}`)
      return resolve(null)
    }

    const url = `${baseUrl}/rest/v1/${path}`
    const bodyJson = body ? JSON.stringify(body) : undefined

    const urlObj = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type':  'application/json',
        'apikey':        key,
        'Authorization': `Bearer ${key}`,
        'Prefer':        method === 'PATCH' ? 'return=minimal' : 'return=representation',
      },
    }
    if (bodyJson) options.headers['Content-Length'] = Buffer.byteLength(bodyJson)

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(data ? JSON.parse(data) : null) }
        catch { resolve(null) }
      })
    })
    req.on('error', (err) => {
      console.error('Supabase request error:', err.message)
      resolve(null)
    })
    if (bodyJson) req.write(bodyJson)
    req.end()
  })
}

// ─── Signature Verification ───────────────────────────────────────────────────

function verifySignature(headers, bodyJson) {
  const receivedSig = headers['signature'] || headers['Signature'] || ''
  if (!receivedSig) return true // Allow unsigned (DOKU test mode)

  const clientId         = headers['client-id']         || ''
  const requestId        = headers['request-id']        || ''
  const requestTimestamp = headers['request-timestamp'] || ''

  const digestBase64 = crypto.createHash('sha256')
    .update(bodyJson, 'utf8').digest('base64')

  const component = [
    `Client-Id:${clientId}`,
    `Request-Id:${requestId}`,
    `Request-Timestamp:${requestTimestamp}`,
    `Request-Target:/api/payment-webhook`,
    `Digest:${digestBase64}`,
  ].join('\n')

  const expected = 'HMACSHA256=' + crypto
    .createHmac('sha256', DOKU_SECRET_KEY)
    .update(component, 'utf8')
    .digest('base64')

  return expected === receivedSig
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  // Health check
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'GoMiners DOKU webhook active',
      products: Object.keys(PRODUCT_HANDLERS),
      timestamp: new Date().toISOString(),
    })
  }

  if (req.method !== 'POST') {
    return res.status(200).json({ message: 'OK' })
  }

  // Read body
  let bodyJson = ''
  try {
    bodyJson = await new Promise((resolve, reject) => {
      let data = ''
      req.on('data', chunk => data += chunk)
      req.on('end', () => resolve(data))
      req.on('error', reject)
    })
  } catch (err) {
    console.error('[GoMiners Webhook] Failed to read body:', err.message)
    return res.status(200).json({ message: 'OK' })
  }

  // ALWAYS return 200 immediately — DOKU retries if response is slow
  res.status(200).json({ message: 'OK' })

  // Process async after responding
  try {
    const payload = JSON.parse(bodyJson)
    const invoiceNumber = payload?.order?.invoice_number
    const status        = payload?.transaction?.status
    const channel       = payload?.channel?.id || payload?.payment?.channel_type || ''

    console.log(`[GoMiners Webhook] invoice=${invoiceNumber} status=${status} channel=${channel}`)

    if (!invoiceNumber || !status) {
      console.log('[GoMiners Webhook] Missing data — skip')
      return
    }

    // Route to product handler by invoice prefix (CGI, CSI, GMI, etc.)
    const prefix  = invoiceNumber.split('-')[0]
    const handler = PRODUCT_HANDLERS[prefix]

    if (!handler) {
      console.log(`[GoMiners Webhook] Unknown prefix: ${prefix} — skip`)
      return
    }

    console.log(`[GoMiners Webhook] Routing to: ${handler.name}`)

    // Find invoice
    const invoice = await handler.findInvoice(invoiceNumber)
    if (!invoice) {
      console.log(`[GoMiners Webhook] Invoice not found: ${invoiceNumber}`)
      return
    }

    const mappedStatus =
      status === 'SUCCESS' ? 'paid'    :
      status === 'FAILED'  ? 'failed'  :
      status === 'EXPIRED' ? 'expired' : 'pending'

    // Update invoice status
    await handler.updateInvoice(invoiceNumber, {
      status:          mappedStatus,
      payment_channel: channel,
      paid_at:         mappedStatus === 'paid' ? new Date().toISOString() : null,
      raw_response:    payload,
      updated_at:      new Date().toISOString(),
    })

    // Upgrade user on successful payment
    if (mappedStatus === 'paid' && invoice.user_id) {
      await handler.upgradeUser(invoice.user_id, invoice.plan_days)
      console.log(`[GoMiners Webhook] ✅ ${handler.name} — user ${invoice.user_id} upgraded to Pro`)
    }

  } catch (err) {
    console.error('[GoMiners Webhook] Processing error:', err.message)
    // Response already sent — just log
  }
}