//src/pages/Login.jsx
import { useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'

// ── OAuth provider icons ─────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  )
}
function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#1877F2" d="M18 9a9 9 0 1 0-10.4 8.89v-6.29H5.31V9h2.29V7.02c0-2.26 1.35-3.51 3.41-3.51.99 0 2.02.18 2.02.18v2.22h-1.14c-1.12 0-1.47.7-1.47 1.41V9h2.5l-.4 2.6h-2.1v6.29A9 9 0 0 0 18 9z"/>
    </svg>
  )
}
// Consistent pill-shaped OAuth button — matches the plain inline-style
// approach already used throughout this file rather than introducing a
// CSS class or Tailwind here.
function OAuthButton({ icon, label, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: '11px', borderRadius: '8px', border: '1px solid #cbd5e1',
        background: 'white', color: '#1e293b', fontSize: 14, fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
        width: '100%',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(null) // 'google' | 'facebook' | 'apple' | null
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    
    if (error) {
      alert(error.message)
    } else {
      navigate('/') // Go to dashboard on success
    }
    setLoading(false)
  }

  // Works for both sign-in and first-time sign-up — Supabase creates the
  // account automatically on first OAuth login, then redirects back to
  // /auth/callback (already handled elsewhere in the app, per the
  // bypassRoutes list in Layout.jsx) before landing on the dashboard,
  // where the existing "no org yet" flow sends new users to /onboarding.
  // Apple sign-in is left out for now (needs an Apple Developer
  // membership) — add an <OAuthButton provider="apple" .../> above once
  // that's set up; the handler below already supports any provider string.
  async function handleOAuthLogin(provider) {
    setOauthLoading(provider)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      alert(error.message)
      setOauthLoading(null)
    }
    // On success the browser navigates away to the provider's login page,
    // so there's nothing further to do here.
  }

  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#0d7377', textAlign: 'center' }}>Klair Computer Inc.</h2>
      <p style={{ textAlign: 'center', color: '#64748b' }}>
        Sign in with your email and password to access your account.
      </p>
      <p style={{ textAlign: 'center', color: '#64748b', marginTop: 4, fontSize: 14 }}>
        New here? Sign up and then create your company to start using the product.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '24px' }}>
        <OAuthButton
          icon={<GoogleIcon />}
          label="Continue with Google"
          onClick={() => handleOAuthLogin('google')}
          disabled={!!oauthLoading}
        />
        <OAuthButton
          icon={<FacebookIcon />}
          label="Continue with Facebook"
          onClick={() => handleOAuthLogin('facebook')}
          disabled={!!oauthLoading}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
        <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
        <span style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or</span>
        <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
      </div>
      
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <input 
          type="email" 
          placeholder="Email" 
          value={email} 
          onChange={e => setEmail(e.target.value)}
          style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
          required 
        />
        <input 
          type="password" 
          placeholder="Password" 
          value={password} 
          onChange={e => setPassword(e.target.value)}
          style={{ padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
          required 
        />
        <button 
          type="submit" 
          disabled={loading}
          style={{ padding: '12px', background: '#0d7377', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          {loading ? 'Signing in...' : 'Login'}
        </button>
        <p style={{ textAlign: 'center', fontSize: '14px', color: '#64748b' }}>
          Don't have an account? <Link to="/signup" style={{ color: '#0d7377' }}>Sign up now</Link>.
        </p>
      </form>
    </div>
  )
}
