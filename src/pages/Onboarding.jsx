//src/pages/Onboarding.jsx
import { useState } from 'react'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'

export default function Onboarding() {
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(false)
  const { refresh } = useOrg()

  async function handleCreate(e) {
    e.preventDefault()
    setLoading(true)
    
    const { data: { user } } = await supabase.auth.getUser()

    // Call the SQL Function we made earlier
    const { data, error } = await supabase.rpc('create_new_organization', {
      org_name: orgName,
      user_id: user.id
    })

    if (error) {
      alert(error.message)
    } else {
      await refresh() // This updates the OrgContext and clears the 'loading' state
      // Redirect to dashboard happens automatically via Protected Routes logic
    }
    setLoading(false)
  }

  return (
    <div className="onboarding-container">
      <h2>Welcome! Let's set up your business.</h2>
      <form onSubmit={handleCreate}>
        <input 
          placeholder="Company Name (e.g. Klair Computer Inc.)" 
          value={orgName}
          onChange={e => setOrgName(e.target.value)}
          required 
        />
        <button disabled={loading}>
          {loading ? 'Setting up...' : 'Create My Dashboard'}
        </button>
      </form>
    </div>
  )
}