import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { to, subject, pdfBase64, filename, customerName } = req.body

    if (!to || !pdfBase64) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const response = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject: subject || 'Invoice from Klair Computer Inc.',
      html: `
        <div style="font-family: Arial; line-height:1.6">
          <h2>Invoice</h2>
          <p>Hi ${customerName || ''},</p>
          <p>Please find your invoice attached.</p>
          <p>Thank you for your business.</p>
        </div>
      `,
      attachments: [
        {
          filename: filename || 'invoice.pdf',
          content: pdfBase64.split(',')[1], // remove data URI prefix
        },
      ],
    })

    return res.status(200).json({ success: true, id: response.id })

  } catch (err) {
    console.error('Email send error:', err)
    return res.status(500).json({ error: 'Failed to send email' })
  }
}