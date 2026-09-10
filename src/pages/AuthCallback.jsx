import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'

const translateError = (errorCode, description) => {
  if (!errorCode) return null
  if (errorCode === 'otp_expired') return 'This login link has expired. Request a new one from the login page.'
  if (errorCode === 'invalid_request') return 'The login link is invalid. Please start again from the login page.'
  if (errorCode === 'access_denied') return description || 'The login link was denied or expired.'
  return description || 'Unable to complete sign-in. Please try again.'
}

export default function AuthCallback() {
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('Checking your login link...')
  const navigate = useNavigate()

  useEffect(() => {
    let settled = false

    const finishSuccess = async (session) => {
      if (settled) return
      settled = true
      const user = session.user
      await ensureProfileExists(user)
      setStatus('success')
      setMessage('Your account is now confirmed. Redirecting you to setup your company…')
      window.setTimeout(() => navigate('/', { replace: true }), 2000)
    }

    const finishError = (msg) => {
      if (settled) return
      settled = true
      setStatus('error')
      setMessage(msg)
    }

    const handleCallback = async () => {
      const hash = window.location.hash || ''
      const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
      const errorCode = params.get('error_code') || params.get('error')
      const errorDescription = params.get('error_description')

      if (errorCode) {
        finishError(translateError(errorCode, errorDescription))
        return
      }

      // v2: the client auto-parses the URL fragment on load (detectSessionInUrl: true
      // is the default). Just read the session it produced.
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        finishError(error.message || 'Unable to parse the login link.')
        return
      }

      if (data?.session) {
        finishSuccess(data.session)
        return
      }

      // Fallback: in case the SDK hasn't finished processing the URL yet by the
      // time getSession() ran, listen briefly for the resulting auth event.
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          listener.subscription.unsubscribe()
          finishSuccess(session)
        }
      })

      window.setTimeout(() => {
        listener.subscription.unsubscribe()
        finishError('Nothing to confirm. Please sign in manually.')
      }, 4000)
    }

    handleCallback()
  }, [navigate])

  async function ensureProfileExists(user) {
    if (!user?.id) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile) {
      await supabase.from('profiles').insert({
        id: user.id,
        full_name: user.user_metadata?.full_name ?? null,
        is_super_admin: false,
      })
    }
  }

  return (
    <div style={{ maxWidth: '420px', margin: '100px auto', padding: '24px', fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h2 style={{ color: '#0d7377', marginBottom: '14px' }}>
        {status === 'loading' ? 'Confirming sign-in…' : status === 'success' ? 'Signed in!' : 'Sign-in link problem'}
      </h2>
      <p style={{ color: '#475569', lineHeight: 1.7, marginBottom: 24 }}>
        {message}
      </p>
      {status === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
          <Link to="/login" style={{ color: '#0d7377', textDecoration: 'underline' }}>
            Return to login
          </Link>
          <Link to="/signup" style={{ color: '#0d7377', textDecoration: 'underline' }}>
            Create an account
          </Link>
        </div>
      )}
    </div>
  )
}