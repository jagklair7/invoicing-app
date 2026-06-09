/**
 * hooks/useHelcimPay.js
 *
 * Manages the full HelcimPay.js lifecycle:
 *   1. Calls /api/helcim-init to get a checkoutToken from the back-end
 *   2. Loads the HelcimPay.js script once (idempotent)
 *   3. Renders the payment modal via appendHelcimPayIframe()
 *   4. Listens for the payment result on the window message event
 *   5. Calls onSuccess(transaction) or onError(message) accordingly
 *   6. Cleans up the iFrame on unmount or after a result
 *
 * Usage:
 *   const { openPayment, loading, error } = useHelcimPay({
 *     amount: invoice.total,
 *     invoiceNumber: invoice.invoice_number,
 *     customerCode: org.helcim_customer_code ?? undefined,
 *     onSuccess: async (txn) => { await markInvoicePaid(invoice.id, txn) },
 *     onError: (msg) => toast.error(msg),
 *   })
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// 1. Script URL
const HELCIM_JS_URL = 'https://secure.helcim.app/helcim-pay/services/start.js'

function loadHelcimScript() {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${HELCIM_JS_URL}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = HELCIM_JS_URL
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load HelcimPay.js'))
    document.head.appendChild(script)
  })
}

export function useHelcimPay({ amount, invoiceNumber, customerCode, onSuccess, onError }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const secretTokenRef = useRef(null)
  const listenerRef = useRef(null)

  // Clean up iFrame and listener
  const cleanup = useCallback(() => {
    if (typeof window.removeHelcimPayIframe === 'function') {
  window.removeHelcimPayIframe()
}
    if (listenerRef.current) {
      window.removeEventListener('message', listenerRef.current)
      listenerRef.current = null
    }
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const openPayment = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      // 1. Load HelcimPay.js script
      await loadHelcimScript()

      // 2. Initialize checkout session via our back-end
      const res = await fetch('/api/helcim-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount).toFixed(2),
          invoiceNumber: invoiceNumber ?? undefined,
          customerCode: customerCode ?? undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.checkoutToken) {
        throw new Error(data.error ?? 'Could not initialize payment')
      }

      secretTokenRef.current = data.secretToken

      // 3. Listen for the payment result BEFORE opening the modal
      const handleMessage = (event) => {
  if (event.origin !== 'https://secure.helcim.app') return

  let payload
  try {
    payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
  } catch { return }

  const helcimPayJsIdentifierKey = 'helcim-pay-js-' + data.checkoutToken
  if (payload?.eventName !== helcimPayJsIdentifierKey) return

        cleanup()

        if (payload.eventStatus === 'SUCCESS') {
          onSuccess?.(payload.data ?? payload)
        } else {
          const msg = payload.eventMessage ?? 'Payment was not completed'
          setError(msg)
          onError?.(msg)
        }
      }

      listenerRef.current = handleMessage
      window.addEventListener('message', handleMessage)

      // 4. Open modal
      //if (typeof window.appendHelcimPayIframe !== 'function') {
      //  throw new Error('HelcimPay.js did not load correctly')
      //}
      //window.appendHelcimPayIframe(data.checkoutToken)
      if (typeof window.helcimPay === 'undefined') {
        throw new Error('HelcimPay.js did not load correctly')
      }
     // window.helcimPay.init(data.checkoutToken)
      window.appendHelcimPayIframe(data.checkoutToken)
    } catch (err) {
      const msg = err.message || 'Payment initialization failed'
      setError(msg)
      onError?.(msg)
      cleanup()
    } finally {
      setLoading(false)
    }
  }, [amount, invoiceNumber, customerCode, onSuccess, onError, cleanup])

  return { openPayment, loading, error }
}
