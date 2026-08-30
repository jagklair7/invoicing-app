import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../app/supabaseClient";

export default function QuotePublic() {
  const { token } = useParams();
  const [quote, setQuote] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadQuote();
  }, [token]);

  async function loadQuote() {
    setLoading(true);
    const { data, error } = await supabase
      .from("quotes")
      .select("*, customers(id, name, email)")
      .eq("customer_token", token)
      .single();

    if (error || !data) {
      setError("This quote could not be found or may have expired.");
      setLoading(false);
      return;
    }

    setQuote(data);
    setCustomer(data.customers);
    if (data.selected_options?.length) setSelected(data.selected_options[0]);
    if (data.status === "approved") setSubmitted(true);

    const { data: orgSettings } = await supabase
      .from("organization_settings")
      .select("company_name, company_email, company_phone, company_address, company_logo_url")
      .eq("org_id", data.org_id)
      .single();
    setOrg(orgSettings);

    setLoading(false);
  }

  async function handleApprove() {
    if (!selected) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("quotes")
      .update({ selected_options: [selected], status: "approved" })
      .eq("customer_token", token);

    if (!error) {
      setSubmitted(true);
      setQuote((q) => ({ ...q, selected_options: [selected], status: "approved" }));
    }
    setSubmitting(false);
  }

  async function handleDecline() {
    setSubmitting(true);
    await supabase
      .from("quotes")
      .update({ status: "declined" })
      .eq("customer_token", token);
    setQuote((q) => ({ ...q, status: "declined" }));
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}>
        <div style={{ color: "#9ca3af", fontSize: 16 }}>Loading your quote…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <h2 style={{ color: "#111827", marginBottom: 8 }}>Quote not found</h2>
          <p style={{ color: "#6b7280" }}>{error}</p>
        </div>
      </div>
    );
  }

  const isExpired = quote.expiry_date && new Date(quote.expiry_date) < new Date();
  const isDeclined = quote.status === "declined";

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "20px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            {org?.company_logo_url && (
              <img src={org.company_logo_url} alt={org?.company_name} style={{ height: 36, objectFit: "contain", marginBottom: 4 }} />
            )}
            <div style={{ fontWeight: 700, fontSize: 18, color: "#111827" }}>{org?.company_name}</div>
            {org?.company_email && <div style={{ fontSize: 13, color: "#6b7280" }}>{org.company_email}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>Quote</div>
            <div style={{ fontWeight: 700, fontSize: 20, color: "#111827" }}>{quote.quote_number}</div>
            {quote.expiry_date && (
              <div style={{ fontSize: 12, color: isExpired ? "#dc2626" : "#6b7280", marginTop: 2 }}>
                {isExpired ? "Expired" : "Expires"} {quote.expiry_date}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
        {/* Status banners */}
        {submitted && (
          <div style={{
            background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12,
            padding: "20px 24px", marginBottom: 28, display: "flex", alignItems: "center", gap: 16
          }}>
            <div style={{ fontSize: 32 }}>✅</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#15803d" }}>Quote Approved!</div>
              <div style={{ fontSize: 14, color: "#166534", marginTop: 2 }}>
                You selected Option {quote.selected_options?.[0]}. We'll be in touch shortly.
              </div>
            </div>
          </div>
        )}

        {isDeclined && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12,
            padding: "20px 24px", marginBottom: 28
          }}>
            <div style={{ fontWeight: 700, color: "#dc2626" }}>Quote Declined</div>
            <div style={{ fontSize: 14, color: "#991b1b", marginTop: 2 }}>This quote has been declined.</div>
          </div>
        )}

        {isExpired && !submitted && !isDeclined && (
          <div style={{
            background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12,
            padding: "16px 20px", marginBottom: 24
          }}>
            <div style={{ fontWeight: 600, color: "#92400e", fontSize: 14 }}>⚠️ This quote has expired. Please contact us for an updated quote.</div>
          </div>
        )}

        {/* Greeting */}
        {customer?.name && (
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 4 }}>
              Hi {customer.name.split(" ")[0]},
            </h2>
            <p style={{ color: "#6b7280", fontSize: 15, margin: 0 }}>
              Please review the options below and select the one that best fits your needs.
              {!submitted && !isDeclined && !isExpired && " Click Approve Quote when you're ready."}
            </p>
          </div>
        )}

        {/* Option cards */}
        <div style={{ display: "grid", gap: 20, marginBottom: 32 }}>
          {quote.options?.map((opt) => {
            const isSelected = selected === opt.label;
            const isApproved = submitted && quote.selected_options?.includes(opt.label);
            const canSelect = !submitted && !isDeclined && !isExpired;

            return (
              <div
                key={opt.label}
                onClick={() => canSelect && setSelected(opt.label)}
                style={{
                  background: "#fff",
                  border: `2px solid ${isApproved ? "#16a34a" : isSelected ? "#4f46e5" : "#e5e7eb"}`,
                  borderRadius: 16,
                  overflow: "hidden",
                  cursor: canSelect ? "pointer" : "default",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  boxShadow: isSelected ? "0 0 0 4px rgba(79,70,229,0.1)" : "none",
                }}
              >
                {/* Option header */}
                <div style={{
                  padding: "18px 24px",
                  background: isApproved ? "#f0fdf4" : isSelected ? "#f5f3ff" : "#f9fafb",
                  borderBottom: "1px solid #e5e7eb",
                  display: "flex", alignItems: "center", justifyContent: "space-between"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, display: "flex",
                      alignItems: "center", justifyContent: "center",
                      background: isApproved ? "#16a34a" : isSelected ? "#4f46e5" : "#e5e7eb",
                      color: (isApproved || isSelected) ? "#fff" : "#374151",
                      fontWeight: 800, fontSize: 16
                    }}>{opt.label}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>
                        Option {opt.label}{opt.title ? ` — ${opt.title}` : ""}
                      </div>
                      {opt.description && (
                        <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{opt.description}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: isApproved ? "#16a34a" : isSelected ? "#4f46e5" : "#111827" }}>
                      ${(opt.total || 0).toLocaleString("en-CA", { minimumFractionDigits: 2 })}
                    </div>
                    {isApproved && <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>✓ Approved</div>}
                    {isSelected && !isApproved && <div style={{ fontSize: 12, color: "#4f46e5", fontWeight: 600 }}>Selected</div>}
                  </div>
                </div>

                {/* Line items */}
                <div style={{ padding: "16px 24px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {opt.line_items?.map((item, i) => {
                        const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
                        let disc = 0;
                        if (item.discount_type === "%") disc = lineTotal * ((parseFloat(item.discount) || 0) / 100);
                        else disc = parseFloat(item.discount) || 0;
                        const net = lineTotal - disc;

                        return (
                          <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "8px 0", fontSize: 14, color: "#111827" }}>{item.description}</td>
                            <td style={{ padding: "8px 0", fontSize: 13, color: "#9ca3af", textAlign: "right", paddingRight: 12 }}>
                              {item.quantity} × ${parseFloat(item.unit_price || 0).toFixed(2)}
                            </td>
                            <td style={{ padding: "8px 0", fontSize: 14, fontWeight: 600, color: "#111827", textAlign: "right", whiteSpace: "nowrap" }}>
                              {disc > 0 && (
                                <span style={{ fontSize: 12, color: "#dc2626", marginRight: 6, textDecoration: "line-through" }}>
                                  ${lineTotal.toFixed(2)}
                                </span>
                              )}
                              ${net.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Totals */}
                  <div style={{ marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ width: 220 }}>
                      {opt.discount_total > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#dc2626", marginBottom: 4 }}>
                          <span>Discount</span><span>−${opt.discount_total.toFixed(2)}</span>
                        </div>
                      )}
                      {opt.tax > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
                          <span>Tax</span><span>${opt.tax.toFixed(2)}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, color: "#111827", paddingTop: 4 }}>
                        <span>Total</span><span>${(opt.total || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Notes */}
        {quote.notes && (
          <div style={{
            background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
            padding: "16px 20px", marginBottom: 28
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Notes</div>
            <div style={{ fontSize: 14, color: "#374151", whiteSpace: "pre-wrap" }}>{quote.notes}</div>
          </div>
        )}

        {/* Action buttons */}
        {!submitted && !isDeclined && !isExpired && (
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={handleDecline}
              disabled={submitting}
              style={{
                padding: "12px 28px", borderRadius: 10, border: "1px solid #e5e7eb",
                background: "#fff", color: "#6b7280", fontSize: 15, fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Decline
            </button>
            <button
              onClick={handleApprove}
              disabled={!selected || submitting}
              style={{
                padding: "12px 36px", borderRadius: 10, border: "none",
                background: selected ? "#4f46e5" : "#e5e7eb",
                color: selected ? "#fff" : "#9ca3af",
                fontSize: 15, fontWeight: 700,
                cursor: selected ? "pointer" : "not-allowed",
                transition: "background 0.15s"
              }}
            >
              {submitting ? "Submitting…" : selected ? `Approve — Option ${selected}` : "Select an option to approve"}
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 48, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
          Issued {quote.issue_date}{quote.expiry_date ? ` · Expires ${quote.expiry_date}` : ""}
          {org?.company_name && ` · ${org.company_name}`}
        </div>
      </div>
    </div>
  );
}