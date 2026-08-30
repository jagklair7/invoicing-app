import { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../app/supabaseClient";
import { useOrg } from "../context/OrgContext";
import SuspendedBanner from '../components/SuspendedBanner'

const statusColor = {
  draft: { bg: "#f3f4f6", color: "#6b7280" },
  sent: { bg: "#eff6ff", color: "#3b82f6" },
  approved: { bg: "#f0fdf4", color: "#16a34a" },
  declined: { bg: "#fef2f2", color: "#dc2626" },
  converted: { bg: "#faf5ff", color: "#7c3aed" },
};

export default function Quotes() {
 // const { activeOrg } = useContext(OrgContext);
  const { activeOrg, isSuspended } = useOrg();
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (!activeOrg?.orgId) return;
    fetchQuotes();
  }, [activeOrg?.orgId]);

  async function fetchQuotes() {
  setLoading(true);
  const { data, error } = await supabase
    .from("quotes")
    .select(`
      id, quote_number, status, issue_date, expiry_date,
      selected_options, options, notes, customer_token,
      customers (id, name, email)
    `)
    .eq("org_id", activeOrg.orgId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error('fetchQuotes error:', error);
  }
  setQuotes(data || []);
  setLoading(false);
}

  async function deleteQuote(quote) {
    if (!window.confirm(`Delete quote ${quote.quote_number}? This cannot be undone.`)) return;
    const { error } = await supabase
      .from("quotes")
      .delete()
      .eq("id", quote.id)
      .eq("org_id", activeOrg.orgId);
    if (error) {
      alert('Failed to delete quote: ' + error.message);
      return;
    }
    fetchQuotes();
  }

  const filtered = quotes.filter((q) => {
    const matchSearch =
      q.quote_number?.toLowerCase().includes(search.toLowerCase()) ||
      q.customers?.name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || q.status === statusFilter;
    return matchSearch && matchStatus;
  });

  function getTotal(quote) {
  if (!quote.options?.length) return 0;
  if (quote.selected_options?.length) {
    const total = quote.options
      .filter(o => quote.selected_options.includes(o.label))
      .reduce((sum, o) => sum + (o.total ?? 0), 0);
    return total;
  }
  // Show range if no option selected
  const totals = quote.options.map((o) => o.total ?? 0);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  if (min === max) return min;
  return `$${min.toLocaleString("en-CA", { minimumFractionDigits: 2 })} – $${max.toLocaleString("en-CA", { minimumFractionDigits: 2 })}`;
}

  function formatTotal(quote) {
    const val = getTotal(quote);
    if (typeof val === "string") return val;
    return `$${Number(val).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`;
  }

  return (
    <div style={{ padding: "32px 24px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>Quotes</h1>
          <p style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
            Send multi-option quotes and let customers choose
          </p>
        </div>
        <button
          className="inv-btn inv-btn-primary"
          onClick={() => navigate("/quotes/new") }
          disabled={isSuspended}>
          + New Quote
        </button>
      </div>

       <SuspendedBanner />

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search by quote # or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="inv-input"
          style={{ flex: 1, minWidth: 200, maxWidth: 340 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="inv-input"
          style={{ width: 160 }}
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
          <option value="converted">Converted</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>Loading quotes…</div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 60, color: "#9ca3af",
          border: "2px dashed #e5e7eb", borderRadius: 12
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 600, color: "#374151", marginBottom: 6 }}>No quotes yet</div>
          <div style={{ fontSize: 14, marginBottom: 20 }}>Create your first quote with multiple options for your customer to choose from.</div>
          <button className="inv-btn inv-btn-primary" onClick={() => navigate("/quotes/new")} disabled={isSuspended}>
            + New Quote
          </button>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {["Quote #", "Customer", "Options", "Total", "Issued", "Expires", "Status", ""].map((h) => (
                  <th key={h} style={{
                    padding: "12px 16px", textAlign: "left", fontSize: 12,
                    fontWeight: 600, color: "#6b7280", textTransform: "uppercase",
                    letterSpacing: "0.05em", whiteSpace: "nowrap"
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((q, i) => {
                const sc = statusColor[q.status] || statusColor.draft;
                return (
                  <tr
                    key={q.id}
                    onClick={() => navigate(`/quotes/${q.id}`)}
                    style={{
                      borderBottom: i < filtered.length - 1 ? "1px solid #f3f4f6" : "none",
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#f9fafb"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "14px 16px", fontWeight: 600, color: "#111827", fontSize: 14 }}>
                      {q.quote_number}
                    </td>
                    <td style={{ padding: "14px 16px", color: "#374151", fontSize: 14 }}>
                      <div>{q.customers?.name || <span style={{ color: "#9ca3af" }}>No customer</span>}</div>
                      {q.customers?.email && (
                        <div style={{ fontSize: 12, color: "#9ca3af" }}>{q.customers.email}</div>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {(q.options || []).map((opt) => (
                          <span key={opt.label} style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 24, height: 24, borderRadius: 6,
                            background: (q.selected_options || []).includes(opt.label) ? "#4f46e5" : "#e5e7eb",
                            color: (q.selected_options || []).includes(opt.label) ? "#fff" : "#374151",
                            fontSize: 11, fontWeight: 700
                          }}>
                            {opt.label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: 600, color: "#111827", fontSize: 14, whiteSpace: "nowrap" }}>
                      {formatTotal(q)}
                    </td>
                    <td style={{ padding: "14px 16px", color: "#6b7280", fontSize: 13, whiteSpace: "nowrap" }}>
                      {q.issue_date}
                    </td>
                    <td style={{ padding: "14px 16px", color: "#6b7280", fontSize: 13, whiteSpace: "nowrap" }}>
                      {q.expiry_date || "—"}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{
                        padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                        background: sc.bg, color: sc.color, textTransform: "capitalize"
                      }}>
                        {q.status}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button
                          className="inv-btn"
                          style={{ fontSize: 12, padding: "4px 10px" }}
                          onClick={() => navigate(`/quotes/${q.id}`)}
                        >
                          View
                        </button>
                        <button
                          className="inv-btn"
                          style={{ fontSize: 12, padding: "4px 10px", color: "#dc2626", borderColor: "#fecaca" }}
                          onClick={() => deleteQuote(q)}
                          disabled={isSuspended}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary bar */}
      {filtered.length > 0 && (
        <div style={{ marginTop: 16, display: "flex", gap: 24, fontSize: 13, color: "#6b7280" }}>
          <span>{filtered.length} quote{filtered.length !== 1 ? "s" : ""}</span>
          {["draft", "sent", "approved"].map((s) => {
            const count = filtered.filter((q) => q.status === s).length;
            if (!count) return null;
            return (
              <span key={s} style={{ color: statusColor[s].color }}>
                {count} {s}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
