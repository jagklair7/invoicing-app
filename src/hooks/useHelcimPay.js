import { useState, useEffect, useRef, useCallback } from 'react'

// Correct modern Helcim Pay.js V2 Script URL
//const HELCIM_JS_URL = 'https://js.helcim.com/helcimPay/index.js'
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
    script.onerror = () => reject(new Error('Failed to load HelcimPay.js. Check your ad-blocker or CSP configuration.'))
    document.head.appendChild(script)
  })
}

export function useHelcimPay({ amount, invoiceNumber, customerCode, onSuccess, onError }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const secretTokenRef = useRef(null)
  const listenerRef = useRef(null)

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
      // 1. Fetch the script
      await loadHelcimScript()

      // 2. Initialize token session from your backend
      const res = await fetch('/api/helcim-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(Number(amount).toFixed(2)),
          invoiceNumber: invoiceNumber ?? undefined,
          customerCode: customerCode ?? undefined,
        }),
      })

      //const data = await res.json()

      // If the response failed or returned an error status code, handle it safely
        if (!res.ok) {
          let errorMessage = `Server error: ${res.statusText} (${res.status})`;
          try {
            const errorData = await res.json();
            errorMessage = errorData.error ?? errorMessage;
          } catch {
            // If it's not valid JSON, we skip parsing it to avoid crashing
          }
          throw new Error(errorMessage);
        }

        // If it's OK, parse the data safely
        const data = await res.json();
        if (!data.checkoutToken) {
          throw new Error(data.error ?? 'Could not initialize payment');
        }

      secretTokenRef.current = data.secretToken

      // 3. Listen for window response messaging
      const handleMessage = (event) => {
        // Match modern v2 container origin
        if (event.origin !== 'https://secure.helcim.app') return

        let payload
        try {
          payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        } catch {
          return
        }

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

      // 4. Fire open container sequence
      if (typeof window.appendHelcimPayIframe !== 'function') {
        throw new Error('HelcimPay.js methods not bound to global window object.')
      }
      
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