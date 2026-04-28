// src/pages/Settings.jsx
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'

const css = `
  .settings-root {
    max-width: 640px;
    margin: 0 auto;
    font-family: 'DM Sans', sans-serif;
  }
  .settings-page-title {
    font-size: 22px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 4px;
  }
  .settings-page-sub {
    font-size: 13px;
    color: #94a3b8;
    margin-bottom: 28px;
  }
  .settings-card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 28px;
    margin-bottom: 20px;
  }
  .settings-card-title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #0d7377;
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 1px solid #f1f5f9;
  }
  .settings-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .settings-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .settings-field--full {
    grid-column: 1 / -1;
  }
  .settings-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #94a3b8;
  }
  .settings-input {
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    color: #1e293b;
    background: #f8fafc;
    border: 1.5px solid #e2e8f0;
    border-radius: 8px;
    padding: 9px 12px;
    outline: none;
    transition: border-color .15s, box-shadow .15s;
    width: 100%;
  }
  .settings-input:focus {
    border-color: #0d7377;
    box-shadow: 0 0 0 3px rgba(13,115,119,0.1);
    background: white;
  }
  .settings-hint {
    font-size: 11px;
    color: #94a3b8;
    margin-top: 2px;
  }
  .settings-org-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #e8f5f5;
    border: 1px solid #b2e0e2;
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
    color: #0d7377;
    margin-bottom: 20px;
  }

  /* Logo upload area */
  .logo-upload-area {
    border: 2px dashed #e2e8f0;
    border-radius: 12px;
    padding: 24px;
    text-align: center;
    cursor: pointer;
    transition: all .15s;
    background: #f8fafc;
  }
  .logo-upload-area:hover { border-color: #0d7377; background: #e8f5f5; }
  .logo-upload-area.has-logo {
    border-style: solid;
    border-color: #e2e8f0;
    background: white;
    padding: 16px;
  }
  .logo-preview {
    max-height: 72px;
    max-width: 240px;
    object-fit: contain;
    margin: 0 auto 12px;
    display: block;
  }
  .logo-upload-hint { font-size: 12px; color: #94a3b8; margin-top: 8px; }
  .logo-upload-icon { font-size: 28px; margin-bottom: 8px; display: block; }
  .logo-upload-label { font-size: 13px; font-weight: 500; color: #475569; }
  .logo-change-btn {
    font-size: 12px;
    color: #0d7377;
    background: #e8f5f5;
    border: 1px solid #b2e0e2;
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
    margin-top: 4px;
    font-family: 'DM Sans', sans-serif;
    transition: all .12s;
  }
  .logo-change-btn:hover { background: #d0eeef; }
  .upload-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #0d7377;
    margin-top: 8px;
    justify-content: center;
  }
  .upload-spinner {
    width: 14px; height: 14px;
    border: 2px solid #b2e0e2;
    border-top-color: #0d7377;
    border-radius: 50%;
    animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .settings-save-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 12px;
    background: #0d7377;
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    transition: background .15s;
    margin-top: 4px;
  }
  .settings-save-btn:hover { background: #14a0a5; }
  .settings-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .settings-success {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #e8f5f5;
    border: 1px solid #b2e0e2;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    color: #0d7377;
    font-weight: 500;
    margin-top: 12px;
  }
  @media (max-width: 540px) {
    .settings-grid { grid-template-columns: 1fr; }
    .settings-field--full { grid-column: 1; }
  }
`

export default function Settings() {
  const { activeOrg, refreshSettings } = useOrg()
  const fileInputRef = useRef(null)

  const [formData, setFormData] = useState({
    company_name:     '',
    company_address:  '',
    company_city:     '',
    company_phone:    '',
    company_email:    '',
    company_logo_url: '',
    invoice_prefix:   'INV-',
    gst_number:       '',   // ← NEW
  })
  const [loading,   setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)

  useEffect(() => {
    if (activeOrg?.orgId) fetchSettings()
  }, [activeOrg?.orgId])

  async function fetchSettings() {
    if (!activeOrg?.orgId) return
    const { data, error } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('org_id', activeOrg.orgId)
      .single()

    if (data) {
      setFormData(prev => ({
        ...prev,
        company_name:     data.company_name     || '',
        company_address:  data.company_address  || '',
        company_city:     data.company_city     || '',
        company_phone:    data.company_phone    || '',
        company_email:    data.company_email    || '',
        company_logo_url: data.company_logo_url || '',
        invoice_prefix:   data.invoice_prefix   || 'INV-',
        gst_number:       data.gst_number       || '',
      }))
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!activeOrg?.orgId) return
    setSaving(true); setSaved(false)
    try {
      const { error } = await supabase
        .from('organization_settings')
        .upsert({
          org_id:           activeOrg.orgId,
          company_name:     formData.company_name,
          company_address:  formData.company_address,
          company_city:     formData.company_city,
          company_phone:    formData.company_phone,
          company_email:    formData.company_email,
          company_logo_url: formData.company_logo_url,
          invoice_prefix:   formData.invoice_prefix,
          gst_number:       formData.gst_number,
        }, { onConflict: 'org_id' })

      if (error) throw error
      await refreshSettings()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, SVG).'); return
    }
    setUploading(true)
    try {
      const ext      = file.name.split('.').pop()
      const fileName = `logo-${activeOrg.orgId}-${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('assets').upload(fileName, file, { upsert: true })
      if (uploadErr) throw uploadErr
      const { data } = supabase.storage.from('assets').getPublicUrl(fileName)
      setFormData(prev => ({ ...prev, company_logo_url: data.publicUrl }))
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading) return (
    <div style={{ padding: 40, color: '#94a3b8', fontSize: 13 }}>Loading settings…</div>
  )

  return (
    <>
      <style>{css}</style>
      <div className="settings-root">
        <h1 className="settings-page-title">Settings</h1>
        <p className="settings-page-sub">Company info and tax details appear on every invoice and PDF export.</p>

        {/* Active org badge */}
        {activeOrg && (
          <div className="settings-org-badge">
            🏢 {activeOrg.name}
          </div>
        )}

        {/* ── Logo card ── */}
        <div className="settings-card">
          <div className="settings-card-title">Company Logo</div>
          <input ref={fileInputRef} type="file" accept="image/*"
            style={{ display: 'none' }} onChange={handleLogoUpload} />
          <div
            className={`logo-upload-area ${formData.company_logo_url ? 'has-logo' : ''}`}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            {formData.company_logo_url ? (
              <>
                <img src={formData.company_logo_url} alt="Company logo" className="logo-preview" />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button className="logo-change-btn"
                    onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>
                    Change logo
                  </button>
                  <button className="logo-change-btn"
                    style={{ color: '#e53e3e', background: '#fff5f5', borderColor: '#fecaca' }}
                    onClick={e => { e.stopPropagation(); setFormData(prev => ({ ...prev, company_logo_url: '' })) }}>
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="logo-upload-icon">🖼</span>
                <div className="logo-upload-label">Click to upload your logo</div>
                <div className="logo-upload-hint">PNG, JPG or SVG · Max 2MB · Recommended: 400×200px</div>
              </>
            )}
          </div>
          {uploading && (
            <div className="upload-progress">
              <div className="upload-spinner" /> Uploading logo…
            </div>
          )}
        </div>

        {/* ── Company info card ── */}
        <div className="settings-card">
          <div className="settings-card-title">Company Information</div>
          <div className="settings-grid">
            <div className="settings-field settings-field--full">
              <label className="settings-label">Company Name</label>
              <input className="settings-input" placeholder="Klair Computer Inc."
                value={formData.company_name}
                onChange={e => setFormData(prev => ({ ...prev, company_name: e.target.value }))} />
            </div>
            <div className="settings-field settings-field--full">
              <label className="settings-label">Street Address</label>
              <input className="settings-input" placeholder="1319 Malone Place NW"
                value={formData.company_address}
                onChange={e => setFormData(prev => ({ ...prev, company_address: e.target.value }))} />
            </div>
            <div className="settings-field">
              <label className="settings-label">City / Province / Postal</label>
              <input className="settings-input" placeholder="Edmonton, AB T6R 0G6"
                value={formData.company_city}
                onChange={e => setFormData(prev => ({ ...prev, company_city: e.target.value }))} />
            </div>
            <div className="settings-field">
              <label className="settings-label">Phone</label>
              <input className="settings-input" placeholder="780-265-0042"
                value={formData.company_phone}
                onChange={e => setFormData(prev => ({ ...prev, company_phone: e.target.value }))} />
            </div>
            <div className="settings-field">
              <label className="settings-label">Email</label>
              <input className="settings-input" type="email" placeholder="info@yourcompany.com"
                value={formData.company_email}
                onChange={e => setFormData(prev => ({ ...prev, company_email: e.target.value }))} />
            </div>
            <div className="settings-field">
              <label className="settings-label">Invoice Prefix</label>
              <input className="settings-input" placeholder="INV-"
                value={formData.invoice_prefix}
                onChange={e => setFormData(prev => ({ ...prev, invoice_prefix: e.target.value }))} />
              <span className="settings-hint">e.g. INV- → INV-001</span>
            </div>
          </div>
        </div>

        {/* ── Tax info card ── */}
        <div className="settings-card">
          <div className="settings-card-title">Tax Information</div>
          <div className="settings-grid">
            <div className="settings-field">
              <label className="settings-label">GST Registration Number</label>
              <input className="settings-input" placeholder="e.g. 123456789 RT0001"
                value={formData.gst_number}
                onChange={e => setFormData(prev => ({ ...prev, gst_number: e.target.value }))} />
              <span className="settings-hint">Appears on all invoices below the total</span>
            </div>
          </div>
        </div>

        {/* ── Save ── */}
        <button className="settings-save-btn" onClick={handleSave} disabled={saving || uploading}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {saved && (
          <div className="settings-success">
            ✓ Settings saved — your next invoice and PDF export will use these details.
          </div>
        )}
      </div>
    </>
  )
}