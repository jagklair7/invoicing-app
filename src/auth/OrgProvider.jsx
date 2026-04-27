// src/auth/OrgProvider.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../app/supabaseClient";
import { useAuth } from "./AuthProvider";

const OrgContext = createContext();

export function OrgProvider({ children }) {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState([]);
  const [activeOrg, setActiveOrg] = useState(null);
  const [loading, setLoading] = useState(true);

  // load all orgs for user
  useEffect(() => {
    if (!user) return;

    const fetchOrgs = async () => {
      setLoading(true);

      const { data } = await supabase
        .from("organization_members")
        .select(`
          org_id,
          role,
          organizations:org_id (
            id,
            name
          )
        `)
        .eq("user_id", user.id);

      const mapped = data?.map((m) => ({
        orgId: m.org_id,
        name: m.organizations?.name,
        role: m.role,
      })) || [];

      setOrgs(mapped);

      // restore saved org OR default first
      const saved = localStorage.getItem("active_org");
      const defaultOrg = mapped.find(o => o.orgId === saved) || mapped[0];

      if (defaultOrg) {
        setActiveOrg(defaultOrg);
        localStorage.setItem("active_org", defaultOrg.orgId);
      }

      setLoading(false);
    };

    fetchOrgs();
  }, [user]);

  const switchOrg = (org) => {
    setActiveOrg(org);
    localStorage.setItem("active_org", org.orgId);
  };

  return (
    <OrgContext.Provider value={{
      orgs,
      activeOrg,
      switchOrg,
      loading
    }}>
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);