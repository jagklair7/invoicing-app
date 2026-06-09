/**
 * hooks/useHelcimPay.js
 *
 * Opens a HelcimPay checkout by injecting an iframe overlay directly.
 * No external script needed — uses the checkoutToken from /api/helcim-init.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

export function useHelcimPay({ amount, invoiceNumber, customerCode, onSuccess, onError }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const overlayRef = useRef(null)
  const listenerRef = useRef(null)

  const cleanup = useCallback(() => {
    if (overlayRef.current) {
      overlayRef.current.remove()
      overlayRef.current = null
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
      // 1. Get checkoutToken from backend
      const res = await fetch('/api/helcim-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(Number(amount).toFixed(2)),
          customerCode: customerCode ?? undefined,
        }),
      })

      if (!res.ok) {
        let msg = `Server error: ${res.status}`
        try { const d = await res.json(); msg = d.error ?? msg } catch {}
        throw new Error(msg)
      }

      const data = await res.json()
      if (!data.checkoutToken) {
        throw new Error(data.error ?? 'Could not initialize payment')
      }

      // 2. Listen for payment result
      const handleMessage = (event) => {
        if (event.origin !== 'https://secure.myhelcim.com') return

        let payload
        try {
          payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        } catch { return }

        if (payload?.eventName !== 'HELCIM_PAY_JS_RESULT') return

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

      // 3. Inject iframe overlay
      const overlay = document.createElement('div')
      overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,0.6);
        display: flex; align-items: center; justify-content: center;
      `

      // Close on backdrop click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup()
      })

      const iframe = document.createElement('iframe')
      iframe.src = `https://secure.myhelcim.com/helcim-pay/?checkoutToken=${data.checkoutToken}`
      iframe.style.cssText = `
        width: 480px; max-width: 95vw;
        height: 620px; max-height: 90vh;
        border: none; border-radius: 12px;
        background: white;
      `
      iframe.allow = 'payment'

      overlay.appendChild(iframe)
      document.body.appendChild(overlay)
      overlayRef.current = overlay

    } catch (err) {
      const msg = err.message || 'Payment initialization failed'
      setError(msg)
      onError?.(msg)
      cleanup()
    } finally {
      setLoading(false)
    }
  }, [amount, customerCode, onSuccess, onError, cleanup])

  return { openPayment, loading, error }
}