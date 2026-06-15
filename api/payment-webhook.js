// api/payment-webhook.js — GoMiners.id Universal DOKU Webhook
// UPDATED CGI handler: user_profiles + subscription_tier + multi-plan

const crypto = require('crypto')

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
      const PLAN_MAP = {
        'pro_monthly':          { tier: 'pro_individu', limit: 30,    devices: 1, mitra: false },
        'pro_individu_monthly': { tier: 'pro_individu', limit: 30,    devices: 1, mitra: false },
        'pro_individu_yearly':  { tier: 'pro_individu', limit: 30,    devices: 1, mitra: false },
        'pro_bisnis_monthly':   { tier: 'pro_bisnis',   limit: 300,   devices: 2, mitra: false },
        'pro_bisnis_yearly':    { tier: 'pro_bisnis',   limit: 300,   devices: 2, mitra: false },
        'komunitas_monthly':    { tier: 'komunitas',    limit: 99999, devices: 5, mitra: true  },
        'komunitas_yearly':     { tier: 'komunitas',    limit: 99999, devices: 5, mitra: true  },
        'enterprise_dp':        { tier: 'enterprise',   limit: 99999, devices: 999, mitra: true },
        'starter_monthly':      { tier: 'starter',      limit: 10,    devices: 1,   mitra: false },
        'pro_keluarga_monthly': { tier: 'pro_keluarga', limit: 20,    devices: 5,   mitra: false },
        'pro_keluarga_yearly':  { tier: 'pro_keluarga_yearly', limit: 200,   devices: 5,   mitra: false },
        'enterprise_growth':    { tier: 'enterprise',   limit: 99999, devices: 200, mitra: true  },
      }
      const planConf     = PLAN_MAP[invoice?.plan_id] || { tier: 'pro_individu', limit: 30, devices: 1, mitra: false }
      const tier         = planConf.tier
      const planLimit    = invoice?.plan_limit   || planConf.limit
      const planDevices  = invoice?.plan_devices || planConf.devices
      const isMitra      = invoice?.is_mitra === true || invoice?.is_mitra === 'true' || planConf.mitra
      const businessName = invoice?.additional_info?.business_name || invoice?.business_name || null
      console.log('[CGI] planId=' + invoice?.plan_id + ' tier=' + tier + ' limit=' + planLimit)

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

async function supabaseReq(baseUrl, key, method, path, body) {
  if (!baseUrl || !key) {
    console.error(`[Supabase] not configured: url=${!!baseUrl} key=${!!key}`)
    return null
  }
  const url = `${baseUrl}/rest/v1/${path}`
  const bodyJson = body ? JSON.stringify(body) : undefined
  console.log(`[Supabase] ${method} ${path.slice(0,50)}`)
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type':  'application/json',
        'apikey':        key,
        'Authorization': `Bearer ${key}`,
        'Prefer':        method === 'PATCH' ? 'return=minimal' : 'return=representation',
      },
      ...(bodyJson ? { body: bodyJson } : {}),
    })
    const text = await res.text()
    console.log(`[Supabase] ${res.status} ${text.slice(0,100)}`)
    if (!text) return null
    return JSON.parse(text)
  } catch(e) {
    console.error(`[Supabase] fetch error: ${e.message}`)
    return null
  }
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
const crypto = require('crypto');

function verifyDokuSignature(req, secretKey) {
  const signature = req.headers['signature'];
  const clientId = req.headers['client-id'];
  const requestId = req.headers['request-id'];
  const requestTimestamp = req.headers['request-timestamp'];
  if (!signature) {
    console.error('[WEBHOOK] Missing signature header');
    return false;
  }
  const bodyJson = JSON.stringify(req.body);
  const digest = 'SHA-256=' + crypto.createHash('sha256').update(bodyJson).digest('base64');
  const component = [
    'Client-Id:' + clientId,
    'Request-Id:' + requestId,
    'Request-Timestamp:' + requestTimestamp,
    'Request-Target:/api/payment-webhook',
    'Digest:' + digest
  ].join('\n');
  const expected = 'HMACSHA256=' + crypto.createHmac('sha256', secretKey).update(component).digest('base64');
  console.log('[WEBHOOK] Sig check — expected:', expected, '| received:', signature);
  return signature === expected;
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {

  // === DOKU SIGNATURE VERIFICATION ===
  if (!verifyDokuSignature(req, process.env.DOKU_SECRET_KEY)) {
    console.error('[WEBHOOK] INVALID SIGNATURE — request rejected');
    return res.status(401).json({ message: 'Invalid signature' });
  }

  // === STATUS MUST BE SUCCESS ===
  const txStatus = req.body?.transaction?.status;
  if (txStatus !== 'SUCCESS') {
    console.log('[WEBHOOK] Non-success status:', txStatus, '— ignored');
    return res.status(200).json({ message: 'Non-success status ignored' });
  }

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
    console.log(`[GoMiners Webhook] prefix=${prefix} handler=${!!handler}`)
    console.log(`[GoMiners Webhook] Supabase URL: ${process.env.CEKGEJALA_SUPABASE_URL}`)
    if (!handler) { console.log(`[GoMiners Webhook] Unknown prefix: ${prefix}`); return }

    let invoice
    try {
      invoice = await handler.findInvoice(invoiceNumber)
    } catch(findErr) {
      console.log(`[GoMiners Webhook] findInvoice error: ${findErr.message}`)
    }
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
      // Re-fetch invoice after update to get fresh data including plan_id
      const freshInvoice = await handler.findInvoice(invoiceNumber)
      await handler.upgradeUser(invoice.user_id, invoice.plan_days, freshInvoice || invoice)
      console.log(`[GoMiners Webhook] ✅ ${handler.name} — user ${invoice.user_id} upgraded (${(freshInvoice||invoice).plan_id})`)
    }

  } catch (err) {
    console.error('[GoMiners Webhook] Processing error:', err.message)
  }
  res.status(200).json({ message: 'OK' })
}
