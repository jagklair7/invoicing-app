// src/auth/useOrg.js
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "./AuthProvider";

export function useOrg() {
  const { user } = useAuth();
  const [org, setOrg] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchOrg = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("organization_members")
        .select("org_id, role")
        .eq("user_id", user.id)
        .single();

      if (!error && data) {
        setOrg(data.org_id);
        setRole(data.role);
      }

      setLoading(false);
    };

    fetchOrg();
  }, [user]);

  return {
    orgId: org,
    role,
    loading,
  };
}