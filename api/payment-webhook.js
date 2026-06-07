// api/payment-webhook.js — GoMiners.id Universal DOKU Webhook
// UPDATED CGI handler: user_profiles + subscription_tier + multi-plan

const crypto = require('crypto')
const https  = require('https')

const DOKU_SECRET_KEY = 'SK-QKbcPUHEiwGFsqws0Wts'

const PRODUCT_HANDLERS = {

  // ── CekGejala.id ── UPDATED ──────────────────────────────────────
  'CGI': {
    name: 'CekGejala.id',

    async findInvoice(invoiceNumber) {
      const res = await supabaseGet(
        process.env.CEKGEJALA_SUPABASE_URL,
        process.env.CEKGEJALA_SUPABASE_SERVICE_KEY,
        `invoices?invoice_number=eq.${invoiceNumber}&select=*`
      )
      return res?.[0] || null
    },

    async updateInvoice(invoiceNumber, data) {
      return supabasePatch(
        process.env.CEKGEJALA_SUPABASE_URL,
        process.env.CEKGEJALA_SUPABASE_SERVICE_KEY,
        `invoices?invoice_number=eq.${invoiceNumber}`,
        data
      )
    },

    // UPDATED: multi-plan support, user_profiles, subscription_tier
    async upgradeUser(userId, planDays, invoice) {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + (planDays || 30))

      // Read plan metadata from invoice (saved by payment/create route)
      const tier         = invoice?.plan_tier         || 'pro_individu'
      const planLimit    = invoice?.plan_limit         || 30
      const planDevices  = invoice?.plan_devices       || 1
      const isMitra      = invoice?.is_mitra           || false
      const businessName = invoice?.additional_info?.business_name || null

      const profileUpdate = {
        subscription_tier: tier,                    // was: plan: 'pro'
        plan_limit:        Number(planLimit),
        plan_devices:      Number(planDevices),
        is_mitra_klinik:   isMitra === true || isMitra === 'true',
        plan_expires_at:   expiresAt.toISOString(),
        updated_at:        new Date().toISOString(),
      }
      if (businessName) profileUpdate.business_name = businessName

      return supabasePatch(
        process.env.CEKGEJALA_SUPABASE_URL,
        process.env.CEKGEJALA_SUPABASE_SERVICE_KEY,
        `user_profiles?id=eq.${userId}`,            // was: profiles?id=eq.${userId}
        profileUpdate
      )
    }
  },

  // ── CryptoSignal.id ───────────────────────────────────────────────
  'CSI': {
    name: 'CryptoSignal.id',
    async findInvoice(invoiceNumber) {
      console.log(`[CSI] findInvoice not implemented: ${invoiceNumber}`)
      return null
    },
    async updateInvoice(invoiceNumber, data) {
      console.log(`[CSI] updateInvoice not implemented`)
    },
    async upgradeUser(userId, planDays, invoice) {
      console.log(`[CSI] upgradeUser not implemented`)
    }
  },

  // ── FixMine.app ───────────────────────────────────────────────────
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
    async upgradeUser(userId, planDays, invoice) {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + (planDays || 30))
      return supabasePatch(
        process.env.FIXMINE_SUPABASE_URL,
        process.env.FIXMINE_SUPABASE_KEY,
        `user_profiles?id=eq.${userId}`,
        { subscription_tier: invoice?.plan_tier||'pro_individu', plan_limit: Number(invoice?.plan_limit||30), plan_devices: Number(invoice?.plan_devices||1), is_mitra_klinik: invoice?.is_mitra===true||invoice?.is_mitra==='true', plan_expires_at: expiresAt.toISOString(), updated_at: new Date().toISOString() }
      )
    }
  },
}

// ─── Supabase Helpers (unchanged) ────────────────────────────────────────────
function supabaseGet(url, key, path)        { return supabaseReq(url, key, 'GET',   path, null) }
function supabasePatch(url, key, path, body){ return supabaseReq(url, key, 'PATCH', path, body) }

function supabaseReq(baseUrl, key, method, path, body) {
  return new Promise((resolve, reject) => {
    if (!baseUrl || !key) {
      console.error(`Supabase not configured: baseUrl=${!!baseUrl} key=${!!key}`)
      return resolve(null)
    }
    const url      = `${baseUrl}/rest/v1/${path}`
    const bodyJson = body ? JSON.stringify(body) : undefined
    const urlObj   = new URL(url)
    const options  = {
      hostname: urlObj.hostname, port: 443,
      path: urlObj.pathname + urlObj.search, method,
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
      res.on('end', () => { try { resolve(data ? JSON.parse(data) : null) } catch { resolve(null) } })
    })
    req.on('error', (err) => { console.error('Supabase request error:', err.message); resolve(null) })
    if (bodyJson) req.write(bodyJson)
    req.end()
  })
}

// ─── Signature Verification (unchanged) ──────────────────────────────────────
function verifySignature(headers, bodyJson) {
  const receivedSig = headers['signature'] || headers['Signature'] || ''
  if (!receivedSig) return true
  const clientId         = headers['client-id']         || ''
  const requestId        = headers['request-id']        || ''
  const requestTimestamp = headers['request-timestamp'] || ''
  const digestBase64     = crypto.createHash('sha256').update(bodyJson, 'utf8').digest('base64')
  const component = [
    `Client-Id:${clientId}`, `Request-Id:${requestId}`,
    `Request-Timestamp:${requestTimestamp}`,
    `Request-Target:/api/payment-webhook`,
    `Digest:${digestBase64}`,
  ].join('\n')
  const expected = 'HMACSHA256=' + crypto.createHmac('sha256', DOKU_SECRET_KEY).update(component, 'utf8').digest('base64')
  return expected === receivedSig
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'GoMiners DOKU webhook active', products: Object.keys(PRODUCT_HANDLERS), timestamp: new Date().toISOString() })
  }
  if (req.method !== 'POST') return res.status(200).json({ message: 'OK' })

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

  res.status(200).json({ message: 'OK' })

  try {
    const payload       = JSON.parse(bodyJson)
    const invoiceNumber = payload?.order?.invoice_number
    const status        = payload?.transaction?.status
    const channel       = payload?.channel?.id || payload?.payment?.channel_type || ''

    console.log(`[GoMiners Webhook] invoice=${invoiceNumber} status=${status}`)
    console.log(`[GoMiners Webhook] URL exists: ${!!process.env.CEKGEJALA_SUPABASE_URL}`)
    console.log(`[GoMiners Webhook] KEY exists: ${!!process.env.CEKGEJALA_SUPABASE_SERVICE_KEY}`)
    console.log(`[GoMiners Webhook] URL value: ${(process.env.CEKGEJALA_SUPABASE_URL||'').slice(0,30)}`)

    if (!invoiceNumber || !status) return

    const prefix  = invoiceNumber.split('-')[0]
    const handler = PRODUCT_HANDLERS[prefix]
    if (!handler) { console.log(`[GoMiners Webhook] Unknown prefix: ${prefix}`); return }

    const invoice = await handler.findInvoice(invoiceNumber)
    if (!invoice)  { console.log(`[GoMiners Webhook] Invoice not found: ${invoiceNumber}`); return }

    const mappedStatus =
      status === 'SUCCESS' ? 'paid'    :
      status === 'FAILED'  ? 'failed'  :
      status === 'EXPIRED' ? 'expired' : 'pending'

    await handler.updateInvoice(invoiceNumber, {
      status:          mappedStatus,
      payment_channel: channel,
      paid_at:         mappedStatus === 'paid' ? new Date().toISOString() : null,
      raw_response:    payload,
      updated_at:      new Date().toISOString(),
    })

    if (mappedStatus === 'paid' && invoice.user_id) {
      // UPDATED: pass full invoice so upgradeUser can read plan metadata
      await handler.upgradeUser(invoice.user_id, invoice.plan_days, invoice)
      console.log(`[GoMiners Webhook] ✅ ${handler.name} — user ${invoice.user_id} upgraded (${invoice.plan_id})`)
    }

  } catch (err) {
    console.error('[GoMiners Webhook] Processing error:', err.message)
  }
}
