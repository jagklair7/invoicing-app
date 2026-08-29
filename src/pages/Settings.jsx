// src/pages/Settings.jsx
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import { useNavigate } from 'react-router-dom'
import { getPlanStatus } from '../utils/planLimits'

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
  .settings-field--full { grid-column: 1 / -1; }
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
  .settings-hint { font-size: 11px; color: #94a3b8; margin-top: 2px; }
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
  .danger-zone {
    background: white;
    border: 1.5px solid #fecaca;
    border-radius: 14px;
    padding: 28px;
    margin-bottom: 20px;
    margin-top: 12px;
  }
  .danger-zone-title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #ef4444;
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 1px solid #fef2f2;
  }
  .danger-zone-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }
  .danger-zone-info h4 {
    font-size: 14px;
    font-weight: 600;
    color: #1e293b;
    margin: 0 0 4px;
  }
  .danger-zone-info p {
    font-size: 12px;
    color: #94a3b8;
    margin: 0;
    line-height: 1.5;
  }
  .danger-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #ef4444;
    background: #fff5f5;
    border: 1.5px solid #fecaca;
    border-radius: 8px;
    padding: 8px 16px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .danger-btn:hover { background: #fef2f2; border-color: #ef4444; }
  .danger-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .confirm-dialog {
    margin-top: 16px;
    background: #fff5f5;
    border: 1.5px solid #fecaca;
    border-radius: 10px;
    padding: 16px;
  }
  .confirm-dialog p {
    font-size: 13px;
    color: #1e293b;
    margin: 0 0 8px;
    line-height: 1.5;
  }
  .confirm-dialog strong { color: #ef4444; }
  .confirm-input {
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    color: #1e293b;
    background: white;
    border: 1.5px solid #fecaca;
    border-radius: 8px;
    padding: 9px 12px;
    outline: none;
    width: 100%;
    margin: 8px 0;
    box-sizing: border-box;
  }
  .confirm-input:focus { border-color: #ef4444; }
  .confirm-actions { display: flex; gap: 8px; margin-top: 4px; }
  .confirm-delete-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: white;
    background: #ef4444;
    border: none;
    border-radius: 8px;
    padding: 8px 16px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .confirm-delete-btn:hover { background: #dc2626; }
  .confirm-delete-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .confirm-cancel-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 500;
    color: #64748b;
    background: white;
    border: 1.5px solid #e2e8f0;
    border-radius: 8px;
    padding: 8px 16px;
    cursor: pointer;
  }
  .confirm-cancel-btn:hover { background: #f8fafc; }
  @media (max-width: 540px) {
    .settings-grid { grid-template-columns: 1fr; }
    .settings-field--full { grid-column: 1; }
  }
      .plan-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }
  .plan-name-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #0d7377;
    color: white;
    border-radius: 20px;
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 700;
    text-transform: capitalize;
  }
  .plan-price {
    font-size: 13px;
    color: #64748b;
  }
  .plan-usage-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 14px;
  }
  .plan-usage-item {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 14px;
  }
  .plan-usage-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #94a3b8;
    margin-bottom: 6px;
  }
  .plan-usage-value {
    font-size: 15px;
    font-weight: 700;
    color: #1e293b;
  }
  .plan-usage-bar-track {
    height: 5px;
    background: #e2e8f0;
    border-radius: 3px;
    margin-top: 8px;
    overflow: hidden;
  }
  .plan-usage-bar-fill {
    height: 100%;
    background: #0d7377;
    border-radius: 3px;
    transition: width 0.2s;
  }
  .plan-usage-bar-fill--warn { background: #d97706; }
  .plan-upgrade-link {
    display: inline-block;
    margin-top: 16px;
    font-size: 13px;
    font-weight: 600;
    color: #0d7377;
    text-decoration: none;
  }
  .plan-upgrade-link:hover { text-decoration: underline; }
`
function UsageStat({ label, used, max }) {
  const unlimited = max === -1 || max == null
  const pct = unlimited ? 0 : Math.min(100, (used / max) * 100)
  const warn = !unlimited && used >= max
  return (
    <div className="plan-usage-item">
      <div className="plan-usage-label">{label}</div>
      <div className="plan-usage-value">
        {used} {unlimited ? '' : `/ ${max}`}
        {unlimited && <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 12 }}> (unlimited)</span>}
      </div>
      {!unlimited && (
        <div className="plan-usage-bar-track">
          <div
            className={`plan-usage-bar-fill${warn ? ' plan-usage-bar-fill--warn' : ''}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

export default function Settings() {
  const { activeOrg, refreshSettings, orgs, refresh } = useOrg()
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    company_name:     '',
    company_address:  '',
    company_city:     '',
    company_phone:    '',
    company_email:    '',
    company_logo_url: '',
    invoice_prefix:   'INV-',
    gst_number:       '',
  })
  const [loading,      setLoading]      = useState(true)
  const [uploading,    setUploading]    = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [confirmText,  setConfirmText]  = useState('')
  const [deleting,     setDeleting]     = useState(false)

  const [planStatus, setPlanStatus] = useState(null)

  const isOwner = activeOrg?.role === 'owner'

  useEffect(() => {
    if (activeOrg?.orgId) fetchSettings()
  }, [activeOrg?.orgId])

  async function fetchSettings() {
    if (!activeOrg?.orgId) return
    const { data } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('org_id', activeOrg.orgId)
      .maybeSingle()
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

    useEffect(() => {
    if (!activeOrg?.orgId) return
    async function loadPlan() {
      const { data: userData } = await supabase.auth.getUser()
      const status = await getPlanStatus(activeOrg.orgId, userData?.user?.id)
      setPlanStatus(status)
    }
    loadPlan()
  }, [activeOrg?.orgId])

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
    if (planStatus?.planName === 'free') {
      alert('Custom logos are available on paid plans. Upgrade to add your logo.')
      return
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

  async function handleDeleteOrg() {
    if (confirmText !== activeOrg?.name) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .rpc('delete_organization', { org_id_input: activeOrg.orgId })
      if (error) throw error
      localStorage.removeItem('activeOrgId')
      await refresh()
      const remaining = orgs.filter(o => o.orgId !== activeOrg.orgId)
      navigate(remaining.length > 0 ? '/' : '/onboarding', { replace: true })
    } catch (err) {
      alert('Failed to delete: ' + err.message)
    } finally {
      setDeleting(false)
      setShowConfirm(false)
      setConfirmText('')
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

        {activeOrg && (
          <div className="settings-org-badge">🏢 {activeOrg.name}</div>
        )}

        {planStatus && (
          <div className="settings-card">
            <div className="plan-card-header">
              <span className="plan-name-badge">{planStatus.planName || 'Unknown'}</span>
              <span className="plan-price">
                {planStatus.priceMonthly === 0 ? 'Free' : planStatus.priceMonthly != null ? `$${planStatus.priceMonthly}/mo` : ''}
              </span>
            </div>
            <div className="plan-usage-grid">
              <UsageStat
                label="Invoices this month"
                used={planStatus.invoicesUsed}
                max={planStatus.maxInvoices}
              />
              <UsageStat
                label="Employees"
                used={planStatus.employeesUsed}
                max={planStatus.maxEmployees}
              />
              <UsageStat
                label="Organizations"
                used={planStatus.orgsOwned}
                max={planStatus.maxOrgs}
              />
            </div>
            {planStatus.planName !== 'enterprise' && (
              <a href="mailto:info@klair.ca?subject=Upgrade%20my%20plan" className="plan-upgrade-link">
                Upgrade your plan →
              </a>
            )}
          </div>
        )}

        {planStatus?.planName === 'free' ? (
          <div style={{
            border: '1.5px dashed #e2e8f0', borderRadius: 12, padding: 24,
            textAlign: 'center', background: '#f8fafc',
          }}>
            <span style={{ fontSize: 28 }}>🔒</span>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#475569', marginTop: 8 }}>
              Custom logos are available on paid plans
            </div>
            <a href="mailto:info@klair.ca?subject=Upgrade%20my%20plan" style={{ fontSize: 12, color: '#0d7377', fontWeight: 600, marginTop: 6, display: 'inline-block' }}>
              Upgrade your plan →
            </a>
          </div>
        ) : (
          // existing logo-upload-area JSX goes here unchanged
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
        )}

        {/* ── Logo ── */}
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

        {/* ── Company info ── */}
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

        {/* ── Tax ── */}
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

        {/* ── Danger Zone ── */}
        {isOwner && (
          <div className="danger-zone">
            <div className="danger-zone-title">⚠ Danger Zone</div>
            <div className="danger-zone-row">
              <div className="danger-zone-info">
                <h4>Delete Organization</h4>
                <p>Permanently delete this organization and all its data —<br/>invoices, customers, products, and settings.</p>
              </div>
              <button className="danger-btn" onClick={() => setShowConfirm(true)} disabled={deleting}>
                Delete Org
              </button>
            </div>

            {showConfirm && (
              <div className="confirm-dialog">
                <p>This action <strong>cannot be undone</strong>. All invoices, customers, products and settings for <strong>{activeOrg?.name}</strong> will be permanently deleted.</p>
                <p>Type <strong>{activeOrg?.name}</strong> to confirm:</p>
                <input
                  className="confirm-input"
                  placeholder={activeOrg?.name}
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  autoFocus
                />
                <div className="confirm-actions">
                  <button
                    className="confirm-delete-btn"
                    onClick={handleDeleteOrg}
                    disabled={confirmText !== activeOrg?.name || deleting}
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete everything'}
                  </button>
                  <button
                    className="confirm-cancel-btn"
                    onClick={() => { setShowConfirm(false); setConfirmText('') }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </>
  )
}