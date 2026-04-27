// src/hooks/usePermissions.js
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useOrg } from "./OrgProvider";
import { useAuth } from "./AuthProvider";

export function usePermissions() {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState(null);
  const { activeOrg } = useOrg();

  const { user } = useAuth();

  const role = activeOrg?.role;
  useEffect(() => {
    const fetchRole = async () => {
      setLoading(true);

      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) return;

      // get active org (you can replace this with your org switcher later)
      const { data: membership } = await supabase
        .from("organization_members")
        .select("role, org_id")
        .eq("user_id", user.user.id)
        .single();

      setRole(membership?.role || null);
      setOrgId(membership?.org_id || null);
      setLoading(false);
    };

    fetchRole();
  }, []);

  // helper functions
  const isOwner = role === "owner";
  const isAdmin = role === "admin" || role === "owner";
  const isMember = role === "member" || isAdmin;

  return {
    role,
    orgId:activeOrg?.orgId,
    loading,

    // role checks
    isOwner: role === "owner",
    isAdmin: role === "admin" || role === "owner",
    isMember,

    userId: user?.id,

    // action permissions
    canEditOrg: isOwner,
    canManageMembers: isOwner || isAdmin,
    canCreateInvoice: true,
    canEditAnyInvoice: role === "admin" || role === "owner",
    canDeleteInvoice: isOwner,
  };
}
export function canEditInvoice(invoice, user, permissions) {
  if (!invoice || !user) return false;

  return (
    permissions.isAdmin ||
    permissions.isOwner ||
    invoice.user_id === user.id
  );
}