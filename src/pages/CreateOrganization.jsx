import { useState } from "react";
import { supabase } from "../app/supabaseClient";
import { useOrg } from "../context/OrgContext";
import { useNavigate } from "react-router-dom";

export default function CreateOrganization() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { switchOrg } = useOrg();
  const navigate = useNavigate();

  const createOrg = async () => {
    if (!name.trim()) return;

    setLoading(true);

    try {
      // OPTION A: if you created RPC function
      const { data, error } = await supabase.rpc("create_organization", {
        org_name: name
      });

      if (error) throw error;

      // data = new org id
      const orgId = data;

      // fetch full org info
      const { data: org } = await supabase
        .from("organization_members")
        .select("org_id, role, organizations:org_id(id,name)")
        .eq("org_id", orgId)
        .single();

      const formatted = {
        orgId: org.org_id,
        name: org.organizations.name,
        role: org.role
      };

      // switch org immediately
      switchOrg(formatted);

      // redirect
      navigate("/dashboard");

    } catch (err) {
      console.error(err);
      alert("Failed to create organization");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2>Create Organization</h2>

        <input
          style={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Organization name"
        />

        <button
          style={styles.button}
          onClick={createOrg}
          disabled={loading}
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
    width: "400px",
    padding: "30px",
    border: "1px solid #ddd",
    borderRadius: "10px",
    background: "#fff",
  },
  input: {
    width: "100%",
    padding: "10px",
    marginTop: "15px",
    marginBottom: "15px",
    border: "1px solid #ccc",
    borderRadius: "6px",
  },
  button: {
    width: "100%",
    padding: "10px",
    background: "#111",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  }
};