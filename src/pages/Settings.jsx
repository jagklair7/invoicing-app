import { useState, useEffect } from 'react'
import { supabase } from '../app/supabaseClient'

export default function Settings() {
  const [formData, setFormData] = useState({
    company_name: '',
    company_address: '',
    company_city: '',
    company_phone: '',
    company_logo_url: ''
  })
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  useEffect(() => { fetchSettings() }, [])

  async function fetchSettings() {
    const { data } = await supabase.from('settings').select('*')
    if (data) {
      const formatted = {}
      data.forEach(item => formatted[item.key] = item.value)
      setFormData(prev => ({ ...prev, ...formatted }))
    }
    setLoading(false)
  }

  async function handleSave() {
    const updates = Object.entries(formData).map(([key, value]) => 
      supabase.from('settings').upsert({ key, value }, { onConflict: 'key' })
    )
    await Promise.all(updates)
    alert('Settings saved!')
  }

  async function uploadLogo(e) {
    try {
      setUploading(true)
      const file = e.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `logo-${Math.random()}.${fileExt}`
      const filePath = `${fileName}`

      // Upload to 'assets' bucket
      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // Get Public URL
      const { data } = supabase.storage.from('assets').getPublicUrl(filePath)
      setFormData(prev => ({ ...prev, company_logo_url: data.publicUrl }))
      
    } catch (error) {
      alert(error.message)
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <div>Loading...</div>

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '20px', fontFamily: 'DM Sans, sans-serif' }}>
      <h2>Business Settings</h2>
      <div style={{ display: 'grid', gap: '15px', marginTop: '20px' }}>
        
        <label>Company Logo</label>
        {formData.company_logo_url && <img src={formData.company_logo_url} alt="Logo" style={{ height: '50px', objectFit: 'contain' }} />}
        <input type="file" onChange={uploadLogo} disabled={uploading} />
        
        <label>Company Name</label>
        <input className="inv-input" value={formData.company_name} onChange={e => setFormData({...formData, company_name: e.target.value})} />
        
        <label>Address</label>
        <input className="inv-input" value={formData.company_address} onChange={e => setFormData({...formData, company_address: e.target.value})} />
        
        <label>City/Province/Postal</label>
        <input className="inv-input" value={formData.company_city} onChange={e => setFormData({...formData, company_city: e.target.value})} />
        
        <label>Phone</label>
        <input className="inv-input" value={formData.company_phone} onChange={e => setFormData({...formData, company_phone: e.target.value})} />

        <button className="inv-btn inv-btn--primary" onClick={handleSave} style={{ marginTop: '20px' }}>
          Save All Settings
        </button>
      </div>
    </div>
  )
}