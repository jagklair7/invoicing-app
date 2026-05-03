import { useState, useEffect } from "react";
import { supabase } from "../app/supabaseClient";
import { useOrg } from "../context/OrgContext";
import { useNavigate } from "react-router-dom";

export default function CreateOrganization() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const { switchOrg, refresh: refreshOrgs } = useOrg();
  const navigate = useNavigate();

  // Check if user is authenticated
  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getUser();
      setIsAuthenticated(!!data?.user);
    };
    checkAuth();
  }, []);

  const createOrg = async () => {
    if (!name.trim()) {
      setError("Organization name is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData?.user?.id
  if (!userId) { navigate('/login'); return }

  const { data, error: fnErr } = await supabase
    .rpc('create_organization', { org_name: name.trim() })
  if (fnErr) throw new Error(fnErr.message)

  const org = typeof data === 'string' ? JSON.parse(data) : data

  const formatted = { orgId: org.id, name: org.name, role: 'owner' }
  switchOrg(formatted)
  await refreshOrgs()
  navigate('/')

} catch (err) {
  console.error('Create org error:', err)
  setError(err.message || 'Failed to create organization. Please try again.')
} finally {
  setLoading(false)
}
  };

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

        {error && <div style={styles.errorMsg}>{error}</div>}

        <button
          style={styles.button}
          onClick={createOrg}
          disabled={loading || !name.trim()}
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
    height: "80vh",
  },
  card: {
    width: "420px",
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
    marginBottom: "12px",
    border: "1.5px solid #e2e8f0",
    borderRadius: "8px",
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box',
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