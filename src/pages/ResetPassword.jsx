// src/pages/ResetPassword.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../app/supabaseClient'
import { useNavigate } from 'react-router-dom'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasRecoverySession, setHasRecoverySession] = useState(false)
  const navigate = useNavigate()

  // Supabase's password-reset email link redirects here with a recovery
  // token in the URL, which the client picks up automatically and turns
  // into a session — we just need to confirm one exists before letting
  // the user submit a new password. If they land here without a valid/
  // unexpired link (e.g. they navigated here directly, or the link was
  // already used), there's no session and we show an error instead of a
  // form that would just fail on submit.
  useEffect(() => {
    let isMounted = true

    async function checkSession() {
      const { data } = await supabase.auth.getSession()
      if (isMounted) {
        setHasRecoverySession(!!data?.session)
        setCheckingSession(false)
      }
    }
    checkSession()

    // In case the recovery token is still being processed when this
    // component mounts, also listen for the PASSWORD_RECOVERY event.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        setHasRecoverySession(true)
        setCheckingSession(false)
      }
    })

    return () => {
      isMounted = false
      listener?.subscription?.unsubscribe()
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      return setError('Password must be at least 8 characters.')
    }
    if (password !== confirmPassword) {
      return setError('Passwords do not match.')
    }

    setLoading(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateErr) {
      setError(updateErr.message)
    } else {
      setSuccess(true)
      setTimeout(() => navigate('/', { replace: true }), 2000)
    }
  }

  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#0d7377', textAlign: 'center' }}>Klair Computer Inc.</h2>

      {checkingSession ? (
        <p style={{ textAlign: 'center', color: '#64748b' }}>Checking your reset link…</p>

      ) : !hasRecoverySession ? (
        <>
          <p style={{ textAlign: 'center', color: '#ef4444' }}>
            This reset link is invalid or has expired.
          </p>
          <p style={{ textAlign: 'center', marginTop: 16 }}>
            <a href="/login" style={{ color: '#0d7377' }}>Back to sign in</a>
            {' '}to request a new one.
          </p>
        </>

      ) : success ? (
        <p style={{ textAlign: 'center', color: '#0d7377' }}>
          Password updated. Redirecting you to your dashboard…
        </p>

      ) : (
        <>
          <p style={{ textAlign: 'center', color: '#64748b' }}>
            Choose a new password for your account.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '24px' }}>
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              required
              autoFocus
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              required
            />

            {error && (
              <p style={{ color: '#ef4444', fontSize: 14, textAlign: 'center', margin: 0 }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ padding: '12px', background: '#0d7377', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}