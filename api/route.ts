// DOKU Webhook — gominer pattern
// Configure in DOKU Dashboard: Notification URL = https://fixmine.app/api/payment/webhook
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-server'

const CLIENT_ID  = process.env.DOKU_CLIENT_ID!
const SECRET_KEY = process.env.DOKU_SECRET_KEY!

function verifyWebhookSignature(req: NextRequest, rawBody: string): boolean {
  try {
    const clientId         = req.headers.get('Client-Id') || ''
    const requestId        = req.headers.get('Request-Id') || ''
    const requestTimestamp = req.headers.get('Request-Timestamp') || ''
    const signature        = req.headers.get('Signature') || ''
    const targetPath       = '/api/payment/webhook'

    const digest = 'SHA-256=' + crypto.createHash('sha256').update(rawBody).digest('base64')
    const componentToSign = [
      `Client-Id:${clientId}`,
      `Request-Id:${requestId}`,
      `Request-Timestamp:${requestTimestamp}`,
      `Request-Target:${targetPath}`,
      `Digest:${digest}`,
    ].join('\n')
    const expected = 'HMACSHA256=' + crypto.createHmac('sha256', SECRET_KEY).update(componentToSign).digest('base64')
    return signature === expected && clientId === CLIENT_ID
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  if (!verifyWebhookSignature(req, rawBody)) {
    console.error('DOKU webhook: invalid signature — possible fraud attempt')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let data: any
  try { data = JSON.parse(rawBody) }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const invoiceNo = data.order?.invoice_number
  if (!invoiceNo) return NextResponse.json({ error: 'Missing invoice number' }, { status: 400 })

  const isPaid = data.transaction?.status === 'SUCCESS'
  const channel = data.transaction?.payment_method || data.transaction?.type || 'unknown'

  console.log(`DOKU webhook: invoice=${invoiceNo} status=${data.transaction?.status} channel=${channel}`)

  // Fetch invoice
  const { data: invoice, error } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('invoice_number', invoiceNo)
    .single()

  if (error || !invoice) {
    console.error('Invoice not found:', invoiceNo)
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // Update invoice
  await supabaseAdmin.from('invoices').update({
    status: isPaid ? 'paid' : 'failed',
    payment_channel: channel,
    paid_at: isPaid ? new Date().toISOString() : null,
    raw_response: data,
    updated_at: new Date().toISOString(),
  }).eq('invoice_number', invoiceNo)

  if (isPaid) {
    if (invoice.plan_days > 0) {
      // Pro Monthly — activate plan
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + invoice.plan_days)

      const { error: updateErr } = await supabaseAdmin
        .from('profiles')
        .update({
          plan: 'pro',
          plan_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoice.user_id)

      if (updateErr) console.error('Profile update error:', updateErr)
      else console.log(`✅ Pro activated: user=${invoice.user_id} expires=${expiresAt.toISOString()}`)

    } else {
      // One-Time Fix — restore 1 diagnosis by decrementing usage count
      const month = new Date().toISOString().slice(0, 7) // YYYY-MM

      const { data: usage } = await supabaseAdmin
        .from('usage')
        .select('count')
        .eq('user_id', invoice.user_id)
        .eq('month', month)
        .single()

      if (usage && usage.count > 0) {
        await supabaseAdmin.from('usage').update({
          count: usage.count - 1,
          updated_at: new Date().toISOString(),
        }).eq('user_id', invoice.user_id).eq('month', month)
        console.log(`✅ One-time fix: user=${invoice.user_id} usage decremented from ${usage.count} to ${usage.count - 1}`)
      } else {
        console.log(`✅ One-time fix: user=${invoice.user_id} no usage record yet — user has full quota`)
      }
    }
  }

  // DOKU requires 200 OK
  return NextResponse.json({ status: 'ok' }, { status: 200 })
}
