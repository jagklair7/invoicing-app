import { useState, useEffect } from "react";
import { supabase } from "../app/supabaseClient";
import { useOrg } from "../context/OrgContext";
import { useNavigate } from "react-router-dom";
import { checkCanCreateOrg } from "../utils/planLimits";
import { useHelcimPay } from "../hooks/useHelcimPay";

// Same GST handling as Onboarding.jsx — keep the two in sync.
const GST_RATE = 0.05;
const calcGst = (base) => Math.round(base * GST_RATE * 100) / 100;
const calcTotal = (base) => Math.round(base * (1 + GST_RATE) * 100) / 100;

export default function CreateOrganization() {
  const [name, setName] = useState("");
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingPayment, setPendingPayment] = useState(null); // row from pending_org_payments, or null
  const [resuming, setResuming] = useState(false);

  const { switchOrg, refresh: refreshOrgs } = useOrg();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPlans = async () => {
      const { data, error: plansErr } = await supabase
        .from("plans")
        .select("*")
        .order("price_monthly", { ascending: true });
      if (!plansErr && data) {
        setPlans(data);
        const free = data.find(p => p.name === "free");
        setSelectedPlanId(free?.id || data[0]?.id || null);
      }
      setLoadingPlans(false);
    };
    fetchPlans();
    checkForPendingPayment();
  }, []);

  // If a previous attempt's payment succeeded but org creation didn't finish,
  // surface it so the user can resume without paying again.
  async function checkForPendingPayment() {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return;

    const { data } = await supabase
      .from("pending_org_payments")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) setPendingPayment(data);
  }

  async function onOrgCreated(org) {
    switchOrg({ orgId: org.id, name: org.name, role: "owner" });
    await refreshOrgs();
    navigate("/");
  }

  async function resolvePendingPayment(pendingPaymentId) {
    const { data, error: resolveErr } = await supabase
      .rpc("resolve_pending_org_payment", { pending_payment_id: pendingPaymentId });
    if (resolveErr) throw resolveErr;

    const org = typeof data === "string" ? JSON.parse(data) : data;
    await onOrgCreated(org);
  }

  async function handleResume() {
    if (!pendingPayment) return;
    setResuming(true);
    setError("");
    try {
      await resolvePendingPayment(pendingPayment.id);
    } catch (err) {
      setError(
        err.message ||
        "Still unable to finish setting up your organization. Your payment is safely on file — try again in a moment, or contact support."
      );
      setResuming(false);
    }
  }

  const selectedPlan = plans.find(p => p.id === selectedPlanId) || null;
  const baseAmount = selectedPlan?.price_monthly || 0;
  const gstAmount = calcGst(baseAmount);
  const totalAmount = calcTotal(baseAmount);
  const isPaidPlan = baseAmount > 0;

  async function finishFreeOrg() {
    try {
      const { data, error: fnErr } = await supabase
        .rpc("create_organization", {
          org_name: name.trim(),
          plan_id: selectedPlanId,
          helcim_transaction_id: null,
        });
      if (fnErr) throw new Error(fnErr.message);

      const org = typeof data === "string" ? JSON.parse(data) : data;
      await onOrgCreated(org);
    } catch (err) {
      console.error("Create org error:", err);
      setError(err.message || "Failed to create organization. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // NOTE: `txn?.transactionId` is the same assumed field name as Onboarding.jsx.
  async function handlePaymentSuccess(txn) {
    const transactionId = txn?.transactionId ?? txn?.data?.transactionId ?? null;
    if (!transactionId) {
      console.warn("Helcim payment succeeded but no transactionId was found on the payload:", txn);
      setError("Payment succeeded but we could not read the transaction reference. Contact support — do not pay again.");
      setLoading(false);
      return;
    }

    try {
      // Record the successful payment FIRST, as its own simple insert, before
      // the multi-table org creation. If org creation fails after this point
      // the payment is never lost — it sits as resumable.
      const { data: userData } = await supabase.auth.getUser();
      const { data: pending, error: insertErr } = await supabase
        .from("pending_org_payments")
        .insert({
          user_id: userData.user.id,
          org_name: name.trim(),
          plan_id: selectedPlanId,
          helcim_transaction_id: String(transactionId),
          amount: totalAmount,
          base_amount: baseAmount,
          gst_amount: gstAmount,
        })
        .select()
        .single();

      if (insertErr) {
        setError(
          `Payment succeeded (transaction ${transactionId}) but we could not save that to your account. ` +
          `Contact support with this transaction ID — do not pay again.`
        );
        setLoading(false);
        return;
      }

      await resolvePendingPayment(pending.id);

    } catch (err) {
      // Payment is safely recorded even though finishing org creation failed.
      await checkForPendingPayment();
      setError(
        err.message ||
        'Payment succeeded but we hit an error finishing setup. Your payment is on file — click "Resume setup" below to try again.'
      );
      setLoading(false);
    }
  }

  function handlePaymentError(msg) {
    setError(msg || "Payment failed. Your organization was not created.");
    setLoading(false);
  }

  const { openPayment: openHelcimPayment } = useHelcimPay({
    amount: selectedPlan?.price_monthly || 0,
    onSuccess: handlePaymentSuccess,
    onError: handlePaymentError,
  });

  const createOrg = async () => {
    if (!name.trim()) {
      setError("Organization name is required");
      return;
    }
    if (!selectedPlanId) {
      setError("Please select a plan");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) { setLoading(false); navigate("/login"); return; }

      const { allowed, reason } = await checkCanCreateOrg(userId);
      if (!allowed) {
        setLoading(false);
        return setError(reason);
      }

      if (isPaidPlan) {
        openHelcimPayment();
        return; // loading stays true until the payment callbacks fire
      }

      await finishFreeOrg();
    } catch (err) {
      console.error("Create org error:", err);
      setError(err.message || "Failed to create organization. Please try again.");
      setLoading(false);
    }
  };

  const fmtPrice = (n) => n === 0 ? 'Free' : `$${n}/mo`;
  const fmtLimit = (n, label) => n === -1 ? `Unlimited ${label}` : `${n} ${label}`;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Create Organization</h2>
        <p style={styles.subtitle}>Set up your first organization to start managing invoices.</p>

        {pendingPayment && (
          <div style={styles.resumeBox}>
            <div style={styles.resumeTitle}>Payment already received</div>
            <div style={styles.resumeBody}>
              We received your payment for "{pendingPayment.org_name}" but didn't finish setting up
              your organization. Click below to finish — you won't be charged again.
            </div>
            <button
              style={styles.resumeButton}
              onClick={handleResume}
              disabled={resuming}
            >
              {resuming ? "Finishing setup…" : "Resume setup →"}
            </button>
          </div>
        )}

        <input
          style={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Organization name"
          onKeyDown={(e) => e.key === 'Enter' && !loading && createOrg()}
        />

        <div style={styles.plansLabel}>Choose a plan</div>

        {loadingPlans ? (
          <div style={{ fontSize: 13, color: '#94a3b8', padding: '12px 0' }}>Loading plans…</div>
        ) : (
          <div style={styles.plansGrid}>
            {plans.map(p => {
              const isSelected = selectedPlanId === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPlanId(p.id)}
                  style={{
                    ...styles.planCard,
                    ...(isSelected ? styles.planCardSelected : {}),
                  }}
                >
                  <div style={{ ...styles.planName, ...(isSelected ? { color: 'white' } : {}) }}>
                    {p.name.charAt(0).toUpperCase() + p.name.slice(1)}
                  </div>
                  <div style={{ ...styles.planPrice, ...(isSelected ? { color: 'rgba(255,255,255,0.85)' } : {}) }}>
                    {fmtPrice(p.price_monthly)}
                  </div>
                  <div style={{ ...styles.planFeature, ...(isSelected ? { color: 'rgba(255,255,255,0.75)' } : {}) }}>
                    {fmtLimit(p.max_employees, 'employees')}
                  </div>
                  <div style={{ ...styles.planFeature, ...(isSelected ? { color: 'rgba(255,255,255,0.75)' } : {}) }}>
                    {fmtLimit(p.max_invoices, 'invoices')}
                  </div>
                  <div style={{ ...styles.planFeature, ...(isSelected ? { color: 'rgba(255,255,255,0.75)' } : {}) }}>
                    {fmtLimit(p.max_orgs, 'orgs')}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isPaidPlan && (
          <div style={styles.summaryBox}>
            <div style={styles.summaryRow}>
              <span>Subtotal</span><span>${baseAmount.toFixed(2)}</span>
            </div>
            <div style={{ ...styles.summaryRow, color: '#64748b' }}>
              <span>GST (5%)</span><span>${gstAmount.toFixed(2)}</span>
            </div>
            <div style={styles.summaryTotal}>
              <span>Total (charged monthly)</span><span>${totalAmount.toFixed(2)}</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
              Refundable within 15 days.
            </div>
          </div>
        )}

        {error && <div style={styles.errorMsg}>{error}</div>}

        <button
          style={styles.button}
          onClick={createOrg}
          disabled={loading || resuming || !name.trim() || !selectedPlanId}
        >
          {loading
            ? (isPaidPlan ? "Processing payment…" : "Creating...")
            : (isPaidPlan ? `Continue to payment ($${totalAmount.toFixed(2)}) →` : "Create Organization")}
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "80vh",
    padding: "20px",
  },
  card: {
    width: "600px",
    maxWidth: "100%",
    padding: "30px",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    background: "#fff",
    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    color: "#1e293b",
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 6,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    marginTop: "18px",
    marginBottom: "20px",
    border: "1.5px solid #e2e8f0",
    borderRadius: "8px",
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box',
  },
  plansLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#94a3b8',
    marginBottom: 10,
  },
  plansGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 10,
    marginBottom: 20,
  },
  planCard: {
    padding: '14px 12px',
    borderRadius: 10,
    border: '1.5px solid #e2e8f0',
    background: '#fff',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  planCardSelected: {
    background: '#0d7377',
    borderColor: '#0d7377',
  },
  planName: {
    fontSize: 14,
    fontWeight: 700,
    color: '#1e293b',
    marginBottom: 6,
  },
  planPrice: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 10,
  },
  planFeature: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 3,
  },
  summaryBox: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 20,
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '12px 14px',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  summaryTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    fontWeight: 700,
    color: '#0f172a',
    marginTop: 6,
    paddingTop: 6,
    borderTop: '1px solid #e2e8f0',
  },
  resumeBox: {
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: 10,
    padding: '16px 18px',
    marginTop: 18,
  },
  resumeTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#92400e',
    marginBottom: 4,
  },
  resumeBody: {
    fontSize: 13,
    color: '#78350f',
    lineHeight: 1.5,
    marginBottom: 12,
  },
  resumeButton: {
    width: '100%',
    padding: '11px 18px',
    background: '#d97706',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
  },
  errorMsg: {
    fontSize: 12,
    color: "#e53e3e",
    marginBottom: "12px",
    padding: "8px 10px",
    background: "#fff5f5",
    border: "1px solid #fecaca",
    borderRadius: "6px",
  },
  button: {
    width: "100%",
    padding: "11px 18px",
    background: "#0d7377",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    transition: 'background 0.15s',
  }
};