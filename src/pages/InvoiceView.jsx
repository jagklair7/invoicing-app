// src/pages/InvoiceView.jsx
// Fonts loaded via index.html or index.css:
//   @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,600;1,300&family=DM+Sans:wght@300;400;500&display=swap');

import { exportInvoicePDF } from '../utils/exportInvoicePDF'
import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../app/supabaseClient'
import { calcLineTotal, calcLineDiscount } from '../utils/discount'
import { useOrg } from '../context/OrgContext'
import PayNowButton from '../components/PayNowButton'
import PaymentsSection from '../components/PaymentsSection'
// Add to imports:
import SuspendedBanner from '../components/SuspendedBanner'
import RichTextNotes, { sanitizeNotesHtml } from '../components/RichTextNotes'

// ── Styles ────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;1,9..144,300&family=DM+Sans:wght@300;400;500;600&display=swap');

  .inv-root {
    --teal:      #0d7377;
    --teal-lt:   #e8f5f5;
    --teal-mid:  #14a0a5;
    --slate:     #1e293b;
    --slate-mid: #475569;
    --slate-lt:  #94a3b8;
    --border:    #e2e8f0;
    --bg:        #f1f5f9;
    --white:     #ffffff;
    --red:       #e53e3e;
    --amber:     #d97706;
    --green:     #059669;
    --blue:      #2563eb;
    --radius:    12px;
    --shadow:    0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04);
    --shadow-lg: 0 20px 40px -8px rgba(0,0,0,0.12), 0 8px 16px -4px rgba(0,0,0,0.06);
    font-family: 'DM Sans', system-ui, sans-serif;
    background: var(--bg);
    min-height: 100vh;
    padding: 24px 16px 60px;
  }

  /* ── Page shell ── */
  .inv-topbar {
    max-width: 860px;
    margin: 0 auto 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .inv-back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--slate-mid);
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px 0;
    transition: color .15s;
    font-family: 'DM Sans', sans-serif;
  }
  .inv-back:hover { color: var(--teal); }

  .inv-topbar-actions { display: flex; gap: 8px; align-items: center; }

  /* ── Buttons ── */
  .inv-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    font-family: 'DM Sans', sans-serif;
    border: 1.5px solid var(--border);
    background: var(--white);
    color: var(--slate-mid);
    cursor: pointer;
    transition: all .15s;
    white-space: nowrap;
  }
  .inv-btn:hover { border-color: var(--slate-lt); color: var(--slate); background: #f8fafc; }

  .inv-btn--primary {
    background: var(--teal);
    color: white;
    border-color: var(--teal);
  }
  .inv-btn--primary:hover { background: var(--teal-mid); border-color: var(--teal-mid); color: white; }

  .inv-btn--danger {
    color: var(--red);
    border-color: #fecaca;
  }
  .inv-btn--danger:hover { background: #fff5f5; border-color: var(--red); }

  .inv-btn--ghost {
    background: transparent;
    border-color: transparent;
    color: var(--slate-mid);
  }
  .inv-btn--ghost:hover { background: var(--border); color: var(--slate); }

  .inv-btn:disabled { opacity: 0.55; cursor: not-allowed; }

  /* ── Card ── */
  .inv-card {
    background: var(--white);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    max-width: 860px;
    margin: 0 auto;
    overflow: hidden;
  }

  /* ── Header band ── */
  .inv-header {
    background: linear-gradient(135deg, var(--slate) 0%, #2d3f55 100%);
    padding: 36px 44px 32px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    flex-wrap: wrap;
  }

  .inv-brand {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .inv-brand-name {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 28px;
    font-weight: 600;
    color: white;
    letter-spacing: -0.02em;
    line-height: 1;
  }

  .inv-brand-tagline {
    font-size: 12px;
    color: rgba(255,255,255,0.45);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-top: 4px;
  }

  .inv-header-right {
    text-align: right;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
  }

  .inv-number-label {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.4);
  }

  .inv-number-value {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 26px;
    font-weight: 300;
    color: white;
    letter-spacing: 0.02em;
    margin-top: -2px;
  }

  /* ── Status badge ── */
  .inv-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 11px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .inv-status::before {
    content: '';
    width: 6px; height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.7;
  }
  .inv-status--draft  { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); }
  .inv-status--sent   { background: rgba(37,99,235,0.2);   color: #93c5fd; }
  .inv-status--paid   { background: rgba(5,150,105,0.2);   color: #6ee7b7; }
  .inv-status--void   { background: rgba(229,62,62,0.15);  color: #fca5a5; }

  /* ── Body ── */
  .inv-body {
    padding: 36px 44px;
  }

  /* ── Bill-to / dates row ── */
  .inv-meta-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    padding-bottom: 32px;
    border-bottom: 1.5px solid var(--border);
    margin-bottom: 32px;
  }

  .inv-meta-section-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--teal);
    margin-bottom: 10px;
  }

  .inv-customer-name {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 20px;
    font-weight: 600;
    color: var(--slate);
    margin-bottom: 4px;
    letter-spacing: -0.01em;
  }

  .inv-customer-detail {
    font-size: 13px;
    color: var(--slate-mid);
    line-height: 1.7;
  }

  .inv-dates-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
  }

  .inv-date-row {
    display: flex;
    gap: 16px;
    align-items: baseline;
  }

  .inv-date-label {
    font-size: 12px;
    color: var(--slate-lt);
    min-width: 80px;
    text-align: right;
  }

  .inv-date-value {
    font-size: 13px;
    font-weight: 500;
    color: var(--slate);
    min-width: 100px;
    text-align: right;
  }

  /* ── Items table ── */
  .inv-table-wrap { overflow-x: auto; margin-bottom: 0; }

  .inv-table {
    width: 100%;
    border-collapse: collapse;
  }

  .inv-table thead tr {
    border-bottom: 1.5px solid var(--border);
  }

  .inv-table th {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--slate-lt);
    padding: 0 12px 12px;
    text-align: left;
  }

  .inv-table th:not(:first-child) { text-align: right; }

  .inv-table td {
    padding: 14px 12px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
    word-break: break-word;
  }

  .inv-table tbody tr:last-child td { border-bottom: none; }

  .inv-table tbody tr {
    transition: background .1s;
  }
  .inv-table tbody tr:hover { background: #f8fafc; }

  .inv-item-name {
    font-size: 14px;
    color: var(--slate);
    font-weight: 400;
    word-break: break-word;
    white-space: pre-wrap;
  }

  .inv-item-num {
    font-size: 13px;
    color: var(--slate-mid);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .inv-item-amount {
    font-size: 14px;
    font-weight: 600;
    color: var(--slate);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* ── Totals block ── */
  .inv-totals {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1.5px solid var(--border);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }

  .inv-total-row {
    display: flex;
    gap: 48px;
    align-items: baseline;
  }

  .inv-total-label {
    font-size: 12px;
    color: var(--slate-lt);
    min-width: 80px;
    text-align: right;
  }

  .inv-total-value {
    font-size: 14px;
    color: var(--slate-mid);
    min-width: 100px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .inv-total-row--grand .inv-total-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--slate);
  }

  .inv-total-row--grand .inv-total-value {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 26px;
    font-weight: 600;
    color: var(--teal);
  }

  .inv-total-divider {
    width: 260px;
    height: 1px;
    background: var(--border);
    margin: 4px 0;
  }


  /* ── Footer note ── */
  .inv-footer-note {
    margin-top: 36px;
    padding-top: 20px;
    border-top: 1px dashed var(--border);
    font-size: 12px;
    color: var(--slate-lt);
    text-align: center;
    letter-spacing: 0.03em;
  }

  /* ══════════════════════════════════════════
     EDIT MODE
  ══════════════════════════════════════════ */
  .inv-edit-band {
    background: linear-gradient(90deg, var(--teal-lt) 0%, #f0fdfe 100%);
    border-bottom: 1.5px solid #b2e0e2;
    padding: 10px 44px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    color: var(--teal);
    font-weight: 500;
  }

  .inv-edit-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--teal);
    animation: pulse 1.5s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.5; transform: scale(0.85); }
  }

  .inv-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .inv-field-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--slate-lt);
  }

  .inv-input {
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    color: var(--slate);
    background: white;
    border: 1.5px solid var(--border);
    border-radius: 8px;
    padding: 8px 11px;
    outline: none;
    transition: border-color .15s, box-shadow .15s;
    width: 100%;
  }
  .inv-input:focus {
    border-color: var(--teal);
    box-shadow: 0 0 0 3px rgba(13,115,119,0.1);
  }

  .inv-select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 28px;
    cursor: pointer;
  }

  .inv-edit-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    padding-bottom: 28px;
    border-bottom: 1.5px solid var(--border);
    margin-bottom: 28px;
  }

  .inv-edit-meta-right {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    align-content: start;
  }

  .inv-items-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .inv-items-title {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--slate-lt);
  }

  .inv-item-row {
    display: grid;
    grid-template-columns: 1fr 90px 110px 36px;
    gap: 8px;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid #f1f5f9;
  }

  .inv-item-row:last-child { border-bottom: none; }

  .inv-item-input {
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    color: var(--slate);
    background: #f8fafc;
    border: 1.5px solid transparent;
    border-radius: 6px;
    padding: 7px 9px;
    outline: none;
    transition: all .15s;
    width: 100%;
  }
  .inv-item-input:focus {
    background: white;
    border-color: var(--teal);
    box-shadow: 0 0 0 3px rgba(13,115,119,0.08);
  }
  .inv-item-input--num { text-align: right; font-variant-numeric: tabular-nums; }

  .inv-item-del {
    width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    background: none;
    border: 1.5px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    color: var(--slate-lt);
    font-size: 16px;
    transition: all .12s;
    flex-shrink: 0;
  }
  .inv-item-del:hover { color: var(--red); background: #fff5f5; border-color: #fecaca; }

  .inv-add-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 12px;
    font-size: 13px;
    font-weight: 500;
    color: var(--teal);
    background: var(--teal-lt);
    border: 1.5px dashed #b2e0e2;
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
    transition: all .15s;
    width: 100%;
    justify-content: center;
    font-family: 'DM Sans', sans-serif;
  }
  .inv-add-item:hover { background: #d0eeef; border-color: var(--teal); }

  .inv-edit-totals {
    margin-top: 20px;
    padding: 16px 20px;
    background: #f8fafc;
    border-radius: 10px;
    border: 1.5px solid var(--border);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 7px;
  }

  .inv-items-cols {
    display: grid;
    grid-template-columns: 1fr 90px 110px 36px;
    gap: 8px;
    padding: 0 0 6px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
  }

  .inv-items-col-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--slate-lt);
  }
  .inv-items-col-label--r { text-align: right; }

  /* ── Loading / empty ── */
  .inv-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    flex-direction: column;
    gap: 16px;
  }

  .inv-spinner {
    width: 36px; height: 36px;
    border: 3px solid var(--border);
    border-top-color: var(--teal);
    border-radius: 50%;
    animation: spin .7s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .inv-empty-items {
    text-align: center;
    padding: 32px;
    color: var(--slate-lt);
    font-size: 13px;
    border: 1.5px dashed var(--border);
    border-radius: 10px;
  }

  /* ── Print ── */
  @media print {
    body * { visibility: hidden; }
    .inv-card, .inv-card * { visibility: visible; }
    .inv-card {
      position: fixed;
      inset: 0;
      width: 100%;
      margin: 0;
      box-shadow: none;
      border-radius: 0;
      border: none;
    }
    .inv-header {
      background: #1e293b !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .inv-total-row--grand .inv-total-value {
      color: #0d7377 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }

  /* ── Responsive ── */
  @media (max-width: 600px) {
    .inv-header { padding: 24px 20px 20px; }
    .inv-body   { padding: 24px 20px; }
    .inv-edit-band { padding: 10px 20px; }
    .inv-meta-row  { grid-template-columns: 1fr; gap: 20px; }
    .inv-dates-grid { align-items: flex-start; }
    .inv-date-row { flex-direction: row; }
    .inv-date-label { text-align: left; }
    .inv-header-right { align-items: flex-start; text-align: left; }
    .inv-edit-meta { grid-template-columns: 1fr; }
    .inv-edit-meta-right { grid-template-columns: 1fr 1fr; }
    .inv-item-row { grid-template-columns: 1fr 70px 90px 28px; }

    .inv-modal-footer {
      flex-direction: column-reverse;
      align-items: stretch;
    }
    .inv-modal-footer .inv-btn {
      width: 100%;
      justify-content: center;
    }
  }

  /* ── Send modal ── */
  .inv-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15,23,42,0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 16px;
    backdrop-filter: blur(2px);
  }
  .inv-modal {
    background: white;
    border-radius: 16px;
    box-shadow: 0 24px 48px rgba(0,0,0,0.18);
    width: 100%;
    max-width: 460px;
    overflow: hidden;
    flex-direction: column;
    max-height: 90vh;
  }
  .inv-modal-header {
    background: linear-gradient(135deg, #1e293b 0%, #2d3f55 100%);
    padding: 20px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .inv-modal-title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 18px;
    font-weight: 600;
    color: white;
    letter-spacing: -0.01em;
  }
  .inv-modal-close {
    background: rgba(255,255,255,0.1);
    border: none;
    color: white;
    width: 28px; height: 28px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    transition: background .15s;
  }
  .inv-modal-close:hover { background: rgba(255,255,255,0.2); }
  .inv-modal-body {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
    flex: 1;
  }
  .inv-modal-footer {
    padding: 16px 24px;
    border-top: 1px solid #f1f5f9;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
    align-items: center;
    background: #fff;
  }
  .inv-send-success {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #e8f5f5;
    border: 1px solid #b2e0e2;
    border-radius: 10px;
    padding: 14px 16px;
    font-size: 13px;
    color: #0d7377;
    font-weight: 500;
  }
  .inv-send-error {
    background: #fff5f5;
    border: 1px solid #fecaca;
    border-radius: 10px;
    padding: 14px 16px;
    font-size: 13px;
    color: #e53e3e;
  }
`

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const today = () => new Date().toISOString().split('T')[0]

const STATUS_LABELS = { draft: 'Draft', sent: 'Sent', paid: 'Paid', void: 'Void' }

function StatusBadge({ status, edit, value, onChange }) {
  if (edit) return (
    <select className="inv-input inv-select" value={value} onChange={e => onChange(e.target.value)}
      style={{ fontSize: 12, padding: '5px 28px 5px 10px', borderRadius: 20, width: 'auto' }}>
      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  )
  return <span className={`inv-status inv-status--${status}`}>{STATUS_LABELS[status] || status}</span>
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InvoiceView() {
//  const { activeOrg } = useOrg()
  const { activeOrg, isSuspended } = useOrg()
  const { id } = useParams()
  const navigate = useNavigate()

  const [invoice, setInvoice] = useState({
    number: '',
    date: new Date().toISOString().split('T')[0],
    status: 'draft',
  })

  const [customer, setCustomer]       = useState(null)
  const [items, setItems]             = useState([])
  const [orgSettings, setOrgSettings] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [isEditing, setIsEditing]     = useState(false)
  const [saving, setSaving]           = useState(false)
  const [exporting, setExporting]     = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [editPO, setEditPO]           = useState('')

  // Send email
  const [sending, setSending]             = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendEmail, setSendEmail]         = useState('')
  const [sendNote, setSendNote]           = useState('')
  const [sendResult, setSendResult]       = useState(null)

  // Pay Now (in-house)
  const [showPayModal, setShowPayModal] = useState(false)

  // Edit state
  const [editNumber, setEditNumber] = useState('')
  const [editStatus, setEditStatus] = useState('draft')
  const [editDate, setEditDate]     = useState('')
  const [editDue, setEditDue]       = useState('')
  const [editItems, setEditItems]   = useState([])
  const [editNotes, setEditNotes]   = useState('')
  const [products, setProducts]     = useState([])

  // ── Fetch ──────────────────────────────────────────────────────────────────
  async function fetchInvoice(ignore = false) {
    if (!activeOrg?.orgId) return
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('invoices')
        .select('*, customers(*)')
        .eq('id', id)
        .eq('org_id', activeOrg.orgId)
        .single()
      if (error) throw error
      if (!data || ignore) return   // ← bail if stale

      setInvoice(data)
      setCustomer(data.customers)
      setEditNotes(data.notes || '')

      const { data: settings } = await supabase
        .from('organization_settings')
        .select('gst_number, company_name, company_address, company_city, company_phone, helcim_customer_code')
        .eq('org_id', activeOrg.orgId)
        .single()
      setOrgSettings(settings || null)

      const { data: productList } = await supabase
        .from('products')
        .select('id, name, description, unit_price')
        .eq('org_id', activeOrg.orgId)
        .order('name')
      setProducts(productList || [])

      const { data: lineItems, error: itemsErr } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', id)
      if (itemsErr) throw itemsErr

      const fetchedItems = lineItems ?? []
      setItems(fetchedItems)

      setEditNumber(data.number || '')
      setEditStatus(data.status)
      setEditDate(data.date || today())
      setEditDue(data.due_date || '')
      setEditItems(fetchedItems)
      setEditPO(data.po_number || '')

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

 const orgId = activeOrg?.orgId
  useEffect(() => {
    if (orgId) fetchInvoice()
  }, [id, orgId])   // same, but now a stable primitive string, not an object reference

  // ── Send email ─────────────────────────────────────────────────────────────
  async function handleSendInvoice() {
    if (!sendEmail.trim()) return
    setSending(true)
    setSendResult(null)
    try {
      const { pdfBase64, filename } = await exportInvoicePDF(invoice, customer, items, activeOrg.orgId, { download: false })

      const html = `
        <div style="margin:0;padding:0;background:#f1f5f9;">
          <div style="max-width:640px;margin:0 auto;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
            <div style="background:#1e293b;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
              <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;">
                ${orgSettings?.companyname || activeOrg?.name || 'Invoice'}
              </div>
              <div style="font-size:28px;line-height:1.2;font-weight:700;color:#ffffff;margin:0;">
                Invoice ${invoice.number}
              </div>
              <div style="font-size:14px;color:#cbd5e1;margin-top:8px;">
                ${fmt(invoice.total)} due${invoice.duedate ? ` on ${fmtDate(invoice.duedate)}` : ''}
              </div>
            </div>
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:32px;">
              <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">Hi ${customer?.name || 'there'},</p>
              <p style="font-size:14px;line-height:1.7;color:#475569;margin:0 0 24px;">
                Please find your invoice attached. A summary is included below for quick reference.
              </p>
              <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin:0 0 24px;">
                <div style="display:flex;justify-content:space-between;gap:16px;padding:14px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
                  <span style="font-size:13px;color:#64748b;">Invoice</span>
                  <span style="font-size:13px;font-weight:600;color:#1e293b;">${invoice.number}</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:16px;padding:14px 16px;border-bottom:1px solid #e2e8f0;">
                  <span style="font-size:13px;color:#64748b;">Amount Due</span>
                  <span style="font-size:16px;font-weight:700;color:#0d7377;">${fmt(invoice.total)}</span>
                </div>
                ${invoice.duedate ? `
                <div style="display:flex;justify-content:space-between;gap:16px;padding:14px 16px;">
                  <span style="font-size:13px;color:#64748b;">Due Date</span>
                  <span style="font-size:13px;font-weight:600;color:#1e293b;">${fmtDate(invoice.duedate)}</span>
                </div>` : ''}
              </div>
              ${invoice.notes && invoice.notes.trim() !== '' ? `
              <div style="background:#f8fafc;border-left:4px solid #94a3b8;border-radius:10px;padding:16px 18px;margin:0 0 24px;">
                <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Invoice notes</div>
                <div style="font-size:14px;line-height:1.7;color:#334155;">${sanitizeNotesHtml(invoice.notes)}</div>
              </div>` : ''}
              ${sendNote ? `
              <div style="background:#f8fafc;border-left:4px solid #0d7377;border-radius:10px;padding:16px 18px;margin:0 0 24px;">
                <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Personal note</div>
                <div style="font-size:14px;line-height:1.7;color:#334155;white-space:pre-wrap;">${sendNote}</div>
              </div>` : ''}
              <div style="text-align:center;margin:28px 0 24px;">
                <a href="mailto:info@klair.ca" style="display:inline-block;background:#0d7377;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:700;">
                  Contact us
                </a>
              </div>
              <p style="font-size:13px;line-height:1.7;color:#64748b;margin:0;">
                If you have any questions, please reply to this email and we'll be happy to help.
              </p>
              <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#94a3b8;">
                <div style="font-weight:600;color:#475569;margin-bottom:4px;">${orgSettings?.companyname || activeOrg?.name || 'Your Company'}</div>
                ${orgSettings?.companyphone ? `<div>${orgSettings.companyphone}</div>` : ''}
                ${orgSettings?.companyemail ? `<div>${orgSettings.companyemail}</div>` : ''}
                ${orgSettings?.companyaddress ? `<div>${orgSettings.companyaddress}</div>` : ''}
                ${orgSettings?.gstnumber ? `<div style="margin-top:6px;">GST: ${orgSettings.gstnumber}</div>` : ''}
              </div>
            </div>
          </div>
        </div>
      `

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            to: sendEmail.trim(),
            subject: `Invoice ${invoice.number} from ${orgSettings?.company_name || activeOrg?.name}`,
            html,
            pdfBase64,
            filename,
          })
        }
      )

      const result = await res.json()
      if (!res.ok) {
        // Your function's own errors are shaped { error: {...} }, but a
        // rejection from Supabase's gateway itself (e.g. an auth failure
        // before your code even runs) is shaped differently — commonly
        // { message: "..." } at the top level. Falling back through both
        // shapes (and finally the raw status) means this banner is never
        // blank, whichever layer actually rejected the request.
        const message =
          result?.error?.message ||
          (typeof result?.error === 'string' ? result.error : null) ||
          result?.message ||
          (result ? JSON.stringify(result) : null) ||
          `Request failed with status ${res.status}`
        throw new Error(message)
      }

      if (invoice.status === 'draft') {
        await supabase
          .from('invoices')
          .update({ status: 'sent' })
          .eq('id', id)
          .eq('org_id', activeOrg.orgId)
        await fetchInvoice()
      }

      setSendResult('success')
    } catch (err) {
      console.error(err)
      setSendResult('error: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  // ── Edit helpers ───────────────────────────────────────────────────────────
  function addItem() {
    setEditItems(prev => [...prev, {
      id: `new-${Date.now()}`,
      product_id: '',
      name: '',
      quantity: '',
      unit_price: '',
      discount_type: 'none',
      discount_value: 0,
    }])
  }

  function removeItem(idx) {
    setEditItems(prev => prev.filter((_, i) => i !== idx))
  }

  function updateItem(idx, field, val) {
    setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  }

  function handleProductSelect(idx, productId) {
  const product = products.find(p => p.id === productId)
  setEditItems(prev => prev.map((it, i) => {   // in InvoiceView.jsx this is setEditItems
    if (i !== idx) return it
    return {
      ...it,
      product_id: productId,
      name:       product?.description?.trim() || product?.name || '',
      unit_price: product?.unit_price || 0,
    }
  }))
}

  function cancelEdit() {
    setEditItems(items)
    setEditNumber(invoice?.number || '')
    setEditStatus(invoice?.status || 'draft')
    setEditDate(invoice?.date || today())
    setEditDue(invoice?.due_date || '')
    setIsEditing(false)
    setEditNotes(invoice?.notes || '')
    setEditPO(invoice?.po_number || '')
  }

  // ── Live totals ────────────────────────────────────────────────────────────
  const editSubtotal = editItems.reduce((s, i) => s + calcLineTotal(i), 0)
  const editTax      = editSubtotal * 0.05
  const editTotal    = editSubtotal + editTax

  // ── Save ───────────────────────────────────────────────────────────────────
  async function saveChanges() {
    setSaving(true)
    try {
      const { error: invErr } = await supabase
        .from('invoices')
        .update({
          number:   editNumber,
          status:   editStatus,
          date:     editDate,
          due_date: editDue || null,
          subtotal: editSubtotal,
          tax:      editTax,
          total:    editTotal,
          notes:    editNotes,
          po_number: editPO,
        })
        .eq('id', id)
        .eq('org_id', activeOrg.orgId)
      if (invErr) throw invErr

      await supabase.from('invoice_items').delete().eq('invoice_id', id)

      const validItems = editItems.filter(i =>
        i.name?.trim() && Number(i.quantity) > 0 && Number(i.unit_price) >= 0
      )

      if (validItems.length > 0) {
        const { error: insErr } = await supabase
          .from('invoice_items')
          .insert(validItems.map(i => ({
            invoice_id:     id,
            org_id:         activeOrg.orgId,
            product_id:     i.product_id || null,
            name:           i.name.trim(),
            quantity:       Number(i.quantity),
            unit_price:     Number(i.unit_price) || 0,
            discount_type:  i.discount_type || 'none',
            discount_value: Number(i.discount_value) || 0,
          })))
        if (insErr) throw insErr
      }

      setIsEditing(false)
      await fetchInvoice()
    } catch (err) {
      console.error('Save failed:', err)
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  function calcDueDate(invoiceDate, dueDate) {
  if (!dueDate || !invoiceDate) return null
  const msPerDay = 86400000
  const orig = new Date(invoiceDate + 'T12:00:00')
  const due  = new Date(dueDate + 'T12:00:00')
  const offsetDays = Math.round((due - orig) / msPerDay)
  const today = new Date()
  const newDue = new Date(today.getFullYear(), today.getMonth(), today.getDate() + Math.max(offsetDays, 0))
  return newDue.toISOString().split('T')[0]
}

  // ── Duplicate ──────────────────────────────────────────────────────────────
  async function duplicateInvoice() {
    const { allowed, reason } = await checkCanCreateInvoice(activeOrg.orgId)
  if (!allowed) {
    alert(reason)
    return
  }
    if (!activeOrg?.orgId) return
    setDuplicating(true)
    try {
      const { data: lastInv } = await supabase
        .from('invoices')
        .select('number')
        .eq('org_id', activeOrg.orgId)
        .order('created_at', { ascending: false })
        .limit(1)

      const prevNumber = lastInv?.[0]?.number || ''
      const numMatch = prevNumber.match(/^(\D*)(\d+)$/)
      const prefix    = numMatch ? numMatch[1] : ''
      const padWidth  = numMatch ? numMatch[2].length : 3
      const lastNum   = numMatch ? parseInt(numMatch[2], 10) : 0
      const newNumber = `${prefix}${String(lastNum + 1).padStart(padWidth, '0')}`

      const { data: newInv, error: invErr } = await supabase
        .from('invoices')
        .insert({
          org_id:      activeOrg.orgId,
          customer_id: invoice.customer_id,
          number:      newNumber,
          date:        new Date().toISOString().split('T')[0],
          //due_date:    invoice.due_date || null,
          due_date: calcDueDate(invoice.date, invoice.due_date),
          status:      'draft',
          subtotal:    invoice.subtotal,
          tax:         invoice.tax,
          total:       invoice.total,
          notes:       invoice.notes || null,
        })
        .select()
        .single()
      if (invErr) throw invErr

      if (items.length > 0) {
        const { error: itemsErr } = await supabase
          .from('invoice_items')
          .insert(items.map(i => ({
            invoice_id:     newInv.id,
            org_id:         activeOrg.orgId,
            product_id:     i.product_id || null,
            name:           i.name,
            quantity:       i.quantity,
            unit_price:     i.unit_price,
            discount_type:  i.discount_type  || 'none',
            discount_value: i.discount_value || 0,
          })))
        if (itemsErr) throw itemsErr
      }

      navigate(`/invoices/${newInv.id}`)
    } catch (err) {
      alert('Duplicate failed: ' + err.message)
    } finally {
      setDuplicating(false)
    }
  }
  // ── Delete ─────────────────────────────────────────────────────────────────
  async function deleteInvoice() {
    if (!window.confirm('Delete this invoice? This cannot be undone.')) return
    await supabase.from('invoices').delete().eq('id', id).eq('org_id', activeOrg.orgId)
    navigate(-1)
  }

  // ── Mark sent ─────────────────────────────────────────────────────────────
  async function markInvoiceSent() {
    if (invoice.status !== 'draft') return
    await supabase
      .from('invoices')
      .update({ status: 'sent' })
      .eq('id', id)
      .eq('org_id', activeOrg.orgId)
    setInvoice(prev => ({ ...prev, status: 'sent' }))
    setEditStatus('sent')
  }

  async function handleExportPDF() {
    setExporting(true)
    try {
      await exportInvoicePDF(invoice, customer, items, activeOrg.orgId)
      await markInvoiceSent()
    } catch (err) {
      alert('PDF export failed: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  // ── Computed display totals ────────────────────────────────────────────────
  const subtotal = items.reduce((s, i) => s + calcLineTotal(i), 0)
  const tax      = subtotal * 0.05
  const total    = subtotal + tax

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <>
      <style>{css}</style>
      <div className="inv-root">
        <div className="inv-loading">
          <div className="inv-spinner" />
          <span style={{ fontSize: 13, color: '#94a3b8' }}>Loading invoice…</span>
        </div>
      </div>
    </>
  )

  const hasAnyDiscount = editItems.some(i => i.discount_value > 0 && i.discount_type !== 'none')

 // console.log('DEBUG customer:', customer, 'invoice:', invoice)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{css}</style>
      <div className="inv-root">

        {/* Top bar */}
        <div className="inv-topbar">
          <button className="inv-back" onClick={() => navigate('/invoices')}>
            ← Back to Invoices
          </button>

          <div className="inv-topbar-actions">
            {isEditing ? (
              <>
                <button className="inv-btn inv-btn--primary" onClick={saveChanges} disabled={saving || isSuspended}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button className="inv-btn inv-btn--danger" onClick={deleteInvoice} disabled={isSuspended}>Delete</button>
                <button className="inv-btn inv-btn--ghost" onClick={cancelEdit}>Cancel</button>
              </>
            ) : (
              <>
                <button className="inv-btn" onClick={handleExportPDF} disabled={exporting || isSuspended}>
                  {exporting ? 'Generating…' : '↓ Export PDF'}
                </button>
                <button
                  className="inv-btn"
                  disabled={isSuspended}
                  onClick={() => {
                    setSendEmail(customer?.email || '')
                    setSendNote('')
                    setSendResult(null)
                    setShowSendModal(true)
                  }}
                >
                  ✉ Send
                </button>
                <button className="inv-btn" onClick={duplicateInvoice} disabled={duplicating || isSuspended}>
                  {duplicating ? 'Duplicating…' : '⧉ Duplicate'}
                </button>
                {invoice?.status !== 'paid' && invoice?.status !== 'void' && (
                  <button
                    className="inv-btn"
                    style={{ borderColor: '#b2e0e2', color: '#0d7377' }}
                    onClick={() => setShowPayModal(true)}
                    disabled={isSuspended}
                  >
                    💳 Charge card
                  </button>
                )}
                <button className="inv-btn inv-btn--primary" onClick={() => setIsEditing(true)} disabled={isSuspended}>
                  Edit Invoice
                </button>
              </>
            )}
          </div>
        </div>
        
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <SuspendedBanner />
        </div>

        {/* Card */}
        <div className="inv-card">

          {isEditing && (
            <div className="inv-edit-band">
              <div className="inv-edit-dot" />
              Editing invoice — changes are not saved until you click Save Changes
            </div>
          )}

          {/* Header */}
          <div className="inv-header">
            <div className="inv-brand">
              <div className="inv-brand-name">INVOICE</div>
              <div className="inv-brand-tagline">Tax Invoice</div>
              {orgSettings?.gst_number && (
                <div className="inv-brand-tagline">
                  <span className="inv-date-label">GST #</span>
                  <span className="inv-date-value" style={{ color: '#475569' }}>
                    {orgSettings.gst_number}
                  </span>
                </div>
              )}
            </div>
            <div className="inv-header-right">
              <div>
                <div className="inv-number-label">Invoice No.</div>
                {isEditing ? (
                  <input
                    className="inv-input"
                    value={editNumber}
                    onChange={e => setEditNumber(e.target.value)}
                    style={{
                      fontSize: 20,
                      fontFamily: "'Fraunces', Georgia, serif",
                      fontWeight: 300,
                      color: 'white',
                      background: 'rgba(255,255,255,0.1)',
                      border: '1.5px solid rgba(255,255,255,0.25)',
                      borderRadius: 8,
                      padding: '6px 12px',
                      width: 160,
                      letterSpacing: '0.02em',
                    }}
                  />
                ) : (
                  <div className="inv-number-value">{invoice?.number}</div>
                )}
              </div>
              <StatusBadge
                status={invoice?.status}
                edit={isEditing}
                value={editStatus}
                onChange={setEditStatus}
              />
            </div>
          </div>

          {/* Body */}
          <div className="inv-body">

            {/* ── View mode ── */}
            {!isEditing && (
              <>
                <div className="inv-meta-row">
                  <div>
                    <div className="inv-meta-section-label">Bill To</div>
                    <div className="inv-customer-name">{customer?.name || '—'}</div>
                    <div className="inv-customer-detail">
                      {customer?.email && <div>{customer.email}</div>}
                      {customer?.phone && <div>{customer.phone}</div>}
                      {customer?.address && <div>{customer.address}</div>}
                    </div>
                  </div>
                  <div className="inv-dates-grid">
                    <div className="inv-meta-section-label" style={{ textAlign: 'right' }}>Invoice Details</div>
                    <div className="inv-date-row">
                      <span className="inv-date-label">Issued On</span>
                      <span className="inv-date-value">{fmtDate(invoice?.date)}</span>
                    </div>
                    <div className="inv-date-row">
                      <span className="inv-date-label">Due Date</span>
                      <span className="inv-date-value">{invoice?.due_date ? fmtDate(invoice.due_date) : 'Net 30'}</span>
                    </div>
                    {invoice?.po_number && (
                      <div className="inv-date-row">
                        <span className="inv-date-label">PO #</span>
                        <span className="inv-date-value">{invoice.po_number}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Items table */}
                <div className="inv-table-wrap">
                  {items.length === 0 ? (
                    <div className="inv-empty-items">
                      No line items yet. Click Edit Invoice to add items.
                    </div>
                  ) : (
                    <table className="inv-table">
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th style={{ textAlign: 'right' }}>Qty</th>
                          <th style={{ textAlign: 'right' }}>Unit Price</th>
                          <th style={{ textAlign: 'right' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, i) => {
                          const lineSubtotal = (Number(item.quantity)||0) * (Number(item.unit_price)||0)
                          const lineDiscount = calcLineDiscount(item)
                          const lineTotal    = calcLineTotal(item)
                          return (
                            <tr key={item.id || i}>
                              <td>
                                {item.product_id && products.find(p => p.id === item.product_id) && (
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 2 }}>
                                    {products.find(p => p.id === item.product_id)?.name}
                                  </div>
                                )}
                                <div className="inv-item-name" style={{ color: item.product_id ? '#64748b' : '#1e293b' }}>
                                  {item.name}
                                </div>
                              </td>
                              <td className="inv-item-num">{item.quantity}</td>
                              <td className="inv-item-num">
                                {fmt(item.unit_price)}
                                {item.discount_value > 0 && item.discount_type !== 'none' && (
                                  <div style={{ fontSize: 11, color: '#059669', marginTop: 2 }}>
                                    {item.discount_type === 'percent'
                                      ? `${item.discount_value}% off`
                                      : `${fmt(item.discount_value)} off`}
                                  </div>
                                )}
                              </td>
                              <td className="inv-item-amount">
                                {item.discount_value > 0 && item.discount_type !== 'none' && (
                                  <span style={{
                                    fontSize: 11, color: '#94a3b8',
                                    textDecoration: 'line-through',
                                    marginRight: 6
                                  }}>
                                    {fmt(lineSubtotal)}
                                  </span>
                                )}
                                {fmt(lineTotal)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Totals */}
                <div className="inv-totals">
                  <div className="inv-total-row">
                    <span className="inv-total-label">Subtotal</span>
                    <span className="inv-total-value">{fmt(subtotal)}</span>
                  </div>
                  <div className="inv-total-row">
                    <span className="inv-total-label">Tax (5%)</span>
                    <span className="inv-total-value">{fmt(tax)}</span>
                  </div>
                  <div className="inv-total-divider" />
                  <div className="inv-total-row inv-total-row--grand">
                    <span className="inv-total-label">Total Due</span>
                    <span className="inv-total-value">{fmt(total)}</span>
                  </div>
                </div>

                {invoice?.notes && (
                  <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px dashed #e2e8f0' }}>
                    <div style={{
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                      textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8
                    }}>
                      Notes
                    </div>
                    <div
                      style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}
                      dangerouslySetInnerHTML={{ __html: sanitizeNotesHtml(invoice.notes) }}
                    />
                  </div>
                )}

                <div className="inv-footer-note">
                  {orgSettings?.gst_number && (
                    <div style={{ marginBottom: 6, fontWeight: 600, color: '#475569', fontSize: 13 }}>
                      GST #: {orgSettings.gst_number}
                      
                    </div>
                    
                  )}
                  Thank you for your business.
                </div>
                <PaymentsSection
                        invoiceId={id}
                        invoiceTotal={total}
                        orgId={activeOrg.orgId}
                        invoice={invoice}
                        customer={customer}
                        isSuspended={isSuspended}
                        onPaymentAdded={() => fetchInvoice()}
                      />
              </>
            )}

            {/* ── Edit mode ── */}
            {isEditing && (
              <>
                <div className="inv-edit-meta">
                  <div>
                    <div className="inv-meta-section-label">Bill To</div>
                    <div className="inv-customer-name">{customer?.name || '—'}</div>
                    <div className="inv-customer-detail" style={{ fontSize: 12 }}>{customer?.email}</div>
                  </div>
                  <div className="inv-edit-meta-right">
                    <div className="inv-field">
                      <label className="inv-field-label">Issue Date</label>
                      <input className="inv-input" type="date" value={editDate}
                        onChange={e => setEditDate(e.target.value)} />
                    </div>
                    <div className="inv-field">
                      <label className="inv-field-label">Due Date</label>
                      <input className="inv-input" type="date" value={editDue}
                        onChange={e => setEditDue(e.target.value)} />
                    </div>
                    <div className="inv-field">
                      <label className="inv-field-label">PO Number</label>
                      <input
                        className="inv-input"
                        type="text"
                        placeholder="e.g. PO-1234"
                        value={editPO}
                        onChange={e => setEditPO(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Line items */}
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 70px 100px 110px 36px', gap: 8, marginBottom: 6, padding: '0 2px' }}>
                    <span className="inv-items-col-label">Product</span>
                    <span className="inv-items-col-label">Description</span>
                    <span className="inv-items-col-label inv-items-col-label--r">Qty</span>
                    <span className="inv-items-col-label inv-items-col-label--r">Unit Price</span>
                    <span className="inv-items-col-label inv-items-col-label--r">Discount</span>
                    <span />
                  </div>

                  {editItems.length === 0 && (
                    <div className="inv-empty-items" style={{ marginBottom: 12 }}>
                      No items yet — add one below.
                    </div>
                  )}

                  {editItems.map((item, idx) => {
                    const lineSubtotal = (Number(item.quantity)||0) * (Number(item.unit_price)||0)
                    const lineDiscount = calcLineDiscount(item)
                    const lineTotal    = calcLineTotal(item)
                    return (
                      <div key={item.id || idx}>
                        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 70px 100px 110px 36px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                          <select
                            className="inv-item-input inv-select"
                            style={{ background: 'white' }}
                            value={item.product_id || ''}
                            onChange={e => handleProductSelect(idx, e.target.value)}
                          >
                            <option value="">Select…</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          <input
                            className="inv-item-input"
                            placeholder="Description / detail"
                            value={item.name}
                            onChange={e => updateItem(idx, 'name', e.target.value)}
                            style={{ background: 'white' }}
                          />
                          <input
                            className="inv-item-input inv-item-input--num"
                            type="number" placeholder="1" min="0" step="any"
                            value={item.quantity}
                            onChange={e => updateItem(idx, 'quantity', e.target.value)}
                            style={{ background: 'white' }}
                          />
                          <input
                            className="inv-item-input inv-item-input--num"
                            type="number" placeholder="0.00" min="0" step="any"
                            value={item.unit_price}
                            onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                            style={{ background: 'white' }}
                          />
                          <div style={{ display: 'flex', gap: 4 }}>
                            <select
                              className="inv-item-input"
                              style={{ width: 52, padding: '7px 4px', fontSize: 11, background: 'white' }}
                              value={item.discount_type || 'none'}
                              onChange={e => updateItem(idx, 'discount_type', e.target.value)}
                            >
                              <option value="none">—</option>
                              <option value="percent">%</option>
                              <option value="fixed">$</option>
                            </select>
                            {item.discount_type && item.discount_type !== 'none' && (
                              <input
                                className="inv-item-input inv-item-input--num"
                                type="number" placeholder="0" min="0" step="any"
                                style={{ width: 52, background: 'white' }}
                                value={item.discount_value || ''}
                                onChange={e => updateItem(idx, 'discount_value', e.target.value)}
                              />
                            )}
                          </div>
                          <button className="inv-item-del" onClick={() => removeItem(idx)} title="Remove">×</button>
                        </div>
                        {lineDiscount > 0 && (
                          <div style={{ fontSize: 11, color: '#059669', marginBottom: 4, display: 'flex', gap: 8, justifyContent: 'flex-end', paddingRight: 44 }}>
                            <span style={{ color: '#94a3b8', textDecoration: 'line-through' }}>{fmt(lineSubtotal)}</span>
                            <span>−{fmt(lineDiscount)} saved</span>
                            <span style={{ fontWeight: 600 }}>= {fmt(lineTotal)}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <button className="inv-add-item" onClick={addItem}>+ Add Line Item</button>
                </div>

                {/* Live totals */}
                <div className="inv-edit-totals">
                  <div className="inv-total-row">
                    <span className="inv-total-label">Subtotal</span>
                    <span className="inv-total-value">{fmt(editSubtotal)}</span>
                  </div>
                  <div className="inv-total-row">
                    <span className="inv-total-label">Tax (5%)</span>
                    <span className="inv-total-value">{fmt(editTax)}</span>
                  </div>
                  <div className="inv-total-divider" />
                  <div className="inv-total-row inv-total-row--grand">
                    <span className="inv-total-label">Total</span>
                    <span className="inv-total-value">{fmt(editTotal)}</span>
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <div className="inv-field">
                    <label className="inv-field-label">Notes</label>
                    <RichTextNotes
                      value={editNotes}
                      onChange={setEditNotes}
                      placeholder="Payment terms, bank details, thank you note..."
                    />
                  </div>
                </div>
              </>
            )}

          </div>
        </div>
      </div>

      {/* ── Send Invoice Modal ── */}
      {showSendModal && (
        <div className="inv-modal-overlay" onClick={() => !sending && setShowSendModal(false)}>
          <div className="inv-modal" onClick={e => e.stopPropagation()}>
            <div className="inv-modal-header">
              <span className="inv-modal-title">Send Invoice {invoice.number}</span>
              <button className="inv-modal-close" onClick={() => setShowSendModal(false)}>×</button>
            </div>
            <div className="inv-modal-body">
              {sendResult === 'success' ? (
                <div className="inv-send-success">
                  ✓ Invoice sent successfully to {sendEmail}
                  {invoice.status === 'draft' && ' — status updated to Sent'}
                </div>
              ) : (
                <>
                  {sendResult && (
                    <div className="inv-send-error">⚠ {sendResult.replace('error: ', '')}</div>
                  )}
                  <div className="inv-field">
                    <label className="inv-field-label">Send To *</label>
                    <input
                      className="inv-input"
                      type="email"
                      placeholder="customer@email.com"
                      value={sendEmail}
                      onChange={e => setSendEmail(e.target.value)}
                    />
                  </div>
                  <div style={{
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 10, padding: '12px 16px', fontSize: 13,
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Invoice</span>
                      <span style={{ fontWeight: 600 }}>{invoice.number}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Amount</span>
                      <span style={{ fontWeight: 700, color: '#0d7377' }}>{fmt(invoice.total)}</span>
                    </div>
                    {invoice.due_date && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>Due</span>
                        <span style={{ fontWeight: 500 }}>{fmtDate(invoice.due_date)}</span>
                      </div>
                    )}
                  </div>
                  <div className="inv-field">
                    <label className="inv-field-label">Personal Note (optional)</label>
                    <textarea
                      className="inv-input"
                      rows={3}
                      placeholder="e.g. Please let me know if you have any questions."
                      value={sendNote}
                      onChange={e => setSendNote(e.target.value)}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    📎 PDF will be attached · Invoice will be marked as <strong>Sent</strong> if currently draft
                  </div>
                </>
              )}
            </div>
            <div className="inv-modal-footer">
              <button className="inv-btn inv-btn--ghost" onClick={() => setShowSendModal(false)} disabled={sending}>
                {sendResult === 'success' ? 'Close' : 'Cancel'}
              </button>
              {sendResult !== 'success' && invoice?.status !== 'paid' && invoice?.status !== 'void' && (
                <button
                  className="inv-btn"
                  style={{ borderColor: '#b2e0e2', color: '#0d7377' }}
                  onClick={() => { setShowSendModal(false); setShowPayModal(true) }}
                  disabled={sending}
                  title="Collect card payment instead of sending"
                >
                  💳 Charge card instead
                </button>
              )}
              {sendResult !== 'success' && (
                <button
                  className="inv-btn inv-btn--primary"
                  onClick={handleSendInvoice}
                  disabled={sending || !sendEmail.trim()}
                >
                  {sending ? 'Sending…' : '✉ Send Invoice'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── Pay Now Modal ── */}
      {showPayModal && (
        <div className="inv-modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="inv-modal" onClick={e => e.stopPropagation()}>
            <div className="inv-modal-header">
              <span className="inv-modal-title">Charge card — {invoice.number}</span>
              <button className="inv-modal-close" onClick={() => setShowPayModal(false)}>×</button>
            </div>
            <div className="inv-modal-body">
              <div style={{
                background: 'linear-gradient(135deg, #f0fdfe 0%, #e8f5f5 100%)',
                border: '1.5px solid #b2e0e2',
                borderRadius: 12,
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0d7377' }}>Amount to charge</div>
                  <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 26, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>{fmt(total)}</div>
                  {invoice?.due_date && (
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Due {fmtDate(invoice.due_date)}</div>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#64748b', textAlign: 'right' }}>
                  <div style={{ fontWeight: 500 }}>{customer?.name}</div>
                  <div>{invoice.number}</div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                Clicking <strong>Open payment terminal</strong> will launch the Helcim card reader modal. 
                The invoice will be automatically marked as <strong>Paid</strong> on successful charge.
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                💡 Use this for in-person or phone payments — not for emailing a payment link to the customer.
              </div>
            </div>
            <div className="inv-modal-footer">
              <button className="inv-btn inv-btn--ghost" onClick={() => setShowPayModal(false)}>
                Cancel
              </button>
              <PayNowButton
                invoice={{ ...invoice, total }}
                customerCode={orgSettings?.helcim_customer_code ?? undefined}
                onPaid={(updatedInvoice) => {
                  setInvoice(updatedInvoice)
                  setEditStatus('paid')
                  setShowPayModal(false)
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
