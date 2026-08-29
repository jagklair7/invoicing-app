// src/pages/ProductsPage.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../app/supabaseClient'
import { useOrg } from '../context/OrgContext'
import SuspendedBanner from '../components/SuspendedBanner'

const EMPTY = { name: '', description: '', unit_price: '' }

export default function ProductsPage() {
  const { activeOrg, isSuspended } = useOrg()
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState(null)   // product object being edited
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    if (activeOrg?.orgId) fetchProducts()
  }, [activeOrg?.orgId])

  async function fetchProducts() {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('org_id', activeOrg.orgId)
      .order('name')
    setProducts(data || [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm(EMPTY)
    setShowForm(true)
  }

  function openEdit(product) {
    setEditing(product)
    setForm({
      name:        product.name,
      description: product.description || '',
      unit_price:  product.unit_price,
    })
    setShowForm(true)
  }

  function cancel() {
    setShowForm(false)
    setEditing(null)
    setForm(EMPTY)
  }

  async function handleSave() {
    if (!form.name.trim()) return alert('Product name is required')
    setSaving(true)
    try {
      const payload = {
        org_id:      activeOrg.orgId,
        name:        form.name.trim(),
        description: form.description.trim() || null,
        unit_price:  parseFloat(form.unit_price) || 0,
      }

      if (editing) {
        const { error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editing.id)
          .eq('org_id', activeOrg.orgId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('products')
          .insert([payload])
        if (error) throw error
      }

      await fetchProducts()
      cancel()
    } catch (err) {
      alert('Error saving: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(product) {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return
    setDeleting(product.id)
    await supabase
      .from('products')
      .delete()
      .eq('id', product.id)
      .eq('org_id', activeOrg.orgId)
    await fetchProducts()
    setDeleting(null)
  }

  const fmt = (n) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 60px', fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#1e293b', margin: 0 }}>Products & Services</h1>
          {activeOrg && <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>{activeOrg.name}</p>}
        </div>
        <button onClick={openNew} disabled={isSuspended} style={{
          background: '#0d7377', color: 'white', border: 'none',
          borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600,
          cursor: isSuspended ? 'not-allowed' : 'pointer',
          opacity: isSuspended ? 0.5 : 1,
          fontFamily: 'inherit',
        }}>
          + Add Product
        </button>
      </div>

      <SuspendedBanner />

      {/* Add / Edit Form */}
      {showForm && (
        <div style={{
          background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 14,
          padding: 24, marginBottom: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', margin: '0 0 18px' }}>
            {editing ? 'Edit Product' : 'New Product'}
          </h2>

          <div style={{ display: 'grid', gap: 14 }}>
            {/* Name */}
            <div>
              <label style={labelStyle}>Product / Service Name *</label>
              <input
                style={inputStyle}
                placeholder="e.g. Monthly Contract, Consulting Hours"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {/* Default Description */}
            <div>
              <label style={labelStyle}>Default Description</label>
              <input
                style={inputStyle}
                placeholder="e.g. Monthly retainer – (user can edit per invoice)"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>
                Pre-fills the description field on invoices. Can always be edited.
              </p>
            </div>

            {/* Unit Price */}
            <div style={{ maxWidth: 200 }}>
              <label style={labelStyle}>Default Unit Price</label>
              <input
                style={inputStyle}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.unit_price}
                onChange={e => setForm({ ...form, unit_price: e.target.value })}
              />
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>
                Pre-fills the price on invoices. Can always be edited.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button onClick={handleSave} disabled={saving || isSuspended}  style={{
              background: '#0d7377', color: 'white', border: 'none',
              borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 600,
              cursor: (saving || isSuspended) ? 'not-allowed' : 'pointer',
              opacity: (saving || isSuspended) ? 0.6 : 1,
              fontFamily: 'inherit',
            }}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Product'}
            </button>
            <button onClick={cancel} style={{
              background: 'none', border: '1.5px solid #e2e8f0', color: '#64748b',
              borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Products List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 13 }}>
          Loading…
        </div>
      ) : products.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 13,
          border: '1.5px dashed #e2e8f0', borderRadius: 12,
        }}>
          No products yet — click <strong>+ Add Product</strong> to create your first one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 120px 80px',
            gap: 12, padding: '0 16px 8px',
            borderBottom: '1px solid #e2e8f0',
          }}>
            {['Product Name', 'Default Description', 'Unit Price', ''].map((h, i) => (
              <span key={i} style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: '#94a3b8',
                textAlign: i === 2 ? 'right' : 'left',
              }}>{h}</span>
            ))}
          </div>

          {products.map(p => (
            <div key={p.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 120px 80px',
              gap: 12, alignItems: 'center',
              background: 'white', border: '1px solid #f1f5f9',
              borderRadius: 10, padding: '14px 16px',
              transition: 'border-color .15s, box-shadow .15s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#b2e0e2'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#f1f5f9'}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{p.name}</div>
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                {p.description || <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>No default</span>}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0d7377', textAlign: 'right' }}>
                {fmt(p.unit_price)}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => openEdit(p)} disabled={isSuspended} style={iconBtnStyle('#64748b', isSuspended)}>✏</button>
                <button
                  onClick={() => handleDelete(p)}
                  disabled={deleting === p.id || isSuspended}
                  style={iconBtnStyle('#e53e3e', isSuspended)}
                >
                  {deleting === p.id ? '…' : '×'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.08em', textTransform: 'uppercase',
  color: '#64748b', marginBottom: 6,
}

const inputStyle = {
  width: '100%', padding: '9px 12px', fontSize: 13, color: '#1e293b',
  border: '1.5px solid #e2e8f0', borderRadius: 8, outline: 'none',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  boxSizing: 'border-box',
  transition: 'border-color .15s',
}

const iconBtnStyle = (color, disabled) => ({
  width: 28, height: 28, border: '1.5px solid #e2e8f0',
  borderRadius: 6, background: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.4 : 1,
  color, fontSize: 14, display: 'flex', alignItems: 'center',
  justifyContent: 'center', fontFamily: 'inherit',
})