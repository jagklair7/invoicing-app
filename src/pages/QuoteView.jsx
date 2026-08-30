import { useState, useEffect, useContext } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../app/supabaseClient";
import { useOrg } from "../context/OrgContext";
import { exportQuotePDF } from "../utils/exportQuotePDF";
import SuspendedBanner from '../components/SuspendedBanner'

const STATUS_COLORS = {
  draft:     { bg: "#f3f4f6", color: "#6b7280" },
  sent:      { bg: "#eff6ff", color: "#3b82f6" },
  approved:  { bg: "#f0fdf4", color: "#16a34a" },
  declined:  { bg: "#fef2f2", color: "#dc2626" },
  converted: { bg: "#faf5ff", color: "#7c3aed" },
};

export default function QuoteView() {
 // const { activeOrg } = useContext(OrgContext);
  const { activeOrg, isSuspended } = useOrg();
  const { id } = useParams();
  const navigate = useNavigate();

  const [quote, setQuote] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");

  useEffect(() => {
    if (!activeOrg?.orgId) return;
    loadQuote();
  }, [activeOrg?.orgId, id]);

  async function loadQuote() {
    setLoading(true);
    const { data } = await supabase
      .from("quotes")
      .select("*, customers(id, name, email, phone, address)")
      .eq("id", id)
      .eq("org_id", activeOrg.orgId)
      .single();

    if (data) {
      setQuote(data);
      setCustomer(data.customers);
    }
    setLoading(false);
  }

  async function updateStatus(status) {
    setActionLoading(true);
    await supabase
      .from("quotes")
      .update({ status })
      .eq("id", id)
      .eq("org_id", activeOrg.orgId);
    setQuote((q) => ({ ...q, status }));
    setActionLoading(false);
  }

  async function convertToInvoice() {
    const selectedOpts = quote.selected_options || [];
    if (!selectedOpts.length) {
      alert("No options selected by the customer yet.");
      return;
    }
    setActionLoading(true);

    // Merge line items from all selected options
    const chosenOptions = (quote.options || []).filter((o) => selectedOpts.includes(o.label));
    const line_items = chosenOptions.flatMap((opt) =>
      (opt.line_items || []).map((item) => ({
        description: `[Option ${opt.label}] ${item.description}`,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        discount_type: item.discount_type,
      }))
    );
    const subtotal      = chosenOptions.reduce((s, o) => s + (parseFloat(o.subtotal)      || 0), 0);
    const discount_total= chosenOptions.reduce((s, o) => s + (parseFloat(o.discount_total)|| 0), 0);
    const tax           = chosenOptions.reduce((s, o) => s + (parseFloat(o.tax)           || 0), 0);
    const total         = chosenOptions.reduce((s, o) => s + (parseFloat(o.total)         || 0), 0);

    const { count } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrg.orgId);
    const invoiceNumber = `INV-${String((count || 0) + 1).padStart(4, "0")}`;

    const { data: invoice } = await supabase
      .from("invoices")
      .insert({
        org_id: activeOrg.orgId,
        customer_id: quote.customer_id,
        invoice_number: invoiceNumber,
        issue_date: new Date().toISOString().split("T")[0],
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
        status: "draft",
        line_items,
        subtotal,
        discount_total,
        tax,
        total,
        notes: quote.notes,
        po_number: quote.po_number,
      })
      .select()
      .single();

    if (invoice) {
      await supabase
        .from("quotes")
        .update({ status: "converted", converted_invoice_id: invoice.id })
        .eq("id", id);
      navigate(`/invoices/${invoice.id}`);
    }
    setActionLoading(false);
  }

  function copyPublicLink() {
    const url = `${window.location.origin}/q/${quote.customer_token}`;
    navigator.clipboard.writeText(url);
    setCopyMsg("Copied!");
    setTimeout(() => setCopyMsg(""), 2000);
  }
  
  async function handleDeleteQuote() {
    if (!window.confirm(`Delete quote ${quote.quote_number}? This cannot be undone.`)) return;
    const { error } = await supabase
      .from("quotes")
      .delete()
      .eq("id", id)
      .eq("org_id", activeOrg.orgId);
    if (error) {
      alert('Failed to delete quote: ' + error.message);
      return;
    }
    navigate("/quotes");
  }

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#9ca3af" }}>Loading…</div>;
  if (!quote)  return <div style={{ padding: 60, textAlign: "center", color: "#9ca3af" }}>Quote not found.</div>;

  const sc           = STATUS_COLORS[quote.status] || STATUS_COLORS.draft;
  const publicUrl    = `${window.location.origin}/q/${quote.customer_token}`;
  const selectedOpts = quote.selected_options || [];   // e.g. ["A", "C"]
  const currentOpt   = quote.options?.[activeTab];

  // Combined total of whatever the customer picked
  const approvedTotal = (quote.options || [])
    .filter((o) => selectedOpts.includes(o.label))
    .reduce((s, o) => s + (parseFloat(o.total) || 0), 0);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>

      {/* ── Header ── */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
        <div>
          <button
            onClick={() => navigate("/quotes")}
            style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 14, padding: 0, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}
          >
            ← Back to Quotes
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>{quote.quote_number}</h1>
            <span style={{
              padding: "3px 12px", borderRadius: 20, fontSize: 13, fontWeight: 600,
              background: sc.bg, color: sc.color, textTransform: "capitalize"
            }}>{quote.status}</span>
          </div>
          {customer && (
            <div style={{ marginTop: 6, color: "#6b7280", fontSize: 14 }}>
              {customer.name}{customer.email ? ` · ${customer.email}` : ""}
            </div>
          )}
        </div>

        {/* Actions */}
        
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {quote.status === "draft" && (
            <button className="inv-btn" onClick={() => navigate(`/quotes/${id}/edit`)} disabled={isSuspended}>Edit</button>
          )}
          <button className="inv-btn" onClick={() => exportQuotePDF(quote, customer, activeOrg)}>Export PDF</button>
          <button className="inv-btn" onClick={copyPublicLink}>{copyMsg || "Copy Link"}</button>
          {quote.status === "draft" && (
            <button className="inv-btn inv-btn-primary" onClick={() => updateStatus("sent")} disabled={actionLoading || isSuspended}>
              Mark as Sent
            </button>
          )}
          {quote.status === "approved" && !quote.converted_invoice_id && (
            <button className="inv-btn inv-btn-primary" onClick={convertToInvoice} disabled={actionLoading || isSuspended}>
              {actionLoading ? "Converting…" : "Convert to Invoice"}
            </button>
          )}
          {quote.converted_invoice_id && (
            <button className="inv-btn" onClick={() => navigate(`/invoices/${quote.converted_invoice_id}`)}>
              View Invoice →
            </button>
          )}
          <button
            className="inv-btn"
            style={{ color: "#dc2626", borderColor: "#fecaca" }}
            onClick={handleDeleteQuote}
            disabled={isSuspended}
          >
            🗑 Delete
          </button>
        </div>
      </div>

      <SuspendedBanner />

      {/* ── Public link banner ── */}
      <div style={{
        background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10,
        padding: "12px 16px", marginBottom: 24,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap"
      }}>
        <div style={{ fontSize: 13, color: "#0369a1" }}>
          <strong>Customer link:</strong>{" "}
          <span style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{publicUrl}</span>
        </div>
        <button className="inv-btn" style={{ fontSize: 12, padding: "4px 12px", whiteSpace: "nowrap" }} onClick={copyPublicLink}>
          {copyMsg || "Copy"}
        </button>
      </div>

      {/* ── Customer selection summary (only when options are picked) ── */}
      {selectedOpts.length > 0 && (
        <div style={{
          background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12,
          padding: "16px 20px", marginBottom: 24,
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Customer Selected
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {selectedOpts.map((label) => (
                <span key={label} style={{
                  padding: "4px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700,
                  background: "#16a34a", color: "#fff"
                }}>
                  Option {label}
                </span>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "#15803d", marginBottom: 2 }}>Combined Total</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#15803d" }}>
              ${approvedTotal.toLocaleString("en-CA", { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      )}

      {/* ── Meta row ── */}
      <div style={{
        background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
        padding: 20, marginBottom: 24,
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16
      }}>
        {[
          { label: "Issue Date",  value: quote.issue_date },
          { label: "Expiry Date", value: quote.expiry_date || "—" },
          { label: "PO Number",   value: quote.po_number  || "—" },
          {
            label: "Selected Options",
            value: selectedOpts.length
              ? selectedOpts.map((l) => `Option ${l}`).join(", ")
              : "Pending",
          },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Options tabs ── */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", background: "#f9fafb", padding: "0 16px", gap: 4, overflowX: "auto" }}>
          {(quote.options || []).map((opt, idx) => {
            const isSelected = selectedOpts.includes(opt.label);
            return (
              <button
                key={opt.label}
                onClick={() => setActiveTab(idx)}
                style={{
                  padding: "12px 20px", border: "none", background: "none",
                  cursor: "pointer", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap",
                  color: activeTab === idx ? "#4f46e5" : "#6b7280",
                  borderBottom: activeTab === idx ? "2px solid #4f46e5" : "2px solid transparent",
                  marginBottom: -1, display: "flex", alignItems: "center", gap: 8,
                }}
              >
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 22, height: 22, borderRadius: 6,
                  background: isSelected ? "#16a34a" : activeTab === idx ? "#4f46e5" : "#e5e7eb",
                  color: (isSelected || activeTab === idx) ? "#fff" : "#374151",
                  fontSize: 11, fontWeight: 700,
                }}>{opt.label}</span>
                Option {opt.label}
                {isSelected && <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>✓</span>}
              </button>
            );
          })}
        </div>

        {currentOpt && (
          <div style={{ padding: 24 }}>
            {(currentOpt.title || currentOpt.description) && (
              <div style={{ marginBottom: 20 }}>
                {currentOpt.title && <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{currentOpt.title}</div>}
                {currentOpt.description && <div style={{ fontSize: 14, color: "#6b7280" }}>{currentOpt.description}</div>}
              </div>
            )}

            {/* Line items table */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  {["Description", "Qty", "Unit Price", "Discount", "Total"].map((h) => (
                    <th key={h} style={{
                      padding: "8px 12px", textAlign: h === "Description" ? "left" : "right",
                      fontSize: 11, fontWeight: 600, color: "#9ca3af",
                      textTransform: "uppercase", letterSpacing: "0.05em"
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(currentOpt.line_items || []).map((item, i) => {
                  const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
                  let disc = 0;
                  if (item.discount_type === "%") disc = lineTotal * ((parseFloat(item.discount) || 0) / 100);
                  else disc = parseFloat(item.discount) || 0;
                  const net = lineTotal - disc;
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px", fontSize: 14, color: "#111827" }}>{item.description}</td>
                      <td style={{ padding: "10px 12px", fontSize: 14, color: "#374151", textAlign: "right" }}>{item.quantity}</td>
                      <td style={{ padding: "10px 12px", fontSize: 14, color: "#374151", textAlign: "right" }}>${parseFloat(item.unit_price || 0).toFixed(2)}</td>
                      <td style={{ padding: "10px 12px", fontSize: 14, color: disc > 0 ? "#dc2626" : "#9ca3af", textAlign: "right" }}>
                        {disc > 0 ? `−$${disc.toFixed(2)}` : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 14, fontWeight: 600, color: "#111827", textAlign: "right" }}>${net.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Option totals */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ width: 260 }}>
                {[
                  { label: "Subtotal", value: currentOpt.subtotal, color: "#6b7280" },
                  (currentOpt.discount_total > 0) ? { label: "Discount", value: -currentOpt.discount_total, color: "#dc2626" } : null,
                  { label: "Tax", value: currentOpt.tax, color: "#6b7280" },
                ].filter(Boolean).map(({ label, value, color }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14, color }}>
                    <span>{label}</span>
                    <span>{value < 0 ? `−$${Math.abs(value).toFixed(2)}` : `$${(value || 0).toFixed(2)}`}</span>
                  </div>
                ))}
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  borderTop: "2px solid #e5e7eb", paddingTop: 12,
                  fontWeight: 700, fontSize: 20, color: "#111827"
                }}>
                  <span>Option Total</span>
                  <span>${(parseFloat(currentOpt.total) || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Notes ── */}
      {quote.notes && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Notes</div>
          <div style={{ fontSize: 14, color: "#374151", whiteSpace: "pre-wrap" }}>{quote.notes}</div>
        </div>
      )}
    </div>
  );
}
