import { useState, useEffect, useContext } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { OrgContext } from "../context/OrgContext";

const OPTION_LABELS = ["A", "B", "C", "D", "E"];

function emptyOption(label) {
  return {
    label,
    title: "",
    description: "",
    line_items: [{ description: "", quantity: 1, unit_price: 0, discount: 0, discount_type: "%" }],
    subtotal: 0,
    discount_total: 0,
    tax: 0,
    total: 0,
  };
}

function calcOptionTotals(option) {
  let subtotal = 0;
  let discount_total = 0;

  for (const item of option.line_items) {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unit_price) || 0;
    const lineTotal = qty * price;
    let disc = 0;
    if (item.discount_type === "%") {
      disc = lineTotal * ((parseFloat(item.discount) || 0) / 100);
    } else {
      disc = parseFloat(item.discount) || 0;
    }
    subtotal += lineTotal;
    discount_total += disc;
  }

  const taxable = subtotal - discount_total;
  const tax = taxable * ((parseFloat(option.tax_rate) || 0) / 100);
  const total = taxable + tax;

  return { subtotal, discount_total, tax, total };
}

export default function QuoteForm() {
  const { activeOrg } = useContext(OrgContext);
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [customers, setCustomers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const [form, setForm] = useState({
    customer_id: "",
    quote_number: "",
    issue_date: new Date().toISOString().split("T")[0],
    expiry_date: "",
    notes: "",
    po_number: "",
    options: [emptyOption("A")],
  });

  useEffect(() => {
    if (!activeOrg?.orgId) return;
    fetchCustomers();
    if (isEdit) loadQuote();
    else generateQuoteNumber();
  }, [activeOrg?.orgId]);

  async function fetchCustomers() {
    const { data } = await supabase
      .from("customers")
      .select("id, name, email")
      .eq("org_id", activeOrg.orgId)
      .order("name");
    setCustomers(data || []);
  }

  async function generateQuoteNumber() {
    const { count } = await supabase
      .from("quotes")
      .select("*", { count: "exact", head: true })
      .eq("org_id", activeOrg.orgId);
    const num = String((count || 0) + 1).padStart(4, "0");
    setForm((f) => ({ ...f, quote_number: `Q-${num}` }));
  }

  async function loadQuote() {
    const { data } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", id)
      .eq("org_id", activeOrg.orgId)
      .single();
    if (data) {
      setForm({
        customer_id: data.customer_id || "",
        quote_number: data.quote_number,
        issue_date: data.issue_date,
        expiry_date: data.expiry_date || "",
        notes: data.notes || "",
        po_number: data.po_number || "",
        options: data.options?.length ? data.options : [emptyOption("A")],
      });
    }
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setOptionField(idx, key, value) {
    setForm((f) => {
      const options = [...f.options];
      options[idx] = { ...options[idx], [key]: value };
      return { ...f, options };
    });
  }

  function setLineItem(optIdx, lineIdx, key, value) {
    setForm((f) => {
      const options = [...f.options];
      const items = [...options[optIdx].line_items];
      items[lineIdx] = { ...items[lineIdx], [key]: value };
      options[optIdx] = { ...options[optIdx], line_items: items };
      return { ...f, options };
    });
  }

  function addLineItem(optIdx) {
    setForm((f) => {
      const options = [...f.options];
      options[optIdx] = {
        ...options[optIdx],
        line_items: [
          ...options[optIdx].line_items,
          { description: "", quantity: 1, unit_price: 0, discount: 0, discount_type: "%" },
        ],
      };
      return { ...f, options };
    });
  }

  function removeLineItem(optIdx, lineIdx) {
    setForm((f) => {
      const options = [...f.options];
      const items = options[optIdx].line_items.filter((_, i) => i !== lineIdx);
      options[optIdx] = { ...options[optIdx], line_items: items.length ? items : [{ description: "", quantity: 1, unit_price: 0, discount: 0, discount_type: "%" }] };
      return { ...f, options };
    });
  }

  function addOption() {
    if (form.options.length >= OPTION_LABELS.length) return;
    const label = OPTION_LABELS[form.options.length];
    setForm((f) => ({ ...f, options: [...f.options, emptyOption(label)] }));
    setActiveTab(form.options.length);
  }

  function removeOption(idx) {
    if (form.options.length <= 1) return;
    setForm((f) => {
      const options = f.options.filter((_, i) => i !== idx).map((o, i) => ({ ...o, label: OPTION_LABELS[i] }));
      return { ...f, options };
    });
    setActiveTab(Math.max(0, idx - 1));
  }

  async function handleSave(status = "draft") {
    if (!form.quote_number.trim()) return alert("Quote number is required.");
    setSaving(true);

    const options = form.options.map((opt) => {
      const totals = calcOptionTotals(opt);
      return { ...opt, ...totals };
    });

    const payload = {
      org_id: activeOrg.orgId,
      customer_id: form.customer_id || null,
      quote_number: form.quote_number,
      issue_date: form.issue_date,
      expiry_date: form.expiry_date || null,
      notes: form.notes,
      po_number: form.po_number,
      options,
      status,
    };

    if (isEdit) {
      await supabase.from("quotes").update(payload).eq("id", id).eq("org_id", activeOrg.orgId);
      navigate(`/quotes/${id}`);
    } else {
      const { data } = await supabase.from("quotes").insert(payload).select().single();
      navigate(`/quotes/${data.id}`);
    }
    setSaving(false);
  }

  const currentOpt = form.options[activeTab];
  const totals = currentOpt ? calcOptionTotals(currentOpt) : {};

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <button
            onClick={() => navigate("/quotes")}
            style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 14, padding: 0, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}
          >
            ← Back to Quotes
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>
            {isEdit ? "Edit Quote" : "New Quote"}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="inv-btn" onClick={() => handleSave("draft")} disabled={saving}>
            Save Draft
          </button>
          <button className="inv-btn inv-btn-primary" onClick={() => handleSave("draft")} disabled={saving}>
            {saving ? "Saving…" : "Save Quote"}
          </button>
        </div>
      </div>

      {/* Top meta fields */}
      <div style={{
        background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
        padding: 24, marginBottom: 24
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
          <div>
            <label className="inv-label">Customer</label>
            <select
              className="inv-input"
              value={form.customer_id}
              onChange={(e) => setField("customer_id", e.target.value)}
            >
              <option value="">— Select customer —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="inv-label">Quote #</label>
            <input className="inv-input" value={form.quote_number} onChange={(e) => setField("quote_number", e.target.value)} />
          </div>
          <div>
            <label className="inv-label">Issue Date</label>
            <input type="date" className="inv-input" value={form.issue_date} onChange={(e) => setField("issue_date", e.target.value)} />
          </div>
          <div>
            <label className="inv-label">Expiry Date</label>
            <input type="date" className="inv-input" value={form.expiry_date} onChange={(e) => setField("expiry_date", e.target.value)} />
          </div>
          <div>
            <label className="inv-label">PO Number</label>
            <input className="inv-input" value={form.po_number} onChange={(e) => setField("po_number", e.target.value)} placeholder="Optional" />
          </div>
        </div>
      </div>

      {/* Options tabs */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
        {/* Tab bar */}
        <div style={{
          display: "flex", alignItems: "center", borderBottom: "1px solid #e5e7eb",
          background: "#f9fafb", padding: "0 16px", gap: 4
        }}>
          {form.options.map((opt, idx) => (
            <button
              key={opt.label}
              onClick={() => setActiveTab(idx)}
              style={{
                padding: "12px 20px", border: "none", background: "none",
                cursor: "pointer", fontSize: 14, fontWeight: 600,
                color: activeTab === idx ? "#4f46e5" : "#6b7280",
                borderBottom: activeTab === idx ? "2px solid #4f46e5" : "2px solid transparent",
                marginBottom: -1, transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 8
              }}
            >
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 22, height: 22, borderRadius: 6,
                background: activeTab === idx ? "#4f46e5" : "#e5e7eb",
                color: activeTab === idx ? "#fff" : "#374151",
                fontSize: 11, fontWeight: 700
              }}>{opt.label}</span>
              Option {opt.label}
              {form.options.length > 1 && (
                <span
                  onClick={(e) => { e.stopPropagation(); removeOption(idx); }}
                  style={{ marginLeft: 4, color: "#9ca3af", fontSize: 16, lineHeight: 1, cursor: "pointer" }}
                >×</span>
              )}
            </button>
          ))}
          {form.options.length < OPTION_LABELS.length && (
            <button
              onClick={addOption}
              style={{
                padding: "8px 14px", border: "1px dashed #d1d5db", borderRadius: 8,
                background: "none", cursor: "pointer", fontSize: 13, color: "#6b7280",
                marginLeft: 8, display: "flex", alignItems: "center", gap: 4
              }}
            >
              + Add Option
            </button>
          )}
        </div>

        {/* Option editor */}
        {currentOpt && (
          <div style={{ padding: 24 }}>
            {/* Option title + description */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginBottom: 24 }}>
              <div>
                <label className="inv-label">Option Title</label>
                <input
                  className="inv-input"
                  placeholder={`e.g. Basic Package`}
                  value={currentOpt.title}
                  onChange={(e) => setOptionField(activeTab, "title", e.target.value)}
                />
              </div>
              <div>
                <label className="inv-label">Description (shown to customer)</label>
                <input
                  className="inv-input"
                  placeholder="What's included in this option…"
                  value={currentOpt.description}
                  onChange={(e) => setOptionField(activeTab, "description", e.target.value)}
                />
              </div>
            </div>

            {/* Line items */}
            <div style={{ marginBottom: 8 }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "3fr 80px 110px 100px 32px",
                gap: 8, marginBottom: 8
              }}>
                {["Description", "Qty", "Unit Price", "Discount", ""].map((h) => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", paddingLeft: 4 }}>{h}</div>
                ))}
              </div>

              {currentOpt.line_items.map((item, lineIdx) => {
                const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
                let disc = 0;
                if (item.discount_type === "%") disc = lineTotal * ((parseFloat(item.discount) || 0) / 100);
                else disc = parseFloat(item.discount) || 0;
                const net = lineTotal - disc;

                return (
                  <div key={lineIdx} style={{ display: "grid", gridTemplateColumns: "3fr 80px 110px 100px 32px", gap: 8, marginBottom: 8, alignItems: "center" }}>
                    <input
                      className="inv-input"
                      placeholder="Item description"
                      value={item.description}
                      onChange={(e) => setLineItem(activeTab, lineIdx, "description", e.target.value)}
                    />
                    <input
                      type="number"
                      className="inv-input"
                      min="0"
                      value={item.quantity}
                      onChange={(e) => setLineItem(activeTab, lineIdx, "quantity", e.target.value)}
                    />
                    <input
                      type="number"
                      className="inv-input"
                      min="0"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) => setLineItem(activeTab, lineIdx, "unit_price", e.target.value)}
                    />
                    <div style={{ display: "flex", gap: 4 }}>
                      <input
                        type="number"
                        className="inv-input"
                        min="0"
                        value={item.discount}
                        onChange={(e) => setLineItem(activeTab, lineIdx, "discount", e.target.value)}
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <select
                        className="inv-input"
                        value={item.discount_type}
                        onChange={(e) => setLineItem(activeTab, lineIdx, "discount_type", e.target.value)}
                        style={{ width: 44, padding: "6px 4px" }}
                      >
                        <option value="%">%</option>
                        <option value="$">$</option>
                      </select>
                    </div>
                    <button
                      onClick={() => removeLineItem(activeTab, lineIdx)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, padding: 0, lineHeight: 1 }}
                    >×</button>
                  </div>
                );
              })}

              <button
                onClick={() => addLineItem(activeTab)}
                style={{
                  marginTop: 8, border: "1px dashed #d1d5db", borderRadius: 8,
                  background: "none", padding: "8px 16px", cursor: "pointer",
                  fontSize: 13, color: "#6b7280", display: "flex", alignItems: "center", gap: 6
                }}
              >
                + Add Line Item
              </button>
            </div>

            {/* Totals */}
            <div style={{
              marginTop: 24, display: "flex", justifyContent: "flex-end"
            }}>
              <div style={{ width: 280 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14, color: "#6b7280" }}>
                  <span>Subtotal</span>
                  <span>${(totals.subtotal || 0).toFixed(2)}</span>
                </div>
                {totals.discount_total > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14, color: "#dc2626" }}>
                    <span>Discount</span>
                    <span>−${(totals.discount_total || 0).toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 14, color: "#6b7280" }}>
                  <span>Tax</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={currentOpt.tax_rate || ""}
                      onChange={(e) => setOptionField(activeTab, "tax_rate", e.target.value)}
                      placeholder="0"
                      style={{ width: 52, padding: "3px 6px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, textAlign: "right" }}
                    />
                    <span>%</span>
                    <span style={{ minWidth: 70, textAlign: "right" }}>${(totals.tax || 0).toFixed(2)}</span>
                  </div>
                </div>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  borderTop: "2px solid #e5e7eb", paddingTop: 12,
                  fontWeight: 700, fontSize: 18, color: "#111827"
                }}>
                  <span>Total</span>
                  <span>${(totals.total || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <label className="inv-label">Notes (visible to customer)</label>
        <textarea
          className="inv-input"
          rows={3}
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
          placeholder="Any additional terms, conditions, or notes for this quote…"
          style={{ resize: "vertical" }}
        />
      </div>

      {/* Bottom actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button className="inv-btn" onClick={() => navigate("/quotes")}>Cancel</button>
        <button className="inv-btn" onClick={() => handleSave("draft")} disabled={saving}>Save Draft</button>
        <button className="inv-btn inv-btn-primary" onClick={() => handleSave("draft")} disabled={saving}>
          {saving ? "Saving…" : "Save Quote"}
        </button>
      </div>
    </div>
  );
}
