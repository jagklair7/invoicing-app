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
    const handleCallback = async () => {
      const hash = window.location.hash || ''
      const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
      const errorCode = params.get('error_code') || params.get('error')
      const errorDescription = params.get('error_description')

      if (errorCode) {
        setStatus('error')
        setMessage(translateError(errorCode, errorDescription))
        return
      }

      const { data, error } = await supabase.auth.getSessionFromUrl({ storeSession: true })
      if (error) {
        setStatus('error')
        setMessage(translateError(error.error, error.error_description) || error.message || 'Unable to parse the login link.')
        return
      }

      if (data?.session) {
        setStatus('success')
        setMessage('Your account is now confirmed. Redirecting you to the dashboard…')
        window.setTimeout(() => navigate('/', { replace: true }), 2000)
        return
      }

      setStatus('error')
      setMessage('Nothing to confirm. Please sign in manually.')
    }

    handleCallback()
  }, [navigate])

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
