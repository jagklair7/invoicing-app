// src/utils/sendReceipt.js
import { exportReceiptPDF } from './exportReceiptPDF'
import { supabase } from '../app/supabaseClient'

export async function sendReceipt(payment, invoice, customer, orgId) {
  const { data: { user } } = await supabase.auth.getUser()

  const { pdfBase64, filename } = await exportReceiptPDF(payment, invoice, customer, orgId)

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-receipt`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        payment_id: payment.id,
        pdf_base64: pdfBase64,
        filename,
        sent_by: user?.id,
      }),
    }
  )

  const result = await res.json()
  if (!res.ok) {
    throw new Error(result.error || 'Failed to send receipt')
  }
  return result
}