import { useState, useEffect } from "react";
import { supabase } from "../app/supabaseClient";
import { useOrg } from "../context/OrgContext";
import { useNavigate } from "react-router-dom";

export default function CreateOrganization() {
  const [name, setName] = useState("");
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
  }, []);

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
      if (!userId) { navigate('/login'); return; }

      const { data, error: fnErr } = await supabase
        .rpc('create_organization', { org_name: name.trim(), plan_id: selectedPlanId });
      if (fnErr) throw new Error(fnErr.message);

      const org = typeof data === 'string' ? JSON.parse(data) : data;

      const formatted = { orgId: org.id, name: org.name, role: 'owner' };
      switchOrg(formatted);
      await refreshOrgs();
      navigate('/');

    } catch (err) {
      console.error('Create org error:', err);
      setError(err.message || 'Failed to create organization. Please try again.');
    } finally {
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

        {error && <div style={styles.errorMsg}>{error}</div>}

        <button
          style={styles.button}
          onClick={createOrg}
          disabled={loading || !name.trim() || !selectedPlanId}
        >
          {loading ? "Creating..." : "Create Organization"}
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