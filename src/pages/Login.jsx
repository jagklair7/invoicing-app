//src/pages/Login.jsx
import { useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
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

  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#0d7377', textAlign: 'center' }}>Klair Computer Inc.</h2>
      <p style={{ textAlign: 'center', color: '#64748b' }}>Invoice Management System</p>
      
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '30px' }}>
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
          Don't have an account? <Link to="/signup" style={{ color: '#0d7377' }}>Create one</Link>
        </p>
      </form>
    </div>
  )
}